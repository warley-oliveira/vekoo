# Sessão por token portador (Bearer). O token cru aparece uma única vez — na
# resposta de entrar/criar conta — e nunca vai para o banco: guardamos só o
# resumo. Quando o cookie httpOnly entrar no lugar, muda o transporte, não isto.
class Session < ApplicationRecord
  DURATION = 30.days

  belongs_to :account
  # Staff pode agir numa organização interna da Vekoo (as marcas de teste)
  # sem trocar de conta. Conferido a cada uso: deixou de ser staff, ou a
  # organização deixou de ser interna, volta à da conta.
  belongs_to :acting_organization, class_name: "Organization", optional: true

  scope :active, -> { where(expires_at: Time.current..) }

  # Token cru da sessão recém-criada. Some no próximo carregamento do objeto.
  attr_reader :token

  def self.digest(token)
    Digest::SHA256.hexdigest(token.to_s)
  end

  def self.authenticate(token)
    return nil if token.blank?

    active.find_by(token_digest: digest(token))
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

  # A organização em que esta sessão age — a de toda requisição e de todo
  # canal do ActionCable.
  def organization
    acting = acting_organization
    acting && account.staff? && acting.internal? ? acting : account.organization
  end

  # As organizações em que esta sessão pode agir: a da conta e, para staff,
  # as internas.
  def organizations
    internal = account.staff? ? Organization.where(internal: true).where.not(id: account.organization_id).order(:name).to_a : []
    [ account.organization, *internal ]
  end

  def touch_usage!
    update_column(:last_used_at, Time.current)
  end
end
