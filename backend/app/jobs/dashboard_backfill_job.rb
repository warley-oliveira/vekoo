# Mantém `daily_chat_stats` em dia.
#
# Roda de forma SERIAL e ISOLADA dentro do próprio worker do cron. Não enfileira jobs adicionais para
# preservar a capacidade dos workers do Sidekiq, que atendem mensagens em tempo real.
#
# Modos:
#   'hourly' (padrão)  recalcula APENAS o dia corrente. Chamado de hora em hora pelo cron.
#   'daily'            recalcula APENAS o dia anterior. Roda 1x por dia (madrugada) para capturar
#                      'late writes' depois que o dia fechou.
#   'both'             ontem + hoje. Só para chamada manual.
#
# O dia é o do fuso de cada organização. Organização sem conversa com atividade naquele dia fica sem
# linha: é a maioria das que só usam os carrosséis, e o dashboard completa o dia que faltar com zero.
#
# Falha por (organização, dia) não aborta o lote.
class DashboardBackfillJob < ApplicationJob
  queue_as :low

  # A próxima execução já é a nova tentativa.
  sidekiq_options retry: false

  def perform(mode = "hourly")
    started_at = Time.current
    processed = 0
    failed = 0

    Organization.select(:id, :timezone).find_each do |organization|
      days_for(mode, organization.reporting_zone).each do |day|
        next unless active_on?(organization, day)

        Insights::Rollups::DailyChatCalculator.new(organization, day).call
        processed += 1
      rescue StandardError => e
        failed += 1
        Rails.logger.error("[DashboardBackfillJob] falha organização=#{organization.id} dia=#{day}: #{e.class}: #{e.message}")
      end
    end

    Rails.logger.info("[DashboardBackfillJob] mode=#{mode} concluído em #{(Time.current - started_at).round(2)}s: ok=#{processed} falhas=#{failed}")
  end

  private

  def days_for(mode, zone)
    today = zone.today

    case mode.to_s
    when "daily" then [ today - 1.day ]
    when "both" then [ today - 1.day, today ]
    else [ today ]
    end
  end

  # Pelo índice { organization_id: 1, last_message_at: -1 }: uma consulta de ponto, em vez de três
  # agregações por organização parada.
  def active_on?(organization, day)
    zone = organization.reporting_zone

    Chat.where(organization_id: organization.id.to_s, :last_message_at.gte => zone.local(day.year, day.month, day.day)).exists?
  end
end
