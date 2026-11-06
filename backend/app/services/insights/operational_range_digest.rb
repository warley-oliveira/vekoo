##
# app/services/insights/operational_range_digest.rb
#
# Calcula as métricas do dashboard para um intervalo inteiro de uma vez, já agrupadas por dia.
#
# POR QUE EXISTE, se Insights::OperationalDailyDigest já faz isso:
#   O digest diário é otimizado para o cron horário: um dia, uma organização. Rodá-lo
#   365 vezes para preencher um ano significa 365 varreduras que atravessam o
#   mesmo conjunto de conversas. Aqui a varredura é feita uma vez por CHUNK
#   (mês) e o `$dateTrunc` distribui o resultado nos dias, o que derruba o custo
#   de um backfill anual em ~30x.
#
# DIFERENÇA IMPORTANTE vs Insights::MessageVolumeDaily:
#   O serviço diário limita `last_message_at < to + 1.day` para manter o range do
#   índice apertado, e por isso ele é inválido para dias antigos (`.stale?`).
#   Aqui NÃO existe limite superior: uma conversa ativa em março pode ter
#   `last_message_at` de hoje, e precisa entrar no bucket de março. É o que
#   torna o volume de mensagens recalculável.
#
module Insights
  class OperationalRangeDigest
    # Tamanho do chunk. Mensal equilibra: poucas varreduras, sem materializar um
    # ano inteiro de conversas numa pipeline só.
    CHUNK = 1.month

    # Mesma janela do serviço diário: conversa aberta perto da meia-noite
    # costuma ser respondida no dia seguinte.
    RESPONSE_LOOKAHEAD = 2.hours

    attr_reader :organization_id, :range, :zone

    # @param organization_id [String]
    # @param range [Range<Time>] período half-open (from...to)
    # @param zone [ActiveSupport::TimeZone] o fuso da organização
    def initialize(organization_id:, range:, zone:)
      @organization_id = organization_id.to_s
      @range = range
      @zone = zone
    end

    # @return [Hash<Date, Hash>] só os dias que tiveram alguma atividade. A hora vai em `:hourly`.
    def call
      result = Hash.new { |hash, day| hash[day] = zero_metrics }

      chunks.each do |chunk|
        collect_volume(chunk, result)
        collect_first_response(chunk, result)
        collect_channels(chunk, result)
        collect_bookings(chunk, result)
      end

      result.each_value { |day| derive(day) }
      result
    end

    private

    def zone_name
      zone.tzinfo.name
    end

    # Cada dia precisa dos próprios Hash: compartilhar uma instância somaria um dia no outro.
    def zero_metrics
      OperationalDailyDigest::SCALAR_KEYS.index_with { 0 }.merge(messages_by_account: {}, chats_by_channel: {}, hourly: {})
    end

    def derive(day)
      day[:hours_saved] = Efficiency.hours_saved(day[:messages_sent_by_automation])
      day[:messages_avoided] = Efficiency.messages_avoided(day[:messages_sent_by_automation], day[:messages_sent_by_human])
      day[:chats_started] = day[:chats_by_channel].values.sum
    end

    def chunks
      result = []
      cursor = range.first

      while cursor < range.last
        stop = [ cursor + CHUNK, range.last ].min
        result << (cursor...stop)
        cursor = stop
      end

      result
    end

    def to_date(value)
      value.in_time_zone(zone).to_date
    end

    # ── Volume de mensagens + ranking ───────────────────────────────────────

    def collect_volume(chunk, result)
      raw = Chat.collection
                .aggregate(volume_pipeline(chunk), allow_disk_use: true, hint: ChatIndexes::BY_ACTIVITY)
                .first || {}

      Array(raw["totals"]).each do |row|
        day = result[to_date(row["_id"])]
        day[:messages_inbound] += row["inbound"].to_i
        day[:messages_sent_by_automation] += row["automation"].to_i
        day[:messages_sent_by_campaign] += row["campaign"].to_i
        day[:messages_sent_by_human] += row["human"].to_i
        day[:out_of_hours_messages] += row["out_of_hours"].to_i
      end

      Array(raw["active_chats"]).each { |row| result[to_date(row["_id"])][:active_chats] += row["n"].to_i }
      Array(raw["automation_chats"]).each { |row| result[to_date(row["_id"])][:automation_chats] += row["n"].to_i }

      Array(raw["by_account"]).each do |row|
        bucket = result[to_date(row.dig("_id", "day"))][:messages_by_account]
        owner = row.dig("_id", "owner").to_s
        bucket[owner] = bucket.fetch(owner, 0) + row["c"].to_i
      end

      Array(raw["hourly"]).each do |row|
        bucket = result[to_date(row.dig("_id", "day"))][:hourly]
        hour = row.dig("_id", "hour").to_s
        bucket[hour] = bucket.fetch(hour, 0) + row["c"].to_i
      end
    end

    def volume_pipeline(chunk)
      [
        # Sem limite superior em last_message_at: uma conversa ativa no chunk
        # pode ter recebido a última mensagem muito depois dele.
        { "$match" => {
          "organization_id" => organization_id,
          "last_message_at" => { "$gte" => chunk.first },
          "created_at" => { "$lt" => chunk.last },
          "external_id" => { "$ne" => Chat::TEST_EXTERNAL_ID }
        } },
        { "$project" => { "_id" => 1 } },

        # $lookup + $unwind imediato => join em streaming (sem o teto de 16MB).
        { "$lookup" => {
          "from" => ChatMessage::Base.collection.name,
          "localField" => "_id",
          "foreignField" => "chat_id",
          "as" => "m",
          "pipeline" => [
            { "$match" => {
              "created_at" => { "$gte" => chunk.first, "$lt" => chunk.last }
            }.merge(MessageAuthorship.match_guards) },
            { "$project" => MessageAuthorship.projection }
          ]
        } },
        { "$unwind" => "$m" },
        { "$replaceRoot" => { "newRoot" => "$m" } },
        { "$addFields" => { "day" => MessageAuthorship.day_of("$created_at", zone_name) } },

        { "$facet" => {
          "totals" => [
            { "$group" => {
              "_id" => "$day",
              "inbound" => { "$sum" => { "$cond" => [ MessageAuthorship.inbound_cond, 1, 0 ] } },
              "human" => { "$sum" => { "$cond" => [ MessageAuthorship.human_cond, 1, 0 ] } },
              "campaign" => { "$sum" => { "$cond" => [ MessageAuthorship.campaign_cond, 1, 0 ] } },
              "automation" => { "$sum" => { "$cond" => [ MessageAuthorship.automation_cond, 1, 0 ] } },
              "out_of_hours" => { "$sum" => { "$cond" => [ { "$and" => [ MessageAuthorship.automation_cond, MessageAuthorship.out_of_hours_cond(zone_name) ] }, 1, 0 ] } }
            } }
          ],

          "by_account" => [
            { "$match" => { "account_id" => { "$ne" => nil } } },
            { "$group" => {
              "_id" => { "day" => "$day", "owner" => "$account_id" },
              "c" => { "$sum" => 1 }
            } }
          ],

          "active_chats" => [
            { "$group" => { "_id" => { "day" => "$day", "chat" => "$chat_id" } } },
            { "$group" => { "_id" => "$_id.day", "n" => { "$sum" => 1 } } }
          ],

          "automation_chats" => [
            { "$match" => { "$expr" => MessageAuthorship.automation_cond } },
            { "$group" => { "_id" => { "day" => "$day", "chat" => "$chat_id" } } },
            { "$group" => { "_id" => "$_id.day", "n" => { "$sum" => 1 } } }
          ],

          "hourly" => [
            { "$group" => {
              "_id" => { "day" => "$day", "hour" => { "$hour" => { "date" => "$created_at", "timezone" => zone_name } } },
              "c" => { "$sum" => 1 }
            } }
          ]
        } }
      ]
    end

    # ── Tempo de 1ª resposta + transbordo ─────────────────────────────────────

    def collect_first_response(chunk, result)
      Chat.collection
          .aggregate(first_response_pipeline(chunk), allow_disk_use: true, hint: ChatIndexes::BY_CREATION)
          .each do |row|
        day = result[to_date(row["_id"])]
        day[:first_response_automation_seconds_sum] += row["automation_sum"].to_f.round(2)
        day[:first_response_automation_count] += row["automation_count"].to_i
        day[:first_response_human_seconds_sum] += row["human_sum"].to_f.round(2)
        day[:first_response_human_count] += row["human_count"].to_i
        day[:chats_with_human_touch] += row["human_touch"].to_i
        day[:chats_handled_by_automation] += row["automation_only"].to_i
      end
    end

    def first_response_pipeline(chunk)
      prefix = "$$x."

      [
        { "$match" => {
          "organization_id" => organization_id,
          "created_at" => { "$gte" => chunk.first, "$lt" => chunk.last },
          "external_id" => { "$ne" => Chat::TEST_EXTERNAL_ID }
        } },
        { "$project" => { "_id" => 1, "day" => MessageAuthorship.day_of("$created_at", zone_name) } },

        # Aqui o array é intencional: a redução é POR CONVERSA. Dirigir a
        # pipeline pelas conversas evita o `$in` com centenas de milhares de ids
        # que um `pluck` de um mês inteiro produziria.
        { "$lookup" => {
          "from" => ChatMessage::Base.collection.name,
          "localField" => "_id",
          "foreignField" => "chat_id",
          "as" => "m",
          "pipeline" => [
            { "$match" => {
              "created_at" => { "$gte" => chunk.first, "$lt" => chunk.last + RESPONSE_LOOKAHEAD }
            }.merge(MessageAuthorship.match_guards) },
            { "$project" => MessageAuthorship.projection }
          ]
        } },

        # `t` primeiro no documento: a comparação BSON é campo a campo na ordem
        # declarada, então `$min` sobre o array devolve a saída mais antiga,
        # dispensando um `$sort` global.
        { "$addFields" => { "msgs" => {
          "$filter" => {
            "input" => {
              "$map" => {
                "input" => "$m", "as" => "x",
                "in" => { "t" => "$$x.created_at", "k" => MessageAuthorship.kind_switch(prefix) }
              }
            },
            "as" => "e",
            "cond" => { "$ne" => [ "$$e.k", nil ] }
          }
        } } },

        { "$addFields" => {
          "first_user_at" => { "$min" => {
            "$map" => {
              "input" => { "$filter" => { "input" => "$msgs", "as" => "e",
                                          "cond" => { "$eq" => [ "$$e.k", "user" ] } } },
              "as" => "e", "in" => "$$e.t"
            }
          } },
          "human_touch" => touched("human"),
          "automation_touch" => touched("automation")
        } },

        { "$addFields" => { "first_response" => { "$min" => {
          "$filter" => {
            "input" => "$msgs", "as" => "e",
            "cond" => { "$and" => [
              { "$in" => [ "$$e.k", %w[automation human] ] },
              { "$ne" => [ { "$ifNull" => [ "$first_user_at", nil ] }, nil ] },
              { "$gte" => [ "$$e.t", "$first_user_at" ] }
            ] }
          }
        } } } },

        { "$group" => {
          "_id" => "$day",
          "automation_sum" => { "$sum" => { "$cond" => [ automation_response, delta_seconds, 0 ] } },
          "automation_count" => { "$sum" => { "$cond" => [ automation_response, 1, 0 ] } },
          "human_sum" => { "$sum" => { "$cond" => [ human_response, delta_seconds, 0 ] } },
          "human_count" => { "$sum" => { "$cond" => [ human_response, 1, 0 ] } },
          "human_touch" => { "$sum" => "$human_touch" },
          "automation_only" => { "$sum" => { "$cond" => [ { "$and" => [ { "$eq" => [ "$automation_touch", 1 ] }, { "$eq" => [ "$human_touch", 0 ] } ] }, 1, 0 ] } }
        } }
      ]
    end

    def touched(kind)
      {
        "$cond" => [
          { "$gt" => [ { "$size" => { "$filter" => { "input" => "$msgs", "as" => "e", "cond" => { "$eq" => [ "$$e.k", kind ] } } } }, 0 ] },
          1, 0
        ]
      }
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

    # ── Mix de canais ─────────────────────────────────────────────────────────

    def collect_channels(chunk, result)
      Chat.collection.aggregate(channels_pipeline(chunk), hint: ChatIndexes::BY_CREATION).each do |row|
        bucket = result[to_date(row.dig("_id", "day"))][:chats_by_channel]
        channel = row.dig("_id", "channel").to_s
        bucket[channel] = bucket.fetch(channel, 0) + row["c"].to_i
      end
    end

    def channels_pipeline(chunk)
      [
        { "$match" => {
          "organization_id" => organization_id,
          "created_at" => { "$gte" => chunk.first, "$lt" => chunk.last },
          "external_id" => { "$ne" => Chat::TEST_EXTERNAL_ID }
        } },
        { "$group" => {
          "_id" => {
            "day" => MessageAuthorship.day_of("$created_at", zone_name),
            "channel" => { "$ifNull" => [ "$audience_type", "unknown" ] }
          },
          "c" => { "$sum" => 1 }
        } }
      ]
    end

    # ── Agendamentos pela automação ───────────────────────────────────────────

    def collect_bookings(chunk, result)
      scope = Efficiency.automation_bookings(organization_id).where(:created_at.gte => chunk.first, :created_at.lt => chunk.last)

      ::Agenda::Booking.collection.aggregate(
        [
          { "$match" => scope.selector },
          { "$group" => { "_id" => MessageAuthorship.day_of("$created_at", zone_name), "c" => { "$sum" => 1 } } }
        ],
        hint: ChatIndexes::BY_CREATION
      ).each { |row| result[to_date(row["_id"])][:automation_bookings] += row["c"].to_i }
    end
  end
end
