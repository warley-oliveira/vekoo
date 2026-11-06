module Outreach
  # Pausar, retomar e cancelar. Nenhuma das três mexe na fila: trocar `run_token` faz o que estava
  # agendado morrer ao executar. A origem varria a `ScheduledSet` inteira do Sidekiq a cada pausa.
  class Lifecycle
    def initialize(campaign, account_id: nil)
      @campaign = campaign
      @account_id = account_id
    end

    # @raise [RefusedError]
    def pause
      changed = campaign.transition!(from: :running, to: :paused, run_token: campaign.new_run_token, pause_reason: nil)
      raise RefusedError, "campaignNotRunning" unless changed

      record("paused")
    end

    # Monta os lotes de novo, com quem falta e pelos canais que estão de pé agora.
    #
    # @raise [RefusedError]
    def resume
      raise RefusedError, "campaignNotPaused" unless campaign.paused?

      channels = Channels.for(campaign).active
      raise RefusedError, "noActiveConnectors" if channels.empty?

      changed = campaign.transition!(
        from: :paused,
        to: :running,
        run_token: campaign.new_run_token,
        planned_at: Time.current,
        pause_reason: nil
      )
      raise RefusedError, "campaignNotPaused" unless changed

      planned = Planner.new(campaign, channels).call
      record("resumed")
      Settlement.new(campaign).call if planned.zero?
    end

    # Quem ainda não foi tomado vira `skipped`. Quem está no meio do envio termina normalmente.
    #
    # @raise [RefusedError]
    def cancel
      changed = campaign.transition!(
        from: %i[running paused scheduled],
        to: :cancelled,
        run_token: campaign.new_run_token,
        completed_at: Time.current
      )
      raise RefusedError, "campaignNotCancellable" unless changed

      campaign.recipients.status_pending.update_all(status_cd: "skipped", updated_at: Time.current)
      campaign.batches.unfinished.delete_all
      record("cancelled")
    end

    private

    attr_reader :campaign, :account_id

    def record(action)
      campaign.log_activity!(action, account_id: account_id)
      MonitorEvents.status(campaign)
    end
  end
end
