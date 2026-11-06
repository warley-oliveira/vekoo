module Outreach
  # Divide quem ainda falta entre os canais, em lotes, e põe a primeira vez de cada canal na fila.
  # É o mesmo caminho para lançar, retomar e recuperar: ao retomar, um canal que caiu durante a
  # pausa sai da conta, e os destinatários dele passam para os que estão de pé.
  #
  # Não escreve nos destinatários: o lote guarda os ids, e o resto é gravado quando um deles é
  # tomado. Lançar 50 mil contatos não vira 50 mil escritas, nem 50 mil jobs.
  class Planner
    # @param channels [Array<Channels::Channel>] pelo menos um
    def initialize(campaign, channels)
      @campaign = campaign
      @channels = channels
      @window = SendWindow.new(campaign)
    end

    # @return [Integer] quantos destinatários entraram nos lotes
    def call
      discard_unfinished_batches

      ids = campaign.recipients.status_pending.order_by(_id: 1).pluck(:_id)
      return 0 if ids.empty?

      heads = insert_batches(ids)
      campaign.set(estimated_completion_at: estimated_completion(ids.size))
      start(heads)
      ids.size
    end

    private

    attr_reader :campaign, :channels, :window

    # Sobras de um plano anterior. O que estava em andamento neles morre sozinho pelo token, e quem
    # já foi tomado não está em `status_pending`, então não entra de novo.
    def discard_unfinished_batches
      campaign.batches.unfinished.delete_all
    end

    def insert_batches(ids)
      now = Time.current
      size = campaign.batch_size.presence || 50
      docs = []

      channels.each_with_index do |channel, index|
        share = ids.select.with_index { |_, position| position % channels.size == index }

        share.each_slice(size).with_index do |slice, sequence|
          docs << {
            _id: BSON::ObjectId.new,
            campaign_id: campaign.id,
            connector_id: channel.connector.id.to_s,
            phone_number_id: channel.phone_number_id,
            channel_key: channel.key,
            sequence: sequence,
            position_offset: sequence * size,
            recipient_ids: slice,
            status_cd: "scheduled",
            created_at: now,
            updated_at: now
          }
        end
      end

      Batch.collection.insert_many(docs)
      docs.select { |doc| doc[:sequence].zero? }.map { |doc| doc[:_id] }
    end

    def start(head_ids)
      opens_at = window.advance(Time.current)

      Batch.where(:_id.in => head_ids).each do |batch|
        batch.set(scheduled_at: opens_at, next_send_at: opens_at)
        BatchJob.enqueue_step(campaign, batch, at: opens_at)
      end
    end

    # O canal mais demorado decide. Usa o que cada um já enviou hoje, por qualquer campanha.
    def estimated_completion(total)
      now = Time.current
      per_channel = (total.to_f / channels.size).ceil

      channels.map { |channel|
        used = ChannelUsage.used_on(channel.key, window.day_key(now))
        window.estimate_completion(per_channel, from: now, used_today: used)
      }.compact.max
    end
  end
end
