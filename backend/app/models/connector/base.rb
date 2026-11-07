# Um canal de atendimento ligado à organização (origem: Integration::Base). Subclasses:
# WhatsappCloud, WhatsappWeb (com providers), Zapi, InstagramDirect, FacebookMessenger,
# LeadChat e WebWidget.
#
# Contrato de envio, igual para todo conector (é por ele que os outros domínios falam
# com o canal; ver docs/migration/api/connectors.md):
#
#   send_text_message(to, text, chat = nil, reply_to_external_id: nil) → id externo (String) ou nil
#   send_media_message(to, media_dto, chat = nil)
#   send_audio_message_by_url(to, url, chat = nil)
#   mark_read_message(to, message_id)
#   send_presence(to, presence)
class Connector::Base
  include Mongoid::Document
  include Mongoid::Timestamps
  include StringEnum
  include EncryptedField

  field :organization_id, type: String
  string_enum :status, %i[inactive active paused pending failed closed reject]
  field :send_collaborator_name, type: Boolean, default: false
  # Por que a conexão falhou, para a pessoa ver na tela.
  field :error_message, type: String

  index({ organization_id: 1, status_cd: 1 })

  # Ligado por quem já sabe que o canal conectou (o webhook do provedor). Aí o perfil é um
  # complemento, e a falha ao buscá-lo não pode deixar como desconectado um canal que conectou.
  # Reativar pela tela não liga: lá a falha do provedor precisa chegar à pessoa.
  attr_accessor :tolerate_profile_failure

  # Evolution, Z-API e LeadChat não assinam o que mandam, e essas rotas não têm sessão. WhatsApp oficial,
  # Messenger e Instagram são assinados pela Meta, e o Google manda o token do canal.
  TOKEN_ROUTES = %i[evolution lead_chat_event zapi_message_received zapi_message_send zapi_disconnected zapi_connected].freeze

  validates :organization_id, presence: true

  has_many :chats, class_name: "Chat", inverse_of: :connector, dependent: :destroy
  has_one :proxy, class_name: "Proxy", inverse_of: :connector, dependent: :nullify

  before_create do
    self.status = :inactive if status.nil?
  end

  # A única forma de carregar um conector por id vindo de fora: escopada pela organização.
  def self.scoped(organization_id, id)
    where(organization_id: organization_id.to_s, id: id).take
  end

  # Só os canais de atendimento. O Google Agenda também é um conector, mas não conversa: ele
  # não entra na tela de canais nem nas ações de canal (ver `Connector::GoogleCalendar`).
  def self.channels
    where(:_type.ne => "Connector::GoogleCalendar")
  end

  def activate
    raise NotImplementedError, "Subclasses must implement the 'activate' method."
  end

  def deactivate
    raise NotImplementedError, "Subclasses must implement the 'deactivate' method."
  end

  def organization
    @organization ||= Organization.find_by(id: organization_id)
  end

  def status_name
    status.to_s
  end

  def type
    _type
  end

  # O tipo como a tela e a API conhecem: whatsapp_cloud, whatsapp_web, instagram_direct...
  def connector_type
    self.class.name.demodulize.underscore
  end

  # Nome legível do canal. Toda subclasse tem um, e é ele que aparece nos avisos.
  def instance_name
    id.to_s
  end

  def display_name
    instance_name
  end

  # Stream de conexão (QR code, escaneou, caiu) que `ConnectorsChannel` escuta.
  def stream_name
    ApplicationCable::Channel.organization_stream(organization_id, "connector:#{id}")
  end

  def broadcast_connection(payload)
    ActionCable.server.broadcast(stream_name, payload)
  end

  # URL pública de um webhook de entrada deste backend. Nas rotas de provedor que não assina nada, leva o
  # token do conector.
  def inbound_url(route, *args)
    options = TOKEN_ROUTES.include?(route) ? { token: inbound_token } : {}
    path = Rails.application.routes.url_helpers.public_send("inbound_#{route}_path", *args, **options)
    "#{Media::Storage.backend_url}#{path}"
  end

  # O que só o provedor sabe, porque fomos nós que entregamos a ele junto com o endereço. Derivado, e não
  # guardado: vale enquanto `secret_key_base` valer, como os tokens cifrados dos conectores.
  def inbound_token
    OpenSSL::HMAC.hexdigest("SHA256", Rails.application.key_generator.generate_key("connector inbound webhook", 32), id.to_s)
  end
end
