# As pessoas da organização.
#
# Ler é aberto a qualquer sessão, como na origem: o chat, a agenda e os pipelines
# listam colegas para atribuir e filtrar, e quem atende não tem `core_settings`. O que
# muda é o que sai: quem não administra só enxerga quem está ativo, e sem telefone, grupo
# nem permissões. Todo o resto exige `core_settings`, mais as regras de `ManagePerson`.
class UsersController < PlatformController
  # Quem cria organização vira dono, e criar organização é aberto: sem limite, estas duas
  # rotas varreriam a lista de e-mails que `SessionsController` protege.
  EMAIL_PROBES_PER_MINUTE = 30

  require_permission :core_settings, except: %i[index show]

  rate_limit to: EMAIL_PROBES_PER_MINUTE, within: 1.minute, only: %i[check_email create],
    by: -> { current_account.id },
    with: -> { render_too_many_requests }

  before_action :set_person, only: %i[update destroy revoke restore]
  around_action :handle_refusals, only: %i[create update destroy revoke restore]

  # Sem `perPage`, vêm até 100: a lista inteira, na prática, que é o que os seletores de
  # atribuição querem.
  def index
    records, meta = paginate(filtered_people.order(:name, :id), per_page: Paginated::MAX_PER_PAGE)

    render json: { users: records.map { |account| serialize(account) }, meta: meta }
  end

  def show
    render json: serialize(visible_people.find(params[:id]))
  end

  # GET /users/check-email?email= — o passo inicial do cadastro. Como o e-mail é único no
  # produto, `exists` sem `hasOrganizationAccess` quer dizer "tem conta em outra organização
  # e não pode ser adicionado aqui".
  def check_email
    email = params[:email].to_s.strip.downcase
    if email.blank?
      return render_error(status: :unprocessable_content, code: "unprocessable", field: "email",
        message: t("errors.email_required"))
    end

    account = Account.find_by(email: email)
    here = account.present? && account.organization_id == current_organization.id

    render json: { exists: account.present?, hasOrganizationAccess: here, revoked: here && account.revoked? }
  end

  def create
    account = manager.create(person_params, team_ids: team_ids_param)

    render json: PersonSerializer.one(account), status: :created
  end

  def update
    render json: PersonSerializer.one(manager.update(@person, person_params, team_ids: team_ids_param))
  end

  def destroy
    manager.destroy(@person)
    head :no_content
  end

  def revoke
    render json: PersonSerializer.one(manager.revoke(@person))
  end

  def restore
    render json: PersonSerializer.one(manager.restore(@person))
  end

  private

  # Aqui, e não em `rescue_from`: este só roda depois que o `around_action` de idioma
  # terminou, e a mensagem sairia em pt-BR para quem pediu inglês.
  def handle_refusals
    yield
  rescue Access::ManagePerson::Denied
    render_forbidden
  rescue Access::ManagePerson::Refused => refusal
    render_error(status: :unprocessable_content, code: refusal.code, field: refusal.field)
  rescue ActiveRecord::RecordInvalid => invalid
    render_invalid(invalid.record)
  end

  def manager
    Access::ManagePerson.new(actor: current_account)
  end

  def manages_people?
    current_account.can?(:core_settings)
  end

  def set_person
    @person = current_organization.accounts.find(params[:id])
  end

  def visible_people
    people = current_organization.accounts.includes(:access_role, :team_memberships).with_attached_avatar
    manages_people? ? people : people.active
  end

  def filtered_people
    people = by_status(visible_people)
    people = people.where(role: params[:role].to_s) if params[:role].present?
    people = people.where(access_role_id: params[:access_role_id].to_s) if params[:access_role_id].present?
    people = people.where(id: members_of(params[:team_id].to_s)) if params[:team_id].present?
    people = matching(people, params[:q]) if params[:q].present?
    people
  end

  # Por padrão, só quem está ativo: é o que todo seletor de pessoas quer, e ninguém deveria
  # poder atribuir conversa a quem perdeu o acesso. A tela de usuários pede `status=all`.
  def by_status(people)
    case params[:status]
    when "revoked" then people.revoked
    when "all" then people
    else people.active
    end
  end

  def members_of(team_id)
    TeamMembership.where(team_id: team_id).select(:account_id)
  end

  def matching(people, term)
    pattern = "%#{Account.sanitize_sql_like(term.to_s.strip)}%"
    people.where("accounts.name ILIKE :pattern OR accounts.email ILIKE :pattern", pattern: pattern)
  end

  def serialize(account)
    manages_people? ? PersonSerializer.one(account) : PersonSerializer.directory_entry(account)
  end

  def person_params
    params.permit(:name, :email, :phone, :password, :password_confirmation, :role, :access_role_id, :setup_only)
  end

  # `nil` quando a chave não veio (não mexe nos departamentos); `[]` limpa todos.
  def team_ids_param
    return nil unless params.key?(:team_ids)

    Array(params[:team_ids]).compact_blank
  end
end
