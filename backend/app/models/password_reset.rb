# Pedido de nova senha. Mesmo cuidado da sessão: o banco guarda só o resumo do
# token, e o pedido vale uma vez só.
class PasswordReset < ApplicationRecord
  DURATION = 2.hours

  belongs_to :account

  scope :usable, -> { where(used_at: nil, expires_at: Time.current..) }

  attr_reader :token

  def self.digest(token)
    Digest::SHA256.hexdigest(token.to_s)
  end

  def self.find_usable(token)
    return nil if token.blank?

    usable.find_by(token_digest: digest(token))
  end

  def self.open!(account)
    token = SecureRandom.urlsafe_base64(32)
    reset = create!(
      account: account,
      token_digest: digest(token),
      expires_at: DURATION.from_now
    )
    reset.instance_variable_set(:@token, token)
    reset
  end

  def use!
    update!(used_at: Time.current)
  end
end
