##
# app/services/insights/channel_mix_daily.rb
#
# Distribuição das conversas criadas no dia por canal (`audience_type`).
#
# Um único `$group` servido pelo índice { organization_id: 1, created_at: -1 }.
# Escopa por `created_at` da conversa, portanto é correto para QUALQUER dia,
# inclusive histórico (ver Insights::Rollups::OperationalMetricsBackfill).
#
module Insights
  class ChannelMixDaily
    attr_reader :organization_id, :range

    # @param organization_id [String]
    # @param range [Range<Time>] período half-open (from...to)
    def initialize(organization_id:, range:)
      @organization_id = organization_id.to_s
      @range = range
    end

    # => { 'whatsapp_api' => 812, 'instagram' => 44, 'web' => 9 }
    def to_h
      @to_h ||= Chat.collection.aggregate(pipeline, hint: ChatIndexes::BY_CREATION).each_with_object({}) do |row, acc|
        acc[row["_id"].to_s] = row["c"].to_i
      end
    end

    def total
      to_h.values.sum
    end

    private

    def pipeline
      [
        {
          "$match" => {
            "organization_id" => organization_id,
            "created_at" => { "$gte" => range.first, "$lt" => range.last },
            "external_id" => { "$ne" => Chat::TEST_EXTERNAL_ID }
          }
        },
        {
          "$group" => {
            "_id" => { "$ifNull" => [ "$audience_type", "unknown" ] },
            "c" => { "$sum" => 1 }
          }
        }
      ]
    end
  end
end
