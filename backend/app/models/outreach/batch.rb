# Um lote: um pedaço dos destinatários de uma campanha, em um canal. Origem: Campaign::Batch.
#
# A origem agendava um job por destinatário, e cada `perform_at` engorda a sorted set `schedule`
# do Redis (`ancient-app/CLAUDE.md`, regra 7). Uma campanha de 50 mil contatos eram 50 mil
# entradas. Aqui cada canal tem um único job agendado por vez, com a vez guardada no lote em
# `next_send_at`: ver `Outreach::BatchExecutionService`.
module Outreach
  class Batch
    include Mongoid::Document
    include Mongoid::Timestamps
    include StringEnum

    EXECUTABLE_STATUSES = %w[scheduled processing].freeze

    belongs_to :campaign, class_name: "Outreach::Campaign", inverse_of: :batches

    field :connector_id, type: String
    # Modo modelo: de qual número da WABA o lote sai.
    field :phone_number_id, type: String
    # O canal: conector + número. É nele que valem a ordem dos lotes e o limite diário.
    field :channel_key, type: String

    field :sequence, type: Integer
    # Quantos destinatários o canal já tem nos lotes anteriores, para o rodízio de mensagens
    # continuar de onde parou: ver `Outreach::MessageContent`.
    field :position_offset, type: Integer, default: 0
    field :recipient_ids, type: Array, default: []

    # Quando o lote começa a valer. Só existe a partir de quando ele é a vez do canal.
    field :scheduled_at, type: Time
    # Não pode enviar antes disto. Quem tomar a vez empurra para a frente: é o que mantém o
    # intervalo entre mensagens e descarta um job duplicado.
    field :next_send_at, type: Time
    field :completed_at, type: Time

    string_enum :status, %i[scheduled processing completed failed], default: :scheduled
    # connector_inactive, connector_missing
    field :failure_reason, type: String

    validates :connector_id, presence: true
    validates :channel_key, presence: true
    validates :sequence, presence: true

    index({ campaign_id: 1, status_cd: 1, channel_key: 1, sequence: 1 })

    scope :executable, -> { where(:status_cd.in => EXECUTABLE_STATUSES) }
    scope :unfinished, -> { where(:status_cd.ne => "completed") }

    def recipients
      Recipient.where(campaign_id: campaign_id, :_id.in => recipient_ids)
    end

    def remaining_recipients?
      recipients.status_pending.exists?
    end

    # Toma a vez de enviar. Atômico: de duas execuções do mesmo lote (reenfileirada, recuperada,
    # sobra de uma pausa), só uma passa. A outra acha `next_send_at` no futuro e termina ali,
    # e o encadeamento segue com um job só.
    #
    # @return [Boolean]
    def take_turn!(now:, next_send_at:)
      taken = self.class
                  .where(_id: id, :status_cd.in => EXECUTABLE_STATUSES)
                  .any_of({ next_send_at: nil }, { :next_send_at.lte => now })
                  .find_one_and_update(
                    { "$set" => { status_cd: "processing", next_send_at: next_send_at, updated_at: now } },
                    return_document: :after
                  )
      return false unless taken

      self.next_send_at = taken.next_send_at
      self.status_cd = taken.status_cd
      true
    end

    # Adia a próxima vez (janela fechada, limite do dia). Só quem de fato adiou enfileira: com um
    # job duplicado, o segundo acha a data já adiada e termina ali.
    #
    # @return [Boolean]
    def defer_until!(time)
      deferred = self.class
                     .where(_id: id, :status_cd.in => EXECUTABLE_STATUSES)
                     .any_of({ next_send_at: nil }, { :next_send_at.lt => time })
                     .find_one_and_update({ "$set" => { next_send_at: time, updated_at: Time.current } }, return_document: :after)
      deferred.present?
    end

    # O próximo destinatário do lote que ninguém pegou. Atômico: o mesmo destinatário nunca sai
    # em duas execuções, inclusive com lotes concorrentes e depois de uma retomada.
    #
    # @return [Recipient, nil]
    def claim_next_recipient
      recipients.status_pending.order_by(_id: 1).find_one_and_update(
        {
          "$set" => {
            status_cd: "sending",
            claim_token: SecureRandom.hex(12),
            claimed_at: Time.current,
            connector_id: connector_id,
            phone_number_id: phone_number_id,
            updated_at: Time.current
          }
        },
        return_document: :after
      )
    end

    # A posição no canal: é ela que escolhe a mensagem e o modelo do rodízio.
    def position_of(recipient)
      position_offset + recipient_ids.index(recipient.id).to_i
    end

    # @return [Boolean] false se outro já terminou
    def complete!
      changed = self.class
                    .where(_id: id, :status_cd.in => EXECUTABLE_STATUSES)
                    .find_one_and_update({ "$set" => { status_cd: "completed", completed_at: Time.current, updated_at: Time.current } })
      changed.present?
    end
  end
end
