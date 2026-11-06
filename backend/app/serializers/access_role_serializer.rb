class AccessRoleSerializer < ApplicationSerializer
  # `permissions` sai com as chaves de `AccessRole::KEYS`, as mesmas de
  # `AccountSerializer#permissions`. `defaultKey` (`manager`, `member` ou null) é o
  # código com que a tela traduz o nome dos grupos padrão.
  def self.one(role, accounts_count: nil)
    {
      id: role.id,
      name: role.name,
      permissions: role.permissions,
      default: role.default?,
      defaultKey: role.default_key,
      accountsCount: accounts_count || role.accounts.active.count,
      createdAt: epoch_ms(role.created_at),
      updatedAt: epoch_ms(role.updated_at)
    }
  end
end
