# A sessão que a tela recebe: quem entrou, onde entrou e o saldo de créditos.
# `token` só existe na resposta de entrar/criar conta (a sessão recém-aberta).
class SessionSerializer < ApplicationSerializer
  def self.one(session)
    account = session.account
    organization = account.organization

    payload = {
      account: AccountSerializer.one(account),
      organization: OrganizationSerializer.one(organization),
      credits: CreditsSerializer.one(organization),
      expiresAt: epoch_ms(session.expires_at)
    }
    payload[:token] = session.token if session.token.present?
    payload
  end
end
