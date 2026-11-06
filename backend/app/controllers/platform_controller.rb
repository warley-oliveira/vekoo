# Base de toda a plataforma de atendimento (chat, contatos, pipelines, agenda…).
#
# O equivalente em Vekoo do workspace é a `Organization` da sessão: não há id de
# organização na URL, e toda consulta parte de `current_organization`. Assim um
# id adivinhado nunca alcança o dado de outra organização.
class PlatformController < AuthenticatedController
  include Paginated
  include CamelParams
  include Permissioned

  # O ParamsWrapper procura a chave `quick_reply` antes de o CamelParams rodar.
  # Como o front manda `quickReply`, ele não a acha e injeta um `quick_reply`
  # vazio, que sobrescreveria o conteúdo. Ele também filtra pelos atributos do
  # modelo, em snake_case, então nunca serviu para corpo em camelCase. Regra daqui:
  # quem espera envelope recebe envelope explícito, como no resto da API.
  wrap_parameters false

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
