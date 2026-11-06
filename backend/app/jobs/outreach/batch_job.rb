module Outreach
  # Um passo de um lote: no máximo uma mensagem. Quem agenda o passo seguinte é o próprio passo,
  # então cada canal tem um único job na fila, e nenhuma thread fica parada esperando o intervalo
  # entre mensagens. Ver `Outreach::BatchExecutionService`.
  class BatchJob < ApplicationJob
    queue_as :campaigns

    # Teto baixo: se esgotar, o encadeamento parou e `Outreach::RecoveryJob` o retoma.
    retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
      Rails.logger.error("[Outreach::BatchJob] #{job.arguments.inspect} #{error.class}: #{error.message}")
    end

    # A organização viaja junto, e o token decide se o passo ainda vale.
    def self.enqueue_step(campaign, batch, at:)
      set(wait_until: at).perform_later(campaign.id.to_s, campaign.organization_id, batch.id.to_s, campaign.run_token)
    end

    def perform(campaign_id, organization_id, batch_id, run_token)
      BatchExecutionService.new(
        campaign_id: campaign_id,
        organization_id: organization_id,
        batch_id: batch_id,
        run_token: run_token
      ).call
    end
  end
end
