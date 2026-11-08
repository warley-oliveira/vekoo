# A sessão que a tela recebe: quem entrou (`user`), as organizações dela (`accounts`, um vínculo
# por organização) e, quando a requisição diz em qual organização está (`X-Account`, ou a pessoa
# só tem uma), o vínculo, a organização e o saldo dela. `token` só existe na resposta de
# entrar/criar conta (a sessão recém-aberta).
class SessionSerializer < ApplicationSerializer
  def self.one(session, account: nil)
    user = session.user
    organization = account&.organization

    payload = {
      user: UserSerializer.one(user),
      accounts: AccountSerializer.summaries(user.memberships.order(:created_at)),
      account: account && AccountSerializer.one(account),
      organization: organization && OrganizationSerializer.one(organization),
      credits: organization && CreditsSerializer.one(organization),
      expiresAt: epoch_ms(session.expires_at)
    }
    payload[:token] = session.token if session.token.present?
    payload
  end
end
