# Credencial OAuth2 (client credentials) para chamar sistemas de terceiros. Na origem
# (`Oauth2Token`) pertencia ao assistente; aqui é da organização.
class OauthCredential < ApplicationRecord
  TOKEN_EXPIRATION_BUFFER = 5.minutes.freeze

  belongs_to :organization

  validates :key_name, presence: true, uniqueness: { scope: :organization_id }
  validates :endpoint, presence: true, format: { with: URI::DEFAULT_PARSER.make_regexp(%w[http https]) }
  validates :client_id, presence: true
  validates :client_secret, presence: true

  scope :expired, -> { where("expires_at IS NULL OR expires_at <= ?", Time.current) }
  scope :valid, -> { where("expires_at > ?", Time.current) }

  # Cifrados com o mesmo encryptor dos tokens guardados no Mongo (`EncryptedField`).
  def client_secret
    decrypt(self[:client_secret])
  end

  def client_secret=(value)
    self[:client_secret] = encrypt(value)
  end

  def token_data
    decrypt(self[:token_data])
  end

  def token_data=(value)
    self[:token_data] = encrypt(value)
  end

  # Retorna o token válido, renovando se necessário. Lock pessimista para dois processos
  # não renovarem ao mesmo tempo.
  def access_token
    with_lock do
      return parsed_token_data["access_token"] if token_valid?

      refresh_token!
      parsed_token_data["access_token"]
    end
  rescue StandardError => e
    Rails.logger.error "[OauthCredential] Erro ao obter token: #{e.message}"
    raise
  end

  def token_valid?
    return false if token_data.blank?

    parsed_data = parsed_token_data
    return false if parsed_data.blank? || parsed_data["access_token"].blank?
    return false if expires_at.blank?

    expires_at > (Time.current + TOKEN_EXPIRATION_BUFFER)
  end

  def refresh_token!
    response = request_new_token

    if response.success?
      update_token_data(response)
    else
      handle_token_error(response)
    end
  end

  def clear_token!
    update!(token_data: nil, expires_at: nil)
  end

  private

  def encrypt(value)
    value.present? ? EncryptedField.encryptor.encrypt_and_sign(value) : nil
  end

  def decrypt(ciphertext)
    ciphertext.present? ? EncryptedField.encryptor.decrypt_and_verify(ciphertext) : nil
  rescue ActiveSupport::MessageEncryptor::InvalidMessage, ActiveSupport::MessageVerifier::InvalidSignature
    nil
  end

  # Sem memoizar: o token muda ao renovar, e o bloqueio de `access_token` relê a linha porque
  # outro processo pode ter renovado antes.
  def parsed_token_data
    return {} if token_data.blank?

    JSON.parse(token_data)
  rescue JSON::ParserError => e
    Rails.logger.error "[OauthCredential] Erro ao fazer parse do token_data: #{e.message}"
    {}
  end

  def request_new_token
    HTTParty.post(
      endpoint,
      body: {
        client_id: client_id,
        client_secret: client_secret,
        grant_type: "client_credentials"
      }.to_json,
      headers: { "Content-Type" => "application/json" },
      timeout: 30
    )
  rescue HTTParty::Error, Net::ReadTimeout, Net::OpenTimeout => e
    Rails.logger.error "[OauthCredential] Erro na requisição HTTP: #{e.message}"
    raise
  end

  def update_token_data(response)
    # Sistema de terceiro nem sempre manda o cabeçalho de JSON, e aí o HTTParty devolve texto.
    data = response.parsed_response
    data = JSON.parse(data) if data.is_a?(String)

    new_expires_at =
      if data["expires_in"].present?
        Time.current + data["expires_in"].to_i.seconds
      else
        # Fallback: 1 hora se o servidor não retornar expires_in
        Time.current + 1.hour
      end

    update!(token_data: data.to_json, expires_at: new_expires_at)

    Rails.logger.info "[OauthCredential] Token renovado com sucesso. Expira em: #{expires_at}"
  end

  # Sem o corpo no erro: ele pode ecoar a credencial.
  def handle_token_error(response)
    error_message = "Falha ao obter token OAuth2. Status: #{response.code}"

    Rails.logger.error "[OauthCredential] #{error_message}"
    raise StandardError, error_message
  end
end
