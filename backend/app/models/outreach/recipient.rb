# Um destinatário de campanha. Origem: Campaign::Recipient.
#
# Idempotência de envio, em três marcas:
#
#   `status_cd: sending` + `claim_token`   a tomada é atômica: só uma execução fica com ele.
#   `dispatched_at`                        gravado ANTES de falar com o canal. A partir daqui,
#                                          se o worker morrer, não dá para saber se saiu.
#   `sent`/`failed`                        a saída só vale se o token ainda for este.
#
# Sem `dispatched_at`, nada saiu e recuperar pode tentar de novo. Com ele, a recuperação não
# reenvia: ver `Outreach::StuckRecipients`.
module Outreach
  class Recipient
    include Mongoid::Document
    include Mongoid::Timestamps
    include StringEnum

    TERMINAL_STATUSES = %w[sent delivered read failed skipped].freeze
    UNSENT_STATUSES = %w[pending sending].freeze
    ERROR_MESSAGE_LIMIT = 255

    belongs_to :campaign, class_name: "Outreach::Campaign", inverse_of: :recipients

    # A conversa de onde veio, quando a importação foi da base de contatos.
    field :contact_id, type: String
    field :phone, type: String
    # A mesma para as duas formas do 9º dígito: é a mesma conta de WhatsApp. É nela que vale o índice
    # único, para duas importações ao mesmo tempo não porem a mesma pessoa duas vezes.
    field :phone_key, type: String
    field :name, type: String
    field :custom_variables, type: Hash, default: {}

    # Com prefixo: `Criteria#read` já existe (preferência de leitura), e um escopo `.read` faria
    # `campaign.recipients.read` devolver todo mundo sem nenhum erro.
    string_enum :status, %i[pending sending sent delivered read failed skipped], default: :pending, prefix: :status

    field :connector_id, type: String
    field :phone_number_id, type: String
    field :chat_id, type: String
    field :whatsapp_message_id, type: String

    field :claim_token, type: String
    field :claimed_at, type: Time
    field :dispatched_at, type: Time

    field :sent_at, type: Time
    field :delivered_at, type: Time
    field :read_at, type: Time

    # Código que a tela traduz (`whatsappError`, `numberNotFound`, `interrupted`).
    field :error_code, type: String
    # O motivo dado pelo canal, quando há um pronto para mostrar.
    field :error_message, type: String

    before_validation { self.phone_key = self.class.key_for(phone) }

    validates :phone, presence: true
    validates :phone_key, uniqueness: { scope: :campaign_id }

    index({ campaign_id: 1, phone_key: 1 }, { unique: true })
    # Ordem por `_id`: as importações gravam em bloco, com o mesmo `created_at`, e a paginação
    # por ele não seria estável.
    index({ campaign_id: 1, _id: 1 })
    index({ campaign_id: 1, status_cd: 1, _id: 1 })
    index({ whatsapp_message_id: 1 }, { sparse: true })
    # Parcial: só quem está no meio do envio entra, então o índice fica minúsculo mesmo com
    # milhões de destinatários, e a recuperação nunca varre a coleção.
    index({ claimed_at: 1 }, { partial_filter_expression: { status_cd: "sending" } })

    scope :unsent, -> { where(:status_cd.in => UNSENT_STATUSES) }
    scope :terminal, -> { where(:status_cd.in => TERMINAL_STATUSES) }

    # Texto de busca da lista do monitor.
    scope :matching, lambda { |query|
      pattern = /#{Regexp.escape(query.to_s)}/i
      any_of({ name: pattern }, { phone: pattern })
    }

    def self.key_for(phone)
      digits = BrPhoneVariants.digits_of(phone)
      [ digits, *BrPhoneVariants.ninth_digit_variants(digits) ].min
    end

    def terminal?
      TERMINAL_STATUSES.include?(status_cd)
    end

    # O último passo antes de falar com o canal. Se o token não for mais este, a recuperação
    # já devolveu este destinatário e quem segue é outra execução: não envia.
    #
    # @return [Boolean]
    def mark_dispatched!(chat_id)
      claimed_update("$set" => { dispatched_at: Time.current, chat_id: chat_id.to_s })
    end

    # Devolve quem ainda não foi despachado. Nada saiu, então não conta em nada.
    #
    # @param status [String] pending, ou skipped em campanha cancelada
    # @return [Boolean]
    def release_claim!(status = "pending")
      claimed_update("$set" => { status_cd: status }, "$unset" => { claim_token: true, claimed_at: true })
    end

    # @return [Boolean] false se a saída já foi resolvida por outro caminho
    def finish_sent!(external_id)
      finished = claimed_update(
        "$set" => { status_cd: "sent", whatsapp_message_id: external_id, sent_at: Time.current },
        "$unset" => { claim_token: true }
      )
      Campaign.where(_id: campaign_id).inc(sent_count: 1) if finished
      finished
    end

    # @return [Boolean] false se a saída já foi resolvida por outro caminho
    def finish_failed!(code, detail: nil)
      finished = claimed_update(
        "$set" => { status_cd: "failed", error_code: code, error_message: detail&.truncate(ERROR_MESSAGE_LIMIT), sent_at: Time.current },
        "$unset" => { claim_token: true }
      )
      Campaign.where(_id: campaign_id).inc(failed_count: 1) if finished
      finished
    end

    private

    def claimed_update(update)
      update["$set"][:updated_at] = Time.current
      changed = self.class.where(_id: id, status_cd: "sending", claim_token: claim_token)
                    .find_one_and_update(update, return_document: :after)
      return false unless changed

      reload
      true
    end
  end
end
