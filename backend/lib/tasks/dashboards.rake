module DashboardTasks
  # Preenche os dias passados de `daily_chat_stats`, para uma organização ou para todas.
  #
  # O cálculo usa Insights::OperationalRangeDigest, que varre o período em chunks mensais e distribui o
  # resultado por dia com `$dateTrunc`: ~30x mais barato que rodar o rollup diário 365 vezes.
  class OperationalBackfill
    DEFAULT_DAYS = 365
    MAX_DAYS = 730
    # Respiro entre organizações para não competir por I/O do Mongo com os workers que entregam mensagens.
    PAUSE_SECONDS = 1.0
    LOG_PREFIX = "[dashboards:backfill_operational]".freeze

    def initialize(days:, organization_id: nil, io: $stdout, pause: PAUSE_SECONDS)
      @days = days.to_i.clamp(1, MAX_DAYS)
      @organization_id = organization_id
      @io = io
      @pause = pause
    end

    def call
      organizations = scope.to_a
      return log("nenhuma organização para preencher") if organizations.empty?

      log("#{organizations.size} organização(ões), últimos #{@days} dias")

      started_at = Time.current
      written = 0
      failed = 0

      organizations.each_with_index do |organization, index|
        log("(#{index + 1}/#{organizations.size}) #{organization.id} [#{(Time.current - started_at).round}s decorridos]")

        result = Insights::Rollups::OperationalMetricsBackfill.new(organization, range_for(organization)).call
        written += result.days_written
        log("  #{result.days_written} dia(s) com atividade gravados")
      rescue StandardError => e
        failed += 1
        log("  FALHA #{organization.id}: #{e.class}: #{e.message}")
        Rails.logger.error("#{LOG_PREFIX} #{e.class}: #{e.message}\n#{e.backtrace&.first(5)&.join("\n")}")
      ensure
        sleep(@pause)
      end

      log("concluído em #{(Time.current - started_at).round(2)}s: dias gravados=#{written}, organizações com falha=#{failed}")
    end

    private

    def scope
      @organization_id.present? ? Organization.where(id: @organization_id) : Organization.all
    end

    def range_for(organization)
      zone = organization.reporting_zone
      today = zone.today
      first = today - @days.days

      zone.local(first.year, first.month, first.day)...zone.local(today.year, today.month, today.day).advance(days: 1)
    end

    def log(message)
      @io.puts("#{LOG_PREFIX} #{message}")
      Rails.logger.info("#{LOG_PREFIX} #{message}")
    end
  end
end

namespace :dashboards do
  desc 'Preenche os dias passados do dashboard. Uso: bin/rails "dashboards:backfill_operational[365,<organization_id>]"'
  task :backfill_operational, %i[days organization_id] => :environment do |_task, args|
    DashboardTasks::OperationalBackfill.new(
      days: args[:days] || DashboardTasks::OperationalBackfill::DEFAULT_DAYS,
      organization_id: args[:organization_id]
    ).call
  end
end
