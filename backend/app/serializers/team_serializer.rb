class TeamSerializer < ApplicationSerializer
  # `accounts_count` vem de fora quando a listagem já contou tudo de uma vez.
  def self.one(team, accounts_count: nil)
    {
      id: team.id,
      name: team.name,
      active: team.active,
      accountsCount: accounts_count || team.accounts.active.count,
      createdAt: epoch_ms(team.created_at)
    }
  end
end
