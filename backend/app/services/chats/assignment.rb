module Chats
  # Para quem uma conversa pode ir. Vale para a atribuição de uma conversa, para a ação em lote
  # em contatos e para o copiloto.
  module Assignment
    module_function

    # Quem recebe atendimentos: ativo e sem `setupOnly` ("Não atribuir atendimentos"). A coluna
    # aceita nulo, que quer dizer "atende normalmente" (ver Account).
    def assignable_accounts(organization)
      organization.accounts.active.where(setup_only: [ false, nil ])
    end

    def assignable?(organization, account_id)
      return false if account_id.blank?

      assignable_accounts(organization).exists?(id: account_id.to_s)
    end

    def valid_team?(organization, team_id)
      return false if team_id.blank?

      organization.teams.exists?(id: team_id.to_s)
    end
  end
end
