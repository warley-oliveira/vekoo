# As ferramentas instaladas na organização. Na origem era por assistente; aqui é uma instalação por organização.
class ToolInstallationsController < PlatformController
  # Valores de credencial são dados, e as chaves são as do catálogo.
  self.opaque_params += %w[credentials]

  require_permission :flows

  before_action :set_installation, only: %i[update destroy toggle]

  def index
    installations = ToolInstallation.for_organization(current_organization.id).to_a
    render json: { installations: ToolInstallationSerializer.many(installations) }
  end

  # POST /tool-installations { toolId, credentials? }
  def create
    tool = Tool.active.where(id: params.require(:tool_id).to_s).take
    return render_not_found unless tool

    result = Tools::InstallService.new(tool, current_organization, credentials: credentials_param).call
    return render_refused(result.errors) unless result.success?

    render json: { installation: ToolInstallationSerializer.one(result.data) }, status: :created
  end

  # Só as credenciais, e só as chaves enviadas com valor: o que vier em branco fica como estava. As funções leem a credencial na hora,
  # então não precisam ser refeitas.
  def update
    incoming = credentials_param.reject { |_, value| value.to_s.strip.empty? }
    return render json: { installation: ToolInstallationSerializer.one(@installation) } if incoming.empty?

    @installation.credentials = @installation.credentials.merge(incoming)
    @installation.save!
    render json: { installation: ToolInstallationSerializer.one(@installation) }
  end

  def destroy
    Tools::UninstallService.new(@installation).call
    head :no_content
  end

  def toggle
    @installation.update!(enabled: !@installation.enabled)
    render json: { installation: ToolInstallationSerializer.one(@installation) }
  end

  private

  def set_installation
    @installation = ToolInstallation.scoped(current_organization.id, params[:id])
    render_not_found unless @installation
  end

  def credentials_param
    raw = params[:credentials]
    raw.respond_to?(:to_unsafe_h) ? raw.to_unsafe_h : {}
  end

  def render_refused(errors)
    render_error(status: :unprocessable_entity, code: "missingCredentials", message: errors.first, details: { credentials: errors })
  end
end
