# A área do suporte do Vekoo (`User#master`): achar uma organização e entrar nela.
#
#   GET  /support/organizations?q=        busca por nome da organização ou e-mail/nome de quem participa
#   POST /support/organizations/:id/enter  o vínculo de suporte daquela organização (criado na primeira
#                                          vez) e o registro da entrada
#
# Para quem não é suporte, as duas respondem `404 notFound`: a rota não existe para essa pessoa.
# `master` nunca muda por aqui (nem por rota nenhuma): só por `bin/rails support:grant`.
class SupportController < AuthenticatedController
  include Paginated
  include CamelParams

  skip_account_requirement
  before_action :require_master

  def organizations
    scope = Organization.order(:name, :id)
    scope = matching(scope, params[:q]) if params[:q].present?
    records, meta = paginate(scope)
    owners = owners_of(records)
    counts = Account.members.active.where(organization_id: records.map(&:id)).group(:organization_id).count

    render json: {
      organizations: records.map { |organization| organization_entry(organization, owners, counts) },
      meta: meta
    }
  end

  def enter
    organization = Organization.find_by(id: params[:id].to_s)
    return render_not_found unless organization

    account = Support::Entry.call(user: current_user, organization: organization,
      ip_address: request.remote_ip, user_agent: request.user_agent)

    render json: AccountSerializer.summary(account), status: :created
  end

  private

  def require_master
    render_not_found unless current_user.master?
  end

  def matching(scope, term)
    pattern = "%#{Organization.sanitize_sql_like(term.to_s.strip)}%"
    people = Account.members.joins(:user).where("users.email ILIKE :pattern OR users.name ILIKE :pattern", pattern: pattern)
    scope.where("organizations.name ILIKE :pattern", pattern: pattern).or(scope.where(id: people.select(:organization_id)))
  end

  def owners_of(organizations)
    Account.members.where(organization_id: organizations.map(&:id), role: "owner").includes(:user)
           .order(:created_at).group_by(&:organization_id).transform_values(&:first)
  end

  def organization_entry(organization, owners, counts)
    owner = owners[organization.id]
    {
      id: organization.id,
      name: organization.name,
      createdAt: epoch_ms(organization.created_at),
      membersCount: counts[organization.id] || 0,
      owner: owner && { name: owner.name, email: owner.email }
    }
  end

  def epoch_ms(time)
    time && (time.to_f * 1000).round
  end
end
