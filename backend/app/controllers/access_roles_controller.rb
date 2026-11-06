# Os grupos de permissões. Só para quem administra: `/me` já diz a cada pessoa o que ela
# pode, e ninguém mais precisa ler o mapa de um grupo.
#
# Os grupos padrão não mudam de nome nem saem (ver `AccessRole`). Apagar um grupo em uso
# deixa as pessoas sem grupo, e elas passam a valer pelos padrões de membro.
class AccessRolesController < PlatformController
  require_permission :core_settings

  before_action :set_role, only: %i[show update destroy]

  def index
    records, meta = paginate(current_organization.access_roles.order(:name), per_page: Paginated::MAX_PER_PAGE)
    counts = current_organization.accounts.active.where(access_role_id: records.map(&:id)).group(:access_role_id).count

    render json: {
      accessRoles: records.map { |role| AccessRoleSerializer.one(role, accounts_count: counts.fetch(role.id, 0)) },
      meta: meta
    }
  end

  def show
    render json: AccessRoleSerializer.one(@role)
  end

  def create
    role = current_organization.access_roles.new(role_params.slice(:name))
    role.permissions = AccessRole::BLANK_PERMISSIONS.merge(given_permissions)

    save(role, status: :created)
  end

  # Mescla com o que já existe: quem manda só uma chave não apaga as outras.
  def update
    @role.assign_attributes(role_params.slice(:name))
    @role.permissions = @role.permissions.merge(given_permissions)

    save(@role, status: :ok)
  end

  def destroy
    if @role.destroy
      head :no_content
    else
      render_error(status: :unprocessable_content, code: "defaultAccessRole")
    end
  end

  private

  def set_role
    @role = current_organization.access_roles.find(params[:id])
  end

  def save(role, status:)
    if role.save
      render json: AccessRoleSerializer.one(role), status: status
    else
      render_invalid(role)
    end
  rescue ActiveRecord::RecordNotUnique
    # Dois pedidos com o mesmo nome ao mesmo tempo: o índice segura o que a validação não viu.
    role.errors.add(:name, :taken)
    render_invalid(role)
  end

  def role_params
    @role_params ||= params.expect(access_role: [ :name, { permissions: {} } ])
  end

  def given_permissions
    role_params[:permissions]&.to_h || {}
  end
end
