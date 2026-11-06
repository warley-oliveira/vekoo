require 'jwt'

class Connector::WebWidget < Connector::Base
  TOKEN_PREFIX = 'pk_widget_'.freeze
  POSITIONS = %w[bottom-right bottom-left].freeze
  PRE_CHAT_FIELDS = %w[off name name_phone name_phone_email].freeze

  # Cor no formato #RRGGBB, ou vazio (o widget usa o default do token).
  COLOR_FORMAT = /\A#[0-9A-Fa-f]{6}\z/.freeze
  # Whitelist de famílias de fonte (stacks seguros, disponíveis no dispositivo
  # do visitante — fontes web próprias entram via custom_css/@font-face).
  FONT_FAMILIES = ['', 'system', 'inter', 'roboto', 'georgia', 'mono', 'rounded'].freeze
  MAX_CUSTOM_CSS = 8_192

  field :public_token,       type: String
  field :signing_secret,     type: String
  field :allowed_origins,    type: Array,   default: []
  field :primary_color,      type: String,  default: '#5B93FF'
  field :position,           type: String,  default: 'bottom-right'
  field :welcome_message,    type: String,  default: 'Olá! Como posso ajudar?'
  field :bot_avatar_url,     type: String
  field :bot_display_name,   type: String,  default: 'Assistente'
  field :launcher_icon,      type: String,  default: 'chat'
  field :locale,             type: String,  default: 'pt-BR'
  field :rate_limit_per_min, type: Integer, default: 20
  field :daily_message_cap,  type: Integer, default: 0   # 0 = unlimited
  field :daily_visitor_cap,  type: Integer, default: 0   # 0 = unlimited
  field :pre_chat_fields,    type: String,  default: 'name_phone'
  field :auto_page_context,  type: Boolean, default: true
  field :proactive_enabled,  type: Boolean, default: true

  # --- Entrega do bundle ----------------------------------------------------
  # rolling: carrega widget.v1.js, sempre a última versão (default histórico).
  # pinned:  congela numa versão específica, servida com Subresource Integrity.
  #          Para clientes que exigem revisar o código antes de ele entrar na
  #          infra deles. Nenhum deploy nosso alcança quem está pinado.
  field :delivery_mode,  type: String, default: Widget::ReleaseRegistry::ROLLING
  field :pinned_version, type: String

  # --- Aparência (personalização visual do widget) --------------------------
  # Cores vazias caem no fallback do widget (primary_color / defaults do CSS).
  field :launcher_image_url,          type: String
  field :launcher_size,               type: Integer, default: 60
  field :header_bg_color,             type: String
  field :header_text_color,           type: String
  field :user_bubble_color,           type: String
  field :user_bubble_text_color,      type: String
  field :assistant_bubble_color,      type: String
  field :assistant_bubble_text_color, type: String
  field :message_area_bg,             type: String
  field :bubble_radius,               type: Integer, default: 16
  field :panel_radius,                type: Integer, default: 18
  field :font_family,                 type: String,  default: ''
  field :custom_css,                  type: String,  default: ''

  # `sparse`: a coleção é de todos os conectores, e nos outros tipos o campo nem existe. Sem
  # isso o segundo conector que não é widget bate em `public_token: null` e não é criado.
  index({ public_token: 1 }, { unique: true, sparse: true })

  COLOR_FIELDS = %i[
    primary_color header_bg_color header_text_color user_bubble_color
    user_bubble_text_color assistant_bubble_color assistant_bubble_text_color
    message_area_bg
  ].freeze

  validates :public_token, presence: true, uniqueness: true
  validates :signing_secret, presence: true
  validates :position, inclusion: { in: POSITIONS }
  validates :rate_limit_per_min, numericality: { greater_than: 0, less_than_or_equal_to: 1000 }
  validates :daily_message_cap, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 1_000_000 }
  validates :daily_visitor_cap, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 1_000_000 }
  validates :pre_chat_fields, inclusion: { in: PRE_CHAT_FIELDS }

  validates(*COLOR_FIELDS, format: { with: COLOR_FORMAT }, allow_blank: true)
  validates :launcher_size, numericality: { greater_than_or_equal_to: 40, less_than_or_equal_to: 96 }
  validates :bubble_radius, numericality: { greater_than_or_equal_to: 0, less_than_or_equal_to: 32 }
  validates :panel_radius, numericality: { greater_than_or_equal_to: 8, less_than_or_equal_to: 32 }
  validates :font_family, inclusion: { in: FONT_FAMILIES }, allow_nil: true
  validates :custom_css, length: { maximum: MAX_CUSTOM_CSS }
  validates :delivery_mode, inclusion: { in: Widget::ReleaseRegistry::DELIVERY_MODES }
  validate :pinned_version_must_be_known

  before_validation :assign_credentials, on: :create

  def instance_name
    bot_display_name.presence || super
  end

  def pinned?
    delivery_mode == Widget::ReleaseRegistry::PINNED
  end

  def activate
    active!
    save!
  end

  def deactivate
    closed!
    save!
  end

  # Polymorphic outbound entrypoint called by ChatChannel (human operators) and flows. Delivery is asynchronous from the visitor's perspective:
  # we broadcast on ActionCable and return a generated message_id synchronously so
  # the rest of the pipeline can persist `ChatMessage::Text#message_id`.
  def send_text_message(_external_id, message, chat = nil, reply_to_external_id: nil) # rubocop:disable Lint/UnusedMethodArgument
    return nil unless chat

    message_id = SecureRandom.uuid
    ActionCable.server.broadcast(
      chat_stream(chat),
      {
        type: 'message',
        role: 'assistant',
        message_id: message_id,
        content: message,
        sender_name: bot_display_name,
        sent_at: Time.current.iso8601
      }
    )
    message_id
  end

  # Broadcasts an image/audio/video.
  # MediaMessageDto carries `media_type` (image/audio/video), `media_url` and
  # an optional `caption`. The widget renders inline media when media_url is
  # present in the payload.
  def send_media_message(external_id, media_dto, chat = nil)
    chat ||= chat_for(external_id)
    return nil unless chat && media_dto

    media_url = resolve_media_url(media_dto)
    return nil if media_url.blank?

    broadcast_media(chat, media_dto.media_type.to_s, media_url, media_dto.try(:caption).to_s)
  end

  # Direct URL variant used by ChatsController#send_audio
  # (human operator uploading an audio recording from the admin panel) and by
  # webhook actions that already resolved the asset URL.
  def send_audio_message_by_url(external_id, audio_url, chat = nil)
    chat ||= chat_for(external_id)
    return nil unless chat && audio_url.present?

    broadcast_media(chat, 'audio', audio_url, '')
  end

  def mark_read_message(*) = true

  def send_presence(_external_id, presence, chat = nil)
    return true unless chat && %w[composing paused].include?(presence.to_s)

    ActionCable.server.broadcast(
      chat_stream(chat),
      { type: 'presence', value: presence.to_s }
    )
    true
  end

  # ActionCable stream do widget de um visitante. A chave é conhecida já no
  # connect (visitor_id vem do JWT) e não muda quando a conversa é criada —
  # um stream por chat.id deixava o socket aberto antes da 1ª
  # mensagem ouvindo um stream que nunca mais recebia nada.
  def visitor_stream(visitor_id)
    "widget_visitor_#{id}_#{visitor_id}"
  end

  def chat_stream(chat)
    visitor_stream(chat.external_id)
  end

  def reload_instance = true

  def logout_instance
    deactivate
  end

  def issue_visitor_jwt(visitor_id, ttl: 24.hours)
    payload = {
      visitor_id: visitor_id,
      connector_id: id.to_s,
      exp: ttl.from_now.to_i
    }
    JWT.encode(payload, signing_secret, 'HS256')
  end

  def decode_visitor_jwt(token)
    return nil if token.blank? || signing_secret.blank?

    JWT.decode(token, signing_secret, true, algorithm: 'HS256').first
  rescue JWT::DecodeError, JWT::ExpiredSignature
    nil
  end

  def regenerate_credentials!
    self.public_token = self.class.generate_public_token
    self.signing_secret = self.class.generate_signing_secret
    save!
  end

  def origin_allowed?(origin)
    return true if allowed_origins.blank?
    return false if origin.blank?

    allowed_origins.include?(origin)
  end

  def self.generate_public_token
    "#{TOKEN_PREFIX}#{SecureRandom.urlsafe_base64(24)}"
  end

  def self.generate_signing_secret
    SecureRandom.hex(32)
  end

  private

  def assign_credentials
    self.public_token   ||= self.class.generate_public_token
    self.signing_secret ||= self.class.generate_signing_secret
  end

  # Só permitimos pinar numa versão cujo hash SRI está revisado em
  # config/widget_releases.yml — sem isso o snippet sairia com `integrity`
  # vazio e o cliente ficaria sem a garantia que pediu.
  def pinned_version_must_be_known
    return unless pinned?

    if pinned_version.blank?
      errors.add(:pinned_version, 'é obrigatório quando delivery_mode é pinned')
    elsif !Widget::ReleaseRegistry.known?(pinned_version)
      errors.add(:pinned_version, "versão desconhecida: #{pinned_version}")
    end
  end

  def chat_for(external_id)
    return nil if external_id.blank?

    Chat.where(connector_id: id, external_id: external_id).take
  end

  def broadcast_media(chat, media_type, media_url, caption)
    message_id = SecureRandom.uuid
    ActionCable.server.broadcast(
      chat_stream(chat),
      {
        type: 'message',
        role: 'assistant',
        message_id: message_id,
        media_type: media_type,
        media_url: media_url,
        content: caption.to_s,
        sender_name: bot_display_name,
        sent_at: Time.current.iso8601
      }
    )
    message_id
  end

  def resolve_media_url(media_dto)
    media_dto.respond_to?(:media_url) ? media_dto.media_url : nil
  rescue StandardError
    nil
  end
end
