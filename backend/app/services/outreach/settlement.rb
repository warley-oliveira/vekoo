module Outreach
  # O que fazer com a campanha quando um canal para de trabalhar: terminar, pausar sozinha ou
  # remontar os lotes. Atômico nas transições: dois lotes acabando juntos não concluem duas vezes.
  class Settlement
    NO_ACTIVE_CONNECTORS = "no_active_connectors".freeze

    def initialize(campaign)
      @campaign = campaign
    end

    def call
      # Quem chamou pode estar com a campanha de antes de uma pausa.
      return unless campaign.reload.running?
      return if campaign.batches.executable.exists?

      recipients = campaign.recipients
      # Um envio em andamento ainda vai resolver, e travado a recuperação resolve.
      return if recipients.status_sending.exists?

      if recipients.status_pending.exists?
        campaign.batches.failed.exists? ? pause_without_channels : plan_leftovers
      else
        complete
      end
    end

    private

    attr_reader :campaign

    def complete
      return unless campaign.transition!(from: :running, to: :completed, completed_at: Time.current, run_token: campaign.new_run_token)

      campaign.log_activity!("completed")
      MonitorEvents.status(campaign)
    end

    # Nenhum canal consegue enviar. Pausar diz a verdade na tela e não gasta ninguém; quem resolve
    # é uma pessoa, reconectando e retomando.
    def pause_without_channels
      return unless campaign.transition!(from: :running, to: :paused, pause_reason: NO_ACTIVE_CONNECTORS, run_token: campaign.new_run_token)

      campaign.log_activity!("paused", metadata: { "reason" => NO_ACTIVE_CONNECTORS })
      MonitorEvents.status(campaign)
      CreatorNotice.call(campaign, :paused)
    end

    # Pendentes fora de qualquer lote: alguém importou enquanto a campanha era lançada, ou o
    # processo caiu entre mudar o estado e montar os lotes.
    def plan_leftovers
      channels = Channels.for(campaign).active
      return pause_without_channels if channels.empty?

      Planner.new(campaign, channels).call
    end
  end
end
