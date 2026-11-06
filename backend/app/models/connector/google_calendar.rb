# A conta Google ligada a um calendário da agenda. Não é um canal de atendimento: não conversa
# com ninguém, e por isso fica fora de `/connectors` (`Connector::Base.channels`).
#
# Os tokens ficam aqui, cifrados, como os dos outros conectores. `OauthCredential` não serve:
# ele guarda `client_credentials` de cada organização, e aqui o cliente OAuth é um só (ENV) e o
# que varia é o `refresh_token` de cada conta.
class Connector::GoogleCalendar < Connector::Base
  CALENDAR_SUMMARY = "Vekoo Agendamento".freeze
  CALENDAR_DESCRIPTION = "Calendário do Vekoo".freeze

  encrypted_field :refresh_token
  encrypted_field :access_token
  encrypted_field :channel_token
  field :token_expires_at, type: Time

  # O calendário criado pelo app na conta da pessoa: é o único que o escopo alcança.
  field :google_calendar_id, type: String
  field :google_email, type: String
  field :connected_at, type: Time

  # O canal de avisos do Google. Expira em até 7 dias e é renovado por
  # `Agenda::GoogleCalendarWatchRefreshJob`.
  field :google_channel_id, type: String
  field :google_resource_id, type: String
  field :watch_expires_at, type: Time

  # O aviso do Google é só um "mudou algo". Com este token, puxa-se apenas o que mudou desde a
  # última vez. Nil: a próxima sincronização lê a janela inteira.
  field :sync_token, type: String

  has_many :bookings, class_name: "Agenda::Booking", inverse_of: :connector, dependent: :nullify

  def instance_name
    google_email.presence || "Google Agenda"
  end

  def client
    Agenda::GoogleClient.new(self)
  end

  # Grava o que o Google devolveu ao trocar o código de autorização. Nem sempre vem
  # `refresh_token` numa reconexão: fica o anterior.
  def store_authorization!(tokens)
    tokens = tokens.to_h.stringify_keys
    update!(
      refresh_token: tokens["refresh_token"].presence || refresh_token,
      access_token: tokens["access_token"].presence || access_token,
      token_expires_at: tokens["expires_in"] ? Time.current + tokens["expires_in"].to_i.seconds : token_expires_at,
      google_email: Agenda::GoogleClient.email_from(tokens) || google_email,
      connected_at: Time.current,
      status: :active,
      error_message: nil
    )
  end

  def activate
    update!(status: :active)
    ensure_app_calendar!
    watch!
  end

  # Desconectar não apaga o histórico: os agendamentos continuam, sem o espelho.
  def deactivate
    update!(
      status: :closed,
      refresh_token: nil,
      access_token: nil,
      token_expires_at: nil,
      sync_token: nil,
      google_channel_id: nil,
      google_resource_id: nil,
      watch_expires_at: nil
    )
  end

  def ensure_app_calendar!
    return google_calendar_id if google_calendar_id.present?

    created = client.create_calendar(CALENDAR_SUMMARY, CALENDAR_DESCRIPTION)
    update!(google_calendar_id: created.id)
    created.id
  end

  # Abre (ou renova) o canal de avisos. Idempotente: cria um canal novo e guarda o estado.
  def watch!
    self.channel_token = SecureRandom.hex(24) if channel_token.blank?
    save! if changed?

    channel = client.watch(address: inbound_url(:google_calendar, id), channel_token: channel_token)
    update!(
      google_channel_id: channel.id,
      google_resource_id: channel.resource_id,
      watch_expires_at: channel.expires_at
    )
    channel
  end

  # O Google manda o token de volta em todo aviso. Sem isto, bastaria conhecer o id do conector
  # para disparar sincronizações à vontade.
  def valid_channel_token?(candidate)
    channel_token.present? && candidate.present? &&
      ActiveSupport::SecurityUtils.secure_compare(channel_token, candidate.to_s)
  end

  def event_colors
    client.colors&.event || {}
  end
end
