# Assinatura Web Push de uma pessoa em um dispositivo (navegador).
class PushDevice < ApplicationRecord
  # Quem recebe a assinatura depois faz o servidor dar POST nesse endereço. Serviço de
  # push é sempre HTTPS com nome público: nada de IP nem de nome interno, senão a API
  # viraria uma forma de alcançar a rede por dentro.
  INTERNAL_HOST = /(\A|\.)(localhost|local|internal|intranet|lan|home|corp)\z/i

  belongs_to :organization
  belongs_to :account

  before_validation { self.organization_id = account&.organization_id }

  validates :endpoint, presence: true, uniqueness: true, length: { maximum: 2048 }
  validates :p256dh_key, presence: true
  validates :auth_key, presence: true
  validate :endpoint_is_public_https

  # O endpoint identifica o navegador: quem entra com outra conta nele herda a
  # assinatura, e a conta anterior para de receber ali.
  def self.register!(account:, endpoint:, p256dh_key:, auth_key:, user_agent: nil)
    device = find_or_initialize_by(endpoint: endpoint)
    device.update!(account: account, p256dh_key: p256dh_key, auth_key: auth_key, user_agent: user_agent)
    device
  rescue ActiveRecord::RecordNotUnique
    # O mesmo navegador assinando duas vezes ao mesmo tempo: a linha agora existe.
    retry
  end

  private

  def endpoint_is_public_https
    return if endpoint.blank?

    errors.add(:endpoint, :invalid) unless public_https?(endpoint)
  end

  def public_https?(value)
    uri = URI.parse(value)
    host = uri.hostname.to_s

    uri.is_a?(URI::HTTPS) && host.include?(".") && !ip_literal?(host) && !host.match?(INTERNAL_HOST)
  rescue URI::InvalidURIError
    false
  end

  def ip_literal?(host)
    IPAddr.new(host)
    true
  rescue IPAddr::Error
    false
  end
end
