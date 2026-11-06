module Insights
  module Rollups
    # A linha de um dia em `daily_chat_stats`: é dela que sai o dashboard, sem consultar conversas nem
    # mensagens a cada abertura de tela. O job roda de hora em hora para o dia corrente e uma vez na
    # madrugada para o dia anterior.
    #
    # O dia é o do fuso da organização: em UTC, o movimento das 21h cairia no dia seguinte.
    class DailyChatCalculator
      def initialize(organization, date = nil)
        @organization = organization
        @zone = organization.reporting_zone
        @date = date || @zone.today
      end

      def call
        digest = OperationalDailyDigest.new(organization_id: organization.id, range: day_range, zone: zone)

        DailyChatStat.upsert(
          {
            organization_id: organization.id,
            day: date,
            metrics: digest.to_h,
            hourly_breakdown: { message_count: digest.hourly }
          },
          unique_by: %i[organization_id day]
        )
      end

      private

      attr_reader :organization, :zone, :date

      # Janela half-open [00:00, 00:00 do dia seguinte): `end_of_day` é 23:59:59.999999999 e perderia a
      # última fração de segundo em quem filtra com `$lt`.
      def day_range
        zone.local(date.year, date.month, date.day)...zone.local(date.year, date.month, date.day).advance(days: 1)
      end
    end
  end
end
