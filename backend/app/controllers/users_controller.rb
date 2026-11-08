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

  require_permission :core_settings, except: %i[index show leave]

  rate_limit to: EMAIL_PROBES_PER_MINUTE, within: 1.minute, only: %i[check_email create],
    by: -> { current_account.id },
    with: -> { render_too_many_requests }

  before_action :set_person, only: %i[update destroy revoke restore transfer_ownership]
  around_action :handle_refusals, only: %i[create update destroy revoke restore transfer_ownership leave]

  # Sem `perPage`, vêm até 100: a lista inteira, na prática, que é o que os seletores de
  # atribuição querem.
  def index
    records, meta = paginate(filtered_people.by_name, per_page: Paginated::MAX_PER_PAGE)

    render json: { users: records.map { |account| serialize(account) }, meta: meta }
  end

  def show
    render json: serialize(visible_people.find(params[:id]))
  end

  # GET /users/check-email?email= — o passo inicial do convite. `exists` sem
  # `hasOrganizationAccess` quer dizer "já tem conta no Vekoo, em outra organização": o convite
  # cria só o vínculo, e a pessoa entra com a senha que já usa. O nome não sai daqui, para a
  # rota não virar consulta de quem é quem.
  def check_email
    email = params[:email].to_s.strip.downcase
    if email.blank?
      return render_error(status: :unprocessable_content, code: "unprocessable", field: "email",
        message: t("errors.email_required"))
    end

    user = User.find_by_login(email)
    account = user && current_organization.accounts.find_by(user_id: user.id)

    render json: { exists: user.present?, hasOrganizationAccess: account.present?, revoked: account&.revoked? || false }
  end

  def create
    account = manager.create(person_attributes, team_ids: team_ids_param)

    render json: PersonSerializer.one(account), status: :created
  end

  def update
    render json: PersonSerializer.one(manager.update(@person, person_attributes, team_ids: team_ids_param))
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

  # POST /users/:id/transfer-ownership — a pessoa vira dona, e quem pediu vira membro.
  def transfer_ownership
    render json: PersonSerializer.one(manager.transfer_ownership(@person))
  end

  # POST /users/leave — sair desta organização. Só tira o próprio vínculo.
  def leave
    manager.leave
    head :no_content
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
    people = current_organization.accounts.includes(:access_role, :team_memberships, user: :accounts).with_attached_avatar
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
    people.joins(:user).where("users.name ILIKE :pattern OR users.email ILIKE :pattern", pattern: pattern)
  end

  def serialize(account)
    manages_people? ? PersonSerializer.one(account) : PersonSerializer.directory_entry(account)
  end

  # { user: { … } }. `expect`, e não `require(...).permit`: um envelope que não é objeto vira
  # 400 em vez de estourar em `permit`.
  def person_params
    @person_params ||= params.expect(
      user: [ :name, :email, :phone, :password, :password_confirmation, :role, :access_role_id, :setup_only,
              { team_ids: [] } ]
    )
  end

  def person_attributes
    person_params.except(:team_ids)
  end

  # `nil` quando a chave não veio (não mexe nos departamentos); `[]` limpa todos.
  def team_ids_param
    return nil unless person_params.key?(:team_ids)

    person_params[:team_ids].compact_blank
  end
end
