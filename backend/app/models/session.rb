# Sessão por token portador (Bearer). O token cru aparece uma única vez — na
# resposta de entrar/criar conta — e nunca vai para o banco: guardamos só o
# resumo. Quando o cookie httpOnly entrar no lugar, muda o transporte, não isto.
class Session < ApplicationRecord
  DURATION = 30.days

  belongs_to :account

  scope :active, -> { where(expires_at: Time.current..) }

  # Token cru da sessão recém-criada. Some no próximo carregamento do objeto.
  attr_reader :token

  def self.digest(token)
    Digest::SHA256.hexdigest(token.to_s)
  end

  def self.authenticate(token)
    return nil if token.blank?

    # Revogar já apaga as sessões; o `merge` fecha a corrida com quem estava entrando
    # naquele instante. Vale para a API e para o WebSocket, que passam os dois aqui.
    active.joins(:account).merge(Account.active).find_by(token_digest: digest(token))
  end

  # Abre a sessão e devolve o registro já com o token cru em memória.
  def self.start!(account, user_agent: nil, ip_address: nil)
    token = SecureRandom.urlsafe_base64(32)
    session = create!(
      account: account,
      token_digest: digest(token),
      user_agent: user_agent&.truncate(255),
      ip_address: ip_address,
      expires_at: DURATION.from_now,
      last_used_at: Time.current
    )
    session.instance_variable_set(:@token, token)
    session
  end

  # Revogar apaga as sessões, e sem mais nada o próximo pedido daquele navegador seria um
  # 401 igual ao de token vencido: a pessoa cairia no login sem saber por quê. O cache
  # guarda de quem era cada token até o dia em que ele venceria. Cache perdido só devolve
  # o 401 comum, e o login continua explicando.
  def self.remember_revoked(sessions)
    sessions.each do |session|
      remaining = session.expires_at - Time.current
      next unless remaining.positive?

      Rails.cache.write(revoked_key(session.token_digest), session.account_id, expires_in: remaining)
    end
  end

  # A conta é conferida agora: quem foi restaurado não tem mais o que ser avisado, e o
  # token antigo dele é só um token que não vale.
  def self.revoked_token?(token)
    return false if token.blank?

    account_id = Rails.cache.read(revoked_key(digest(token)))
    account_id.present? && Account.revoked.exists?(id: account_id)
  end

  def self.revoked_key(token_digest)
    "session.revoked.#{token_digest}"
  end
  private_class_method :revoked_key

  def touch_usage!
    update_column(:last_used_at, Time.current)
  end
end
