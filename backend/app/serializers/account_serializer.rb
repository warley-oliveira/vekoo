class AccountSerializer < ApplicationSerializer
  def self.one(account)
    {
      id: account.id,
      name: account.name,
      email: account.email,
      organizationId: account.organization_id,
      role: account.role,
      phone: account.phone,
      accessRoleId: account.access_role_id,
      permissions: account.permission_map,
      createdAt: epoch_ms(account.created_at)
    }
  end
end
