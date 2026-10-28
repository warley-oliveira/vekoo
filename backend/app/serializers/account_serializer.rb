class AccountSerializer < ApplicationSerializer
  def self.one(account)
    {
      id: account.id,
      name: account.name,
      email: account.email,
      organizationId: account.organization_id,
      role: account.role,
      # Conta da Vekoo: a tela abre a área `/admin` (que a API confere de novo).
      staff: account.staff?,
      createdAt: epoch_ms(account.created_at)
    }
  end
end
