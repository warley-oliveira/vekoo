# As organizações da pessoa: valem fora de qualquer organização (tela de escolha, seletor da barra
# lateral), por isso não exigem `X-Account`.
#
#   GET  /accounts       os vínculos ativos da pessoa, um por organização
#   POST /organizations  cria uma organização, e quem cria entra como dono
class MembershipsController < AuthenticatedController
  include CamelParams

  skip_account_requirement
  wrap_parameters false

  # Criar organização dá créditos de graça, como o cadastro: mesmo limite.
  rate_limit to: 5, within: 1.hour, only: :create, by: -> { current_user.id },
    with: -> { render_too_many_requests }

  def index
    render json: { accounts: AccountSerializer.summaries(current_user.memberships.order(:created_at)) }
  end

  def create
    name = params.expect(organization: [ :name ])[:name]
    organization = Organization.new(name: name)
    account = organization.accounts.new(user: current_user, role: "owner")

    Organization.transaction do
      organization.save!
      account.save!
      organization.notifications.create!(key: "welcome", notified_at: Time.current)
      # A primeira marca nasce com a organização: todo conteúdo nasce dentro dela (como no cadastro).
      organization.brand_cores.create!
    end

    render json: AccountSerializer.summary(account), status: :created
  rescue ActiveRecord::RecordInvalid => invalid
    render_invalid(invalid.record)
  end
end
