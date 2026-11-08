# Base de toda a plataforma de atendimento (chat, contatos, pipelines, agenda…).
#
# O equivalente em Vekoo do workspace é a `Organization` do vínculo da aba: o front manda
# o hashid da `Account` em `X-Account`, `Authenticatable` confere que ela é da pessoa da
# sessão e está ativa, e toda consulta parte de `current_organization`. Nenhuma rota
# recebe id de organização, e um id adivinhado nunca alcança o dado de outra.
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

    Current.user = current_user
    Current.account = current_account
    Current.organization = current_organization
    Current.session = current_session
    # Comodidade para o código reciclado, que lê a organização da variável.
    @organization = current_organization
  end
end
