module Outreach
  # Retomada depois de queda: confere uma campanha `running` e põe de pé o que parou. O Sidekiq sem
  # `super_fetch` perde o job de quem morreu no meio, e como cada passo agenda o seguinte, o
  # encadeamento daquele canal para ali.
  #
  # Pode repetir à vontade: job duplicado cai em `Batch#take_turn!`.
  class Reconciler
    # Passou disto do horário previsto, o encadeamento morreu (ou a fila está muito atrasada, e aí
    # o duplicado é descartado).
    OVERDUE_AFTER = 15.minutes
    # A requisição de lançar pode estar montando os lotes agora mesmo.
    PLANNING_GRACE = 5.minutes

    def initialize(campaign)
      @campaign = campaign
    end

    def call
      return if campaign.planned_at && campaign.planned_at > PLANNING_GRACE.ago

      resume_recovered_channels
      restart_dead_chains
      Settlement.new(campaign).call
    end

    private

    attr_reader :campaign

    # O canal voltou enquanto o resto da campanha seguia. Com a campanha toda pausada, quem decide
    # retomar é uma pessoa.
    def resume_recovered_channels
      campaign.batches.failed.where(failure_reason: "connectorInactive").distinct(:channel_key).each do |channel_key|
        batches = campaign.batches.failed.where(channel_key: channel_key)
        connector_id = batches.order_by(sequence: 1).first&.connector_id
        next unless Connector::Base.scoped(campaign.organization_id, connector_id)&.active?

        batches.update_all(status_cd: "scheduled", failure_reason: nil, next_send_at: nil, updated_at: Time.current)
        campaign.log_activity!("channel_resumed", metadata: { "connector_id" => connector_id })
        restart(head_of(channel_key))
      end
    end

    def restart_dead_chains
      campaign.batches.executable.distinct(:channel_key).each do |channel_key|
        head = head_of(channel_key)
        restart(head) if head && overdue?(head)
      end
    end

    def head_of(channel_key)
      campaign.batches.executable.where(channel_key: channel_key).order_by(sequence: 1).first
    end

    def overdue?(batch)
      (batch.next_send_at || batch.scheduled_at || batch.created_at) < OVERDUE_AFTER.ago
    end

    def restart(batch)
      now = Time.current
      Rails.logger.warn("[Outreach::Reconciler] Retomando o lote #{batch.id} da campanha #{campaign.id}")

      batch.set(scheduled_at: batch.scheduled_at || now, next_send_at: now)
      BatchJob.enqueue_step(campaign, batch, at: now)
    end
  end
end
