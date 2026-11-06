# Campanha: um disparo em massa da organização. Origem: Campaign::Base.
#
# Quem responde ao destinatário: na origem a campanha apontava para um assistente, que aqui não
# existe. O equivalente é `flow_id`, opcional e guardado como texto, porque `Flow` é do domínio
# automation. Ver `Outreach::RecipientChat`.
module Outreach
  class Campaign
    include Mongoid::Document
    include Mongoid::Timestamps
    include StringEnum
    include PublicMediaUrl

    DEFAULT_TIMEZONE = "America/Sao_Paulo".freeze
    # Só o que a tela de campanhas oferece. O resto dos canais não fala por telefone.
    SENDABLE_CONNECTORS = %w[Connector::WhatsappWeb Connector::WhatsappCloud].freeze
    MEDIA_KINDS_WITH_CAPTION = %w[image video].freeze
    ACTIVITY_LOG_LIMIT = 100

    field :organization_id, type: String
    field :created_by_account_id, type: String

    field :name, type: String
    field :messages, type: Array, default: []
    field :media_url, type: String
    # `Attachment` é do domínio inbox: só se toca nele por `Media::AttachmentLookup`.
    field :attachment_id, type: String
    field :media_content_type, type: String
    field :media_file_name, type: String

    # Com prefixo: os dois enums têm `text`, e sem ele `text?`, `text!` e o escopo `.text` de
    # um sobrescreveriam os do outro em silêncio.
    string_enum :message_type, %i[text media], default: :text, prefix: :message
    string_enum :campaign_mode, %i[text template], default: :text, prefix: :mode
    string_enum :status, %i[draft scheduled running paused completed cancelled], default: :draft

    # Canais do modo texto.
    field :connector_ids, type: Array, default: []

    # Modo modelo: a WABA, os números dela e os modelos.
    field :waba_connector_id, type: String
    field :phone_number_ids, type: Array, default: []
    field :template_ids, type: Array, default: []
    # { "<id do modelo>" => { "<posição do parâmetro>" => "valor com {{variáveis}}" } }
    field :template_params, type: Hash, default: {}

    # O fluxo que responde a quem receber a campanha. Vazio: vale a automação normal da conversa.
    field :flow_id, type: String

    field :chat_tag_ids, type: Array, default: []
    field :raise_chats, type: Boolean, default: true

    # Janela e ritmo de envio.
    field :send_start_hour, type: Integer, default: 8
    field :send_end_hour, type: Integer, default: 18
    field :send_days, type: Array, default: [ 1, 2, 3, 4, 5 ]
    field :buffer_min_seconds, type: Integer, default: 3
    field :buffer_max_seconds, type: Integer, default: 10
    field :daily_limit_per_connector, type: Integer, default: 300
    field :timezone, type: String, default: DEFAULT_TIMEZONE
    field :batch_size, type: Integer, default: 50

    # Contadores. Só mudam por `$inc`: dois lotes podem terminar um envio ao mesmo tempo.
    field :recipients_count, type: Integer, default: 0
    field :sent_count, type: Integer, default: 0
    field :delivered_count, type: Integer, default: 0
    field :read_count, type: Integer, default: 0
    field :failed_count, type: Integer, default: 0

    field :scheduled_at, type: Time
    field :started_at, type: Time
    field :completed_at, type: Time
    field :estimated_completion_at, type: Time
    # Última vez que os lotes foram montados. A recuperação espera um pouco depois disto, para
    # não remontar o que a requisição de lançar ainda está montando.
    field :planned_at, type: Time

    # Cancelamento por token, sem `Sidekiq::Status` e sem varrer a fila: todo job leva o token
    # que recebeu, e cada mudança de estado grava outro. O agendamento antigo chega ao seu
    # horário, confere e não faz nada.
    field :run_token, type: String
    # Código do motivo quando a própria plataforma pausou. Quem traduz é a tela.
    field :pause_reason, type: String

    has_many :recipients, class_name: "Outreach::Recipient", inverse_of: :campaign, dependent: :delete_all
    has_many :batches, class_name: "Outreach::Batch", inverse_of: :campaign, dependent: :delete_all
    has_many :activity_logs, class_name: "Outreach::ActivityLog", inverse_of: :campaign, dependent: :delete_all

    validates :organization_id, presence: true
    validates :name, presence: true, length: { maximum: 160 }
    validates :flow_id, length: { maximum: 64 }
    validates :batch_size, numericality: { greater_than: 0, less_than_or_equal_to: 200 }, allow_nil: true
    validates :daily_limit_per_connector, numericality: { greater_than: 0 }
    validates :buffer_min_seconds, numericality: { greater_than_or_equal_to: 1 }
    validates :buffer_max_seconds, numericality: { greater_than_or_equal_to: 1 }
    validates :send_start_hour, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 23 }
    validates :send_end_hour, numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 24 }
    validate :enums_are_known
    validate :messages_present
    validate :media_attachment_present
    validate :media_content_type_supported
    validate :template_mode_present
    validate :buffer_max_gte_min
    validate :send_days_are_valid
    validate :timezone_is_known
    validate :references_belong_to_organization

    index({ organization_id: 1, created_at: -1 })
    index({ organization_id: 1, status_cd: 1 })
    index({ status_cd: 1, scheduled_at: 1 })

    scope :for_organization, ->(organization_id) { where(organization_id: organization_id.to_s) }
    scope :recent, -> { order_by(created_at: :desc) }

    # A única forma de carregar uma campanha por id vindo de fora.
    def self.scoped(organization_id, id)
      for_organization(organization_id).where(id: id).take
    end

    def self.resolve_media_kind(content_type)
      normalized = content_type.to_s.downcase
      return "image" if normalized.start_with?("image/")
      return "video" if normalized.start_with?("video/")

      "document" if %w[pdf document sheet presentation msword excel powerpoint].any? { |kind| normalized.include?(kind) }
    end

    def template_mode?
      mode_template?
    end

    def text_mode?
      !template_mode?
    end

    def media_message?
      text_mode? && message_media?
    end

    def text_message?
      text_mode? && !message_media?
    end

    def media_kind
      self.class.resolve_media_kind(media_content_type)
    end

    def media_supports_caption?
      MEDIA_KINDS_WITH_CAPTION.include?(media_kind)
    end

    def effective_messages
      Array(messages).select(&:present?)
    end

    def normalized_phone_number_ids
      Array(phone_number_ids).filter_map { |id| id.to_s.presence }
    end

    def time_zone
      ActiveSupport::TimeZone[timezone.to_s] || ActiveSupport::TimeZone[DEFAULT_TIMEZONE]
    end

    def random_buffer
      rand(buffer_min_seconds..buffer_max_seconds).seconds
    end

    def average_buffer
      (buffer_min_seconds + buffer_max_seconds) / 2.0
    end

    def total_recipients
      recipients_count
    end

    # Sempre escopado pela organização: a origem buscava pelos ids soltos, e uma campanha podia
    # disparar pelo canal de outra conta só por conhecer o id.
    def connectors
      Connector::Base.where(organization_id: organization_id, :_id.in => connector_ids, :_type.in => SENDABLE_CONNECTORS)
    end

    def waba_connector
      return nil if waba_connector_id.blank?

      Connector::WhatsappCloud.where(organization_id: organization_id, id: waba_connector_id).take
    end

    def templates
      connector = waba_connector
      return WhatsappTemplate.none if connector.nil? || template_ids.blank?

      connector.whatsapp_templates.where(:_id.in => template_ids)
    end

    # O anexo da mídia da campanha, quando ainda existe.
    def media_attachment
      return @media_attachment if defined?(@media_attachment)

      @media_attachment = Media::AttachmentLookup.find(attachment_id, organization_id: organization_id)
    end

    # URL pública da mídia, pronta para o envio.
    #
    # `media_url` é um retrato tirado quando a campanha foi salva e não pode ser a fonte da
    # verdade no disparo: a campanha pode ficar semanas agendada, e o anexo pode ter sido trocado
    # ou apagado nesse meio-tempo. Recalcular a partir do anexo devolve sempre o link persistente,
    # e `public_media_url` descarta o CDN interno da Meta, que dá 403 no download dela.
    #
    # @return [String, nil]
    def resolved_media_url
      return public_media_url(media_attachment.file_url) if media_attachment

      candidate = public_media_url(media_url)
      return nil if candidate.blank?

      attachment = Media::AttachmentLookup.from_file_url(candidate)
      attachment ? public_media_url(attachment.file_url) : candidate
    end

    # Muda de estado só se ainda estiver em `from`, de forma atômica: dois cliques em "Lançar",
    # ou dois lotes terminando juntos, não fazem a transição duas vezes.
    #
    # @return [Boolean] false quando outro já mudou o estado
    def transition!(from:, to:, **attributes)
      changed = self.class
                    .where(_id: id, :status_cd.in => Array(from).map(&:to_s))
                    .find_one_and_update({ "$set" => attributes.merge(status_cd: to.to_s, updated_at: Time.current) }, return_document: :after)
      return false unless changed

      reload
      true
    end

    # O detalhe da atividade vai em `metadata` como dado (ver `ActivityLogSerializer`): o job não
    # tem idioma, quem traduz é a requisição que lê.
    def log_activity!(action, account_id: nil, metadata: {})
      log = activity_logs.create!(action: action, account_id: account_id, metadata: metadata)
      MonitorEvents.activity(self, log)
      log
    end

    def new_run_token
      SecureRandom.hex(12)
    end

    private

    def enums_are_known
      errors.add(:message_type, :inclusion) unless self.class.message_types.include?(message_type_cd)
      errors.add(:campaign_mode, :inclusion) unless self.class.campaign_modes.include?(campaign_mode_cd)
    end

    def messages_present
      return if template_mode? || media_message?

      errors.add(:messages, :required) if effective_messages.empty?
    end

    def media_attachment_present
      return unless media_message?

      errors.add(:attachment_id, :required) if attachment_id.blank?
      errors.add(:media_url, :required) if media_url.blank?
      errors.add(:media_content_type, :required) if media_content_type.blank?
      errors.add(:media_file_name, :required) if media_file_name.blank?
    end

    def media_content_type_supported
      return if !media_message? || media_content_type.blank? || media_kind.present?

      errors.add(:media_content_type, :unsupported)
    end

    def template_mode_present
      return unless template_mode?

      errors.add(:template_ids, :required) if template_ids.blank?
      errors.add(:waba_connector_id, :required) if waba_connector_id.blank?
      errors.add(:phone_number_ids, :required) if normalized_phone_number_ids.blank?
    end

    def buffer_max_gte_min
      return if buffer_max_seconds.nil? || buffer_min_seconds.nil? || buffer_max_seconds >= buffer_min_seconds

      errors.add(:buffer_max_seconds, :less_than_minimum)
    end

    # Sem dia nenhum, procurar "o próximo dia permitido" nunca terminaria.
    def send_days_are_valid
      days = Array(send_days)
      errors.add(:send_days, :invalid) if days.empty? || !days.all? { |day| day.is_a?(Integer) && day.between?(0, 6) }
    end

    def timezone_is_known
      errors.add(:timezone, :invalid) if ActiveSupport::TimeZone[timezone.to_s].nil?
    end

    # Um id de outra organização é recusado como se não existisse. Só confere o que mudou: uma
    # campanha antiga não fica sem poder salvar porque alguém apagou um canal depois.
    def references_belong_to_organization
      return if organization_id.blank?

      validate_connector_ids if connector_ids_changed?
      validate_waba_connector if waba_connector_id_changed?
      validate_template_ids if template_ids_changed? || waba_connector_id_changed?
      validate_chat_tag_ids if chat_tag_ids_changed?
    end

    def validate_connector_ids
      wanted = Array(connector_ids).map(&:to_s).uniq
      errors.add(:connector_ids, :not_found) if connectors.count != wanted.size
    end

    def validate_waba_connector
      errors.add(:waba_connector_id, :not_found) if waba_connector_id.present? && waba_connector.nil?
    end

    def validate_template_ids
      wanted = Array(template_ids).map(&:to_s).uniq
      errors.add(:template_ids, :not_found) if wanted.any? && templates.count != wanted.size
    end

    def validate_chat_tag_ids
      wanted = Array(chat_tag_ids).map(&:to_s).uniq
      return if wanted.empty?

      errors.add(:chat_tag_ids, :not_found) if ChatTag.where(organization_id: organization_id, :_id.in => wanted).count != wanted.size
    end
  end
end
