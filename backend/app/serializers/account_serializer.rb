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

  # Para escolher a organização: o bastante para listar, mostrar e abrir, sem permissões. `membersCount`
  # conta as pessoas ativas (o vínculo de suporte não entra); `summaries` faz a contagem de uma vez.
  def self.summary(account, members_count: nil)
    organization = account.organization
    members_count ||= Account.members.active.where(organization_id: organization.id).count
    {
      id: account.id,
      hashid: account.hashid,
      role: account.role,
      support: account.support?,
      lastSeenAt: epoch_ms(account.last_seen_at),
      organization: {
        id: organization.id,
        name: organization.name,
        logoUrl: StoredImagePath.for(organization.logo, :display),
        plan: organization.plan,
        membersCount: members_count,
        creditsLeft: organization.credits_left
      }
    }
  end

  # As organizações da pessoa (sessão, `GET /accounts`): uma consulta para as contagens.
  def self.summaries(accounts)
    accounts = accounts.includes(organization: { logo_attachment: :blob }).to_a
    counts = Account.members.active.where(organization_id: accounts.map(&:organization_id)).group(:organization_id).count
    accounts.map { |account| summary(account, members_count: counts[account.organization_id] || 0) }
  end
end
