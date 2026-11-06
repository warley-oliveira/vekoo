##
# app/services/insights/message_volume_daily.rb
#
# Volume de mensagens de um dia, para uma organização: totais por autoria, ranking de quem atende,
# conversas ativas, conversas atendidas pela automação, fora do horário e distribuição por hora.
#
# Contamos MENSAGENS CRIADAS no dia, independentemente de quando a conversa nasceu.
#
# É uma agregação só, e substitui `ConversationAnalytics` e `ConversationStats` da origem, que faziam
# `$lookup` sobre TODAS as conversas da organização a cada chamada, ou `pluck` de todos os ids para um
# `$in`. Numa organização grande, cada uma daquelas consultas varria o histórico inteiro.
#
# Delimitação do conjunto de conversas (servida pelo índice { organization_id: 1, last_message_at: -1 }):
#   last_message_at >= from  E  last_message_at < to + LAST_MESSAGE_SLACK  E  created_at < to
#
# O limite superior mantém o range do índice apertado, e por isso este serviço só é válido para dias
# RECENTES. Ver `.stale?`; dias históricos são tratados por Insights::Rollups::OperationalMetricsBackfill,
# que simplesmente não invoca esta classe.
#
module Insights
  class MessageVolumeDaily
    LAST_MESSAGE_SLACK = 1.day

    # Tamanho do ranking gravado no jsonb. Evita linha gigante em organização com centenas de
    # atendentes; a cauda longa não é exibida no dashboard.
    ACCOUNT_RANKING_LIMIT = 100

    attr_reader :organization_id, :range, :zone

    # @param organization_id [String]
    # @param range [Range<Time>] período half-open (from...to)
    # @param zone [ActiveSupport::TimeZone] o fuso da organização
    def initialize(organization_id:, range:, zone:)
      @organization_id = organization_id.to_s
      @range = range
      @zone = zone
    end

    # Verdadeiro quando o dia já saiu da janela em que o filtro por `last_message_at` é confiável.
    def self.stale?(range)
      Time.current > range.last + LAST_MESSAGE_SLACK
    end

    def self.blank_result
      {
        messages_inbound: 0,
        messages_sent_by_automation: 0,
        messages_sent_by_campaign: 0,
        messages_sent_by_human: 0,
        out_of_hours_messages: 0,
        active_chats: 0,
        automation_chats: 0,
        messages_by_account: {},
        hourly: {}
      }
    end

    def to_h
      if self.class.stale?(range)
        Rails.logger.warn(
          "[Insights::MessageVolumeDaily] #{range.first.to_date} fora da janela confiável " \
          "(last_message_at + #{LAST_MESSAGE_SLACK.inspect}); devolvendo vazio organização=#{organization_id}"
        )
        return self.class.blank_result
      end

      raw = Chat.collection.aggregate(pipeline, allow_disk_use: true).first || {}
      totals = raw.dig("totals", 0) || {}

      {
        messages_inbound: totals["inbound"].to_i,
        messages_sent_by_automation: totals["automation"].to_i,
        messages_sent_by_campaign: totals["campaign"].to_i,
        messages_sent_by_human: totals["human"].to_i,
        out_of_hours_messages: totals["out_of_hours"].to_i,
        active_chats: raw.dig("active_chats", 0, "n").to_i,
        automation_chats: raw.dig("automation_chats", 0, "n").to_i,
        messages_by_account: bucketize(raw["by_account"]),
        hourly: bucketize(raw["hourly"])
      }
    end

    private

    def from
      range.first
    end

    def to
      range.last
    end

    # [{ '_id' => 'uuid', 'c' => 40 }] => { 'uuid' => 40 }
    # Chaves como String: o jsonb do Postgres só tem chaves string, então já
    # gravamos no formato em que serão lidas de volta.
    def bucketize(rows)
      Array(rows).each_with_object({}) do |row, acc|
        next if row["_id"].nil?

        acc[row["_id"].to_s] = row["c"].to_i
      end
    end

    def pipeline
      [
        # 1) Conversas com atividade na janela (índice organização + last_message_at).
        {
          "$match" => {
            "organization_id" => organization_id,
            "last_message_at" => { "$gte" => from, "$lt" => to + LAST_MESSAGE_SLACK },
            "created_at" => { "$lt" => to },
            "external_id" => { "$ne" => Chat::TEST_EXTERNAL_ID }
          }
        },
        { "$project" => { "_id" => 1 } },

        # 2) Join indexado em { chat_id: 1, created_at: -1, _id: -1 }.
        #    `$lookup` seguido imediatamente de `$unwind` é otimizado pelo servidor
        #    para join em streaming, o que evita o teto de 16MB do array `as`.
        {
          "$lookup" => {
            "from" => ChatMessage::Base.collection.name,
            "localField" => "_id",
            "foreignField" => "chat_id",
            "as" => "m",
            "pipeline" => [
              {
                # As guardas reproduzem o default_scope do modelo, que
                # `.collection.aggregate` ignora: ver Insights::MessageAuthorship.
                "$match" => {
                  "created_at" => { "$gte" => from, "$lt" => to }
                }.merge(MessageAuthorship.match_guards)
              },
              { "$project" => MessageAuthorship.projection }
            ]
          }
        },
        { "$unwind" => "$m" },
        { "$replaceRoot" => { "newRoot" => "$m" } },

        # 3) `$facet`: as agregações compartilham o MESMO stream de entrada.
        #    Com `$group` separados o join (custo dominante) seria refeito a cada um.
        {
          "$facet" => {
            "totals" => [
              {
                "$group" => {
                  "_id" => nil,
                  "inbound" => { "$sum" => { "$cond" => [ MessageAuthorship.inbound_cond, 1, 0 ] } },
                  "human" => { "$sum" => { "$cond" => [ MessageAuthorship.human_cond, 1, 0 ] } },
                  "campaign" => { "$sum" => { "$cond" => [ MessageAuthorship.campaign_cond, 1, 0 ] } },
                  "automation" => { "$sum" => { "$cond" => [ MessageAuthorship.automation_cond, 1, 0 ] } },
                  "out_of_hours" => { "$sum" => { "$cond" => [ { "$and" => [ MessageAuthorship.automation_cond, MessageAuthorship.out_of_hours_cond(zone.tzinfo.name) ] }, 1, 0 ] } }
                }
              }
            ],

            "by_account" => [
              { "$match" => { "account_id" => { "$ne" => nil } } },
              { "$group" => { "_id" => "$account_id", "c" => { "$sum" => 1 } } },
              { "$sort" => { "c" => -1, "_id" => 1 } },
              { "$limit" => ACCOUNT_RANKING_LIMIT }
            ],

            "active_chats" => [ { "$group" => { "_id" => "$chat_id" } }, { "$count" => "n" } ],

            "automation_chats" => [
              { "$match" => { "$expr" => MessageAuthorship.automation_cond } },
              { "$group" => { "_id" => "$chat_id" } },
              { "$count" => "n" }
            ],

            "hourly" => [
              { "$group" => { "_id" => { "$hour" => { "date" => "$created_at", "timezone" => zone.tzinfo.name } }, "c" => { "$sum" => 1 } } }
            ]
          }
        }
      ]
    end
  end
end
