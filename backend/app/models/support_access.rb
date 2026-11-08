# Registro de cada entrada do suporte do Vekoo (`User#master`) numa organização: quem, quando, de
# onde. Só leitura pelo console:
#
#   SupportAccess.recent.includes(:user, :organization).limit(20)
#   SupportAccess.where(organization: org).recent
class SupportAccess < ApplicationRecord
  # Entrar pela tela registra sempre. Voltar pela URL (aba reaberta, link guardado) registra de
  # novo depois deste intervalo sem uso, para o registro não depender da tela.
  RESUME_AFTER = 30.minutes

  belongs_to :user
  belongs_to :organization
  belongs_to :account, optional: true

  scope :recent, -> { order(created_at: :desc) }

  def self.record!(account, ip_address: nil, user_agent: nil)
    create!(user_id: account.user_id, organization_id: account.organization_id, account_id: account.id,
      ip_address: ip_address, user_agent: user_agent&.truncate(255))
  end

  # Para cada requisição de quem usa o vínculo de suporte: registra se o último uso ficou para trás.
  def self.touch!(account, ip_address: nil, user_agent: nil)
    key = "support_access.#{account.id}"
    return if Rails.cache.read(key)

    Rails.cache.write(key, true, expires_in: RESUME_AFTER)
    last = where(account_id: account.id).maximum(:created_at)
    record!(account, ip_address: ip_address, user_agent: user_agent) if last.nil? || last < RESUME_AFTER.ago
  end
end
