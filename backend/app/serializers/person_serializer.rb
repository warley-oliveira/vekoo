# A pessoa como `/users` a mostra.
class PersonSerializer < ApplicationSerializer
  # Para quem administra (`core_settings`): a conta inteira mais o que a tela de usuários usa.
  def self.one(account)
    AccountSerializer.one(account).merge(
      teamIds: team_ids(account),
      setupOnly: account.setup_only,
      revokedAt: epoch_ms(account.revoked_at)
    )
  end

  # Para quem só precisa achar o colega no chat, na agenda e nos pipelines: o bastante
  # para listar e atribuir, sem telefone, grupo nem permissões.
  def self.directory_entry(account)
    {
      id: account.id,
      name: account.name,
      email: account.email,
      avatarUrl: StoredImagePath.for(account.avatar, :thumb),
      teamIds: team_ids(account),
      setupOnly: account.setup_only
    }
  end

  # `map`, e não `team_ids`: aproveita as associações pré-carregadas pela listagem.
  def self.team_ids(account)
    account.team_memberships.map(&:team_id)
  end
  private_class_method :team_ids
end
