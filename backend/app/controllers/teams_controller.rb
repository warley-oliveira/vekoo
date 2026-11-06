# Os departamentos da organização. Ler é aberto a qualquer sessão, como na origem: o
# chat transfere conversas para departamentos e a agenda filtra por eles.
class TeamsController < PlatformController
  require_permission :core_settings, except: %i[index show]

  before_action :set_team, only: %i[show update destroy]

  def index
    scope = current_organization.teams.order(:name)
    scope = scope.where(active: ActiveModel::Type::Boolean.new.cast(params[:active])) if params[:active].present?
    records, meta = paginate(scope, per_page: Paginated::MAX_PER_PAGE)
    counts = people_per_team(records)

    render json: {
      teams: records.map { |team| TeamSerializer.one(team, accounts_count: counts.fetch(team.id, 0)) },
      meta: meta
    }
  end

  def show
    render json: TeamSerializer.one(@team)
  end

  def create
    save(current_organization.teams.new(team_params), status: :created)
  end

  def update
    @team.assign_attributes(team_params)
    save(@team, status: :ok)
  end

  def destroy
    @team.destroy!
    head :no_content
  end

  private

  def set_team
    @team = current_organization.teams.find(params[:id])
  end

  def save(team, status:)
    if team.save
      render json: TeamSerializer.one(team), status: status
    else
      render_invalid(team)
    end
  rescue ActiveRecord::RecordNotUnique
    # Dois pedidos com o mesmo nome ao mesmo tempo: o índice segura o que a validação não viu.
    team.errors.add(:name, :taken)
    render_invalid(team)
  end

  # Só quem está ativo conta: quem perdeu o acesso não atende por departamento nenhum.
  def people_per_team(teams)
    TeamMembership.where(team_id: teams.map(&:id)).joins(:account).merge(Account.active).group(:team_id).count
  end

  def team_params
    params.expect(team: %i[name active])
  end
end
