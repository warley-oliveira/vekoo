# Base de toda a plataforma de atendimento (chat, contatos, pipelines, agenda…).
#
# O equivalente em Vekoo do workspace é a `Organization` da sessão: não há id de
# organização na URL, e toda consulta parte de `current_organization`. Assim um
# id adivinhado nunca alcança o dado de outra organização.
class PlatformController < AuthenticatedController
  include Paginated
  include CamelParams
  include Permissioned

  before_action :set_current_context

  private

  def set_current_context
    return unless current_account

    Current.account = current_account
    Current.organization = current_organization
    Current.session = current_session
    # Comodidade para o código reciclado, que lê a organização da variável.
    @organization = current_organization
  end
end
