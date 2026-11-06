##
# app/services/insights/first_response_daily.rb
#
# Tempo de primeira resposta + transbordo humano, para as conversas CRIADAS no dia.
#
# Devolve SOMAS + CONTAGENS, nunca médias: o dashboard agrega vários dias e
# média de médias é errada (um dia com 2 conversas pesaria igual a um dia com 500).
#
# Definição de primeira resposta: delta entre a primeira mensagem `role: 'user'`
# da conversa e a primeira mensagem de saída POSTERIOR a ela. Classifica como
# 'human' ou 'automation' por Insights::MessageAuthorship. Campanha não responde
# ninguém: fica fora, e bolhas `widget_proactive` também.
#
# Escopa por `created_at` da conversa, portanto é correto para QUALQUER dia,
# inclusive histórico (ver Insights::Rollups::OperationalMetricsBackfill).
#
module Insights
  class FirstResponseDaily
    # Conversa aberta perto da meia-noite costuma ser respondida no dia seguinte.
    # Sem lookahead ela cairia fora do numerador E do denominador.
    # 2h e não mais: o cron `backfill_dashboard_daily` roda às 02:15.
    RESPONSE_LOOKAHEAD = 2.hours

    # Conversas por lote no `$in`. As métricas são todas somas/contagens, logo
    # aditivas: dividir em lotes não introduz erro estatístico.
    CHUNK_SIZE = 20_000

    RESULT_KEYS = %w[automation_sum automation_count human_sum human_count human_touch automation_only].freeze

    attr_reader :organization_id, :range

    # @param organization_id [String]
    # @param range [Range<Time>] período half-open (from...to)
    def initialize(organization_id:, range:)
      @organization_id = organization_id.to_s
      @range = range
    end

    def to_h
      row = result

      {
        first_response_automation_seconds_sum: row["automation_sum"].to_f.round(2),
        first_response_automation_count: row["automation_count"].to_i,
        first_response_human_seconds_sum: row["human_sum"].to_f.round(2),
        first_response_human_count: row["human_count"].to_i,
        chats_with_human_touch: row["human_touch"].to_i,
        chats_handled_by_automation: row["automation_only"].to_i
      }
    end

    private

    def from
      range.first
    end

    def to
      range.last
    end

    def chat_ids
      @chat_ids ||= Chat
                    .where(organization_id: organization_id)
                    .valid_records
                    .where(:created_at.gte => from, :created_at.lt => to)
                    .pluck(:id)
    end

    def result
      @result ||= chat_ids.each_slice(CHUNK_SIZE).reduce(blank_result) do |acc, ids|
        row = ChatMessage::Base.collection
                               .aggregate(pipeline(ids), allow_disk_use: true)
                               .first || {}

        acc.merge(row.slice(*RESULT_KEYS)) { |_key, current, value| current + value.to_f }
      end
    end

    def blank_result
      RESULT_KEYS.index_with { 0 }
    end

    def pipeline(ids)
      [
        {
          # As guardas reproduzem o default_scope do modelo, que
          # `.collection.aggregate` ignora: ver Insights::MessageAuthorship.
          "$match" => {
            "chat_id" => { "$in" => ids },
            "created_at" => { "$gte" => from, "$lt" => to + RESPONSE_LOOKAHEAD }
          }.merge(MessageAuthorship.match_guards)
        },

        { "$addFields" => { "kind" => MessageAuthorship.kind_switch } },
        { "$match" => { "kind" => { "$ne" => nil } } },

        {
          "$group" => {
            "_id" => "$chat_id",
            # $min ignora nulls => primeira mensagem do contato.
            "first_user_at" => {
              "$min" => { "$cond" => [ { "$eq" => [ "$kind", "user" ] }, "$created_at", nil ] }
            },
            # Transbordo: 1 se em algum momento houve mensagem de pessoa.
            "human_touch" => {
              "$max" => { "$cond" => [ { "$eq" => [ "$kind", "human" ] }, 1, 0 ] }
            },
            "automation_touch" => {
              "$max" => { "$cond" => [ { "$eq" => [ "$kind", "automation" ] }, 1, 0 ] }
            },
            # Só as saídas. Cardinalidade por conversa na casa das dezenas.
            "outbound" => {
              "$push" => {
                "$cond" => [
                  { "$in" => [ "$kind", %w[automation human] ] },
                  { "t" => "$created_at", "k" => "$kind" },
                  nil
                ]
              }
            }
          }
        },

        # Primeira saída POSTERIOR à primeira mensagem do contato.
        # `$min` sobre array de documentos usa comparação BSON campo a campo na
        # ordem declarada; como 't' vem primeiro, o mínimo é o mais antigo por
        # data. Isso dispensa um `$sort` global: o estágio caro e sujeito a spill.
        {
          "$addFields" => {
            "first_response" => {
              "$min" => {
                "$filter" => {
                  "input" => "$outbound",
                  "as" => "o",
                  "cond" => {
                    "$and" => [
                      { "$ne" => [ "$$o", nil ] },
                      { "$ne" => [ { "$ifNull" => [ "$first_user_at", nil ] }, nil ] },
                      { "$gte" => [ "$$o.t", "$first_user_at" ] }
                    ]
                  }
                }
              }
            }
          }
        },

        {
          "$group" => {
            "_id" => nil,
            "automation_sum" => { "$sum" => { "$cond" => [ automation_response, delta_seconds, 0 ] } },
            "automation_count" => { "$sum" => { "$cond" => [ automation_response, 1, 0 ] } },
            "human_sum" => { "$sum" => { "$cond" => [ human_response, delta_seconds, 0 ] } },
            "human_count" => { "$sum" => { "$cond" => [ human_response, 1, 0 ] } },
            "human_touch" => { "$sum" => "$human_touch" },
            "automation_only" => { "$sum" => { "$cond" => [ { "$and" => [ { "$eq" => [ "$automation_touch", 1 ] }, { "$eq" => [ "$human_touch", 0 ] } ] }, 1, 0 ] } }
          }
        }
      ]
    end

    def automation_response
      { "$eq" => [ "$first_response.k", "automation" ] }
    end

    def human_response
      { "$eq" => [ "$first_response.k", "human" ] }
    end

    # `$subtract` entre duas datas devolve milissegundos (Long).
    def delta_seconds
      { "$divide" => [ { "$subtract" => [ "$first_response.t", "$first_user_at" ] }, 1000.0 ] }
    end
  end
end
