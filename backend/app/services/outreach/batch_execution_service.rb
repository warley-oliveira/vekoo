module Outreach
  # Um passo de um lote: confere se ainda vale, toma a vez do canal, envia para um destinatário e
  # agenda o próximo passo. Origem: Campaigns::BatchExecutionService, que dormia entre as mensagens
  # segurando uma thread do Sidekiq; aqui, com 5 threads divididas com o caminho das mensagens, um
  # canal parado no intervalo não ocupa nada.
  #
  # O que torna a repetição segura, em ordem:
  #   1. `run_token`: pausar, retomar ou cancelar troca o token, e o que estava agendado morre aqui.
  #   2. `Batch#take_turn!`: de dois jobs iguais só um passa, e o intervalo entre mensagens é mantido.
  #   3. `Batch#claim_next_recipient`: o mesmo destinatário nunca é tomado duas vezes.
  class BatchExecutionService
    # Tantos envios seguidos sem funcionar, o canal para. O provedor pode cair sem o conector mudar de
    # estado, e cada tentativa seguinte gastaria mais um destinatário: quem falhou depois de despachar
    # não é reenviado, para não duplicar.
    MAX_CONSECUTIVE_FAILURES = 5

    def initialize(campaign_id:, organization_id:, batch_id:, run_token:)
      @campaign_id = campaign_id
      @organization_id = organization_id
      @batch_id = batch_id
      @run_token = run_token
    end

    def call
      return unless load_campaign && load_batch

      now = Time.current
      window = SendWindow.new(campaign)

      opens_at = window.advance(now)
      return defer_until(opens_at) if opens_at > now

      next_at = now + campaign.random_buffer
      return unless batch.take_turn!(now: now, next_send_at: next_at)

      connector = Connector::Base.scoped(organization_id, batch.connector_id)
      return stop_channel(connector ? "connectorInactive" : "connectorMissing") unless connector&.active?

      day = ChannelUsage.day_of(now)
      return wait_for_next_day(window, now, next_at) unless ChannelUsage.reserve(batch.channel_key, day, campaign.daily_limit_per_connector)

      recipient = batch.claim_next_recipient
      if recipient.nil?
        ChannelUsage.release(batch.channel_key, day)
        return finish_batch(next_at)
      end

      send_to(recipient, connector, day)
      return stop_channel("channelFailing") if batch.consecutive_failures.to_i >= MAX_CONSECUTIVE_FAILURES

      batch.remaining_recipients? ? BatchJob.enqueue_step(campaign, batch, at: next_at) : finish_batch(next_at)
    end

    private

    attr_reader :campaign_id, :organization_id, :batch_id, :run_token, :campaign, :batch

    def load_campaign
      @campaign = Campaign.scoped(organization_id, campaign_id)
      return true if campaign&.running? && campaign.run_token == run_token

      Rails.logger.info("[Outreach::BatchJob] Passo descartado: campanha #{campaign_id} está #{campaign&.status_cd || 'ausente'}")
      false
    end

    def load_batch
      @batch = campaign.batches.executable.where(id: batch_id).take
      batch.present?
    end

    def send_to(recipient, connector, day)
      service = SendRecipientService.new(
        recipient: recipient,
        campaign: campaign,
        batch: batch,
        connector: connector
      )
      service.call
      service.channel_trouble? ? batch.note_failure! : batch.clear_failures!

      # Nada foi despachado (número que não existe, modelo apagado): o limite protege o número de
      # mensagens de verdade, e uma lista suja não pode gastar o dia inteiro.
      ChannelUsage.release(batch.channel_key, day) if recipient.dispatched_at.nil?

      MonitorEvents.recipient(campaign, recipient)
      MonitorEvents.progress(campaign)
    end

    # Sem a vez tomada: um job duplicado chega aqui também, e só o primeiro enfileira.
    def defer_until(time)
      return unless batch.defer_until!(time)

      BatchJob.enqueue_step(campaign, batch, at: time)
    end

    # Com a vez tomada, só este job passou por aqui. O intervalo pode ir além da virada do dia.
    def wait_for_next_day(window, now, next_at)
      time = [ window.next_day_start(now), next_at ].max

      batch.set(next_send_at: time)
      BatchJob.enqueue_step(campaign, batch, at: time)
    end

    # Sem o canal, os destinatários continuam `pending`: a origem marcava um por um como falho,
    # queimando a lista inteira enquanto o celular estivesse desconectado.
    def stop_channel(reason)
      stopped = campaign.batches.executable.where(channel_key: batch.channel_key)
                        .update_all(status_cd: "failed", failure_reason: reason, updated_at: Time.current)
      return if stopped.modified_count.zero?

      campaign.log_activity!("channel_stopped", metadata: { "connector_id" => batch.connector_id, "reason" => reason })
      Settlement.new(campaign).call
    end

    def finish_batch(next_at)
      return unless batch.complete!

      following = campaign.batches.scheduled.where(channel_key: batch.channel_key).order_by(sequence: 1).first
      return Settlement.new(campaign).call unless following

      following.set(scheduled_at: next_at, next_send_at: next_at, consecutive_failures: batch.consecutive_failures)
      BatchJob.enqueue_step(campaign, following, at: next_at)
    end
  end
end
