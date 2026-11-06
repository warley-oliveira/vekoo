##
# app/services/insights/rollups/operational_metrics_backfill.rb
#
# Preenche os dias passados de `daily_chat_stats`, com MERGE jsonb.
#
# Por que não reusar Insights::Rollups::DailyChatCalculator: ele serve a um dia recente, e rodá-lo um
# ano inteiro atravessaria as mesmas conversas 365 vezes. O cálculo vem de
# Insights::OperationalRangeDigest, que varre o intervalo em chunks mensais.
#
# O `||` do jsonb preserva o resto da linha: uma chave que uma versão futura grave pelo job não some
# porque alguém rodou o backfill.
#
module Insights
  module Rollups
    class OperationalMetricsBackfill
      # Linhas por INSERT. Mantém o statement pequeno o suficiente para não
      # segurar lock longo na tabela.
      BATCH_SIZE = 120

      Result = Struct.new(:days_written, keyword_init: true)

      # @param organization [Organization]
      # @param range [Range<Time>] período half-open (from...to)
      def initialize(organization, range)
        @organization = organization
        @range = range
      end

      # @return [Result]
      def call
        per_day = OperationalRangeDigest.new(
          organization_id: organization.id,
          range: range,
          zone: organization.reporting_zone
        ).call

        return Result.new(days_written: 0) if per_day.empty?

        per_day.sort.each_slice(BATCH_SIZE) { |batch| write(batch) }

        Result.new(days_written: per_day.size)
      end

      private

      attr_reader :organization, :range

      def write(batch)
        values = batch.map do |day, metrics|
          ActiveRecord::Base.sanitize_sql_array(
            [
              "(gen_random_uuid(), ?, ?, ?::jsonb, ?::jsonb, NOW(), NOW())",
              organization.id, day, metrics.except(:hourly).to_json, { message_count: metrics[:hourly] }.to_json
            ]
          )
        end

        # `metrics || EXCLUDED.metrics` = merge raso. `upsert_all` do Rails não
        # permite expressão custom no DO UPDATE, daí o SQL cru.
        DailyChatStat.connection.execute(<<~SQL.squish)
          INSERT INTO daily_chat_stats
            (id, organization_id, day, metrics, hourly_breakdown, created_at, updated_at)
          VALUES #{values.join(', ')}
          ON CONFLICT (organization_id, day) DO UPDATE
            SET metrics = daily_chat_stats.metrics || EXCLUDED.metrics,
                hourly_breakdown = EXCLUDED.hourly_breakdown,
                updated_at = NOW()
        SQL
      end
    end
  end
end
