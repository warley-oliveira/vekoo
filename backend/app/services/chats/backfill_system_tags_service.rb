module Chats
  # Reaplica as etiquetas de sistema nas conversas de uma organização, a partir do que já aconteceu.
  # Hoje, os comparecimentos da agenda (compareceu, nao-compareceu). Os negócios fechados dos
  # pipelines (ganho, perdido) entram aqui junto com o domínio deles: é só somar um `sync_group`.
  #
  # As etiquetas de cada grupo são mutuamente exclusivas e refletem o estado atual. Por isso vale só
  # o evento mais recente de cada conversa na janela, e não o histórico inteiro.
  class BackfillSystemTagsService
    DEFAULT_MONTHS = 8
    BATCH_SIZE = 500

    def initialize(organization, months: DEFAULT_MONTHS, dry_run: false)
      @organization = organization
      @since = months.months.ago
      @dry_run = dry_run
      @stats = Hash.new(0)
    end

    def call
      sync_group(:attendance, latest_attendance_per_chat)
      stats
    end

    private

    attr_reader :organization, :since, :dry_run, :stats

    # Cancelados ficam de fora: remarcar pode gerar um documento cancelado e um novo, e só o novo
    # representa o estado atual.
    def latest_attendance_per_chat
      latest = {}

      Agenda::Booking
        .where(organization_id: organization.id.to_s, :attendance_status.in => Agenda::Booking::ATTENDANCE_STATUSES)
        .where(:status.ne => "canceled", :start.gte => since, :chat_id.ne => nil)
        .only(:chat_id, :attendance_status, :start)
        .each do |booking|
        stats[:attendance_events] += 1
        keep_latest(latest, booking.chat_id.to_s, booking.start, booking.attendance_status.to_sym)
      end

      latest
    end

    def keep_latest(latest, chat_id, occurred_at, keep)
      current = latest[chat_id]
      latest[chat_id] = [ occurred_at, keep ] if current.nil? || occurred_at > current.first
    end

    def sync_group(group, latest_by_chat)
      latest_by_chat.each_slice(BATCH_SIZE) do |slice|
        keeps = slice.to_h
        found = chats_for(keeps.keys)

        found.each { |chat| apply(chat, group, keeps[chat.id.to_s].last) }
        stats[:"#{group}_orphans"] += keeps.size - found.size
      end
    end

    # Confere a organização de novo: o id gravado não garante que a conversa ainda seja dela.
    def chats_for(ids)
      object_ids = ids.filter_map { |id| BSON::ObjectId.from_string(id) if BSON::ObjectId.legal?(id) }
      return [] if object_ids.empty?

      Chat.where(organization_id: organization.id.to_s, :_id.in => object_ids).to_a
    end

    def apply(chat, group, keep)
      chat.sync_system_tags!(group, keep) unless dry_run
      stats[:"#{group}_tagged"] += 1
    rescue StandardError => e
      stats[:failed] += 1
      Rails.logger.error("[Chats::BackfillSystemTagsService] chat=#{chat.id} group=#{group} #{e.message}")
    end
  end
end
