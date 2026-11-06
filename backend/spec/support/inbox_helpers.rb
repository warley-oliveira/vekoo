# Apoio às specs do domínio inbox. Espera um `organization` no contexto de quem chama.
module InboxHelpers
  # Membro com exatamente estas permissões: parte do grupo sem nenhum acesso, e `chat_list_to`
  # nunca aceita `none`.
  def member_with(target = organization, **permissions)
    role = create(
      :access_role,
      organization: target,
      permissions: AccessRole::BLANK_PERMISSIONS.merge(permissions.transform_keys(&:to_s))
    )
    create(:account, organization: target, role: "member", access_role: role)
  end

  def member_of_team(team, **permissions)
    member_with(team.organization, **permissions).tap { |account| create(:team_membership, team: team, account: account) }
  end
end

RSpec.configure do |config|
  config.include InboxHelpers
end
