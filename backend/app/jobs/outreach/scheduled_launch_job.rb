module Outreach
  # Lança a campanha agendada, no horário. Origem: CampaignScheduledLaunchJob.
  #
  # Cancelar troca o token, e este agendamento chega ao horário e não faz nada.
  class ScheduledLaunchJob < ApplicationJob
    queue_as :campaigns

    retry_on StandardError, wait: :polynomially_longer, attempts: 3 do |job, error|
      Rails.logger.error("[Outreach::ScheduledLaunchJob] #{job.arguments.first}: #{error.class}: #{error.message}")
    end

    def perform(campaign_id, organization_id, run_token = nil)
      campaign = Campaign.scoped(organization_id, campaign_id)
      return unless campaign&.scheduled?
      return if run_token && campaign.run_token != run_token

      launch(campaign)
    end

    private

    def launch(campaign)
      LaunchService.new(campaign, account_id: campaign.created_by_account_id).call
      Rails.logger.info("[Outreach::ScheduledLaunchJob] Campanha #{campaign.id} lançada")
    rescue RefusedError => e
      revert_to_draft(campaign, e)
    end

    # A pessoa corrige e lança de novo. Se quem ganhou a corrida foi outro lançamento, a campanha já
    # não está agendada e nada muda.
    def revert_to_draft(campaign, error)
      return unless campaign.transition!(from: :scheduled, to: :draft, run_token: campaign.new_run_token)

      Rails.logger.error("[Outreach::ScheduledLaunchJob] Campanha #{campaign.id} não foi lançada: #{error.code}")
      campaign.log_activity!("launch_failed", metadata: { "code" => error.code })
      MonitorEvents.status(campaign)
      CreatorNotice.call(campaign, :launch_failed)
    end
  end
end
