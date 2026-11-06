module Outreach
  # A rede de segurança das campanhas: roda de 10 em 10 minutos (config/schedule/outreach.yml). Tudo
  # aqui pode repetir sem efeito colateral, e cada campanha é tratada sozinha: uma com problema não
  # impede as outras de voltarem.
  class RecoveryJob < ApplicationJob
    queue_as :campaigns

    # A próxima execução, dez minutos depois, já é a nova tentativa.
    sidekiq_options retry: false

    STALE_EXTRACTION_AFTER = 15.minutes

    def perform
      StuckRecipients.new.call
      each_safely(Campaign.running) { |campaign| Reconciler.new(campaign).call }
      each_safely(Campaign.scheduled.where(:scheduled_at.lte => Time.current)) do |campaign|
        Rails.logger.warn("[Outreach::RecoveryJob] Lançando a campanha agendada que ficou para trás: #{campaign.id}")
        ScheduledLaunchJob.perform_later(campaign.id.to_s, campaign.organization_id, campaign.run_token)
      end
      recover_stale_extractions
    end

    private

    def each_safely(scope)
      scope.each do |record|
        yield record
      rescue StandardError => e
        Rails.logger.error("[Outreach::RecoveryJob] #{record.class} #{record.id}: #{e.class}: #{e.message}")
      end
    end

    # O worker morreu no meio da busca: sem isto, a tela esperaria para sempre.
    def recover_stale_extractions
      stale = PlaceExtraction.pending_or_running.where(:updated_at.lt => STALE_EXTRACTION_AFTER.ago)

      each_safely(stale) do |extraction|
        extraction.mark_failed!("interrupted")
        PlaceExtractionChannel.broadcast_status(extraction)
      end
    end
  end
end
