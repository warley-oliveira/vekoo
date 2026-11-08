# O vínculo da pessoa com a organização desta aba. Nome, e-mail, telefone, idioma e foto vêm da
# pessoa (`User`) e são os mesmos em todas as organizações; papel, grupo e permissões são deste
# vínculo. `hashid` é o identificador público (URL e `X-Account`); o inteiro que ele codifica
# nunca sai.
class AccountSerializer < ApplicationSerializer
  def self.one(account)
    {
      id: account.id,
      hashid: account.hashid,
      userId: account.user_id,
      name: account.name,
      email: account.email,
      organizationId: account.organization_id,
      role: account.role,
      support: account.support?,
      phone: account.phone,
      locale: account.locale,
      avatarUrl: StoredImagePath.for(account.avatar, :thumb),
      accessRoleId: account.access_role_id,
      permissions: account.permission_map,
      createdAt: epoch_ms(account.created_at)
    }
  end

  # Para escolher a organização: o bastante para listar e abrir, sem permissões.
  def self.summary(account)
    organization = account.organization
    {
      id: account.id,
      hashid: account.hashid,
      role: account.role,
      support: account.support?,
      lastSeenAt: epoch_ms(account.last_seen_at),
      organization: {
        id: organization.id,
        name: organization.name,
        logoUrl: StoredImagePath.for(organization.logo, :display)
      }
    }
  end
end
