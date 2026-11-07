# Os webhooks da organização e as ações de cada um (modelo: Hook). Configurar é de quem tem `core_settings`.
class WebhooksController < PlatformController
  # O corpo e os cabeçalhos de `HookAction::HttpRequest` são da pessoa, e vão como ela escreveu.
  self.opaque_params += %w[body]

  ACTION_TYPES = {
    "HookAction::ContactHandling" => %i[contact_identifier contact_name],
    "HookAction::UserField" => %i[custom_field_id value_template],
    "HookAction::StartFlow" => [
      :connector_id, :flow_id, :message_text, :whatsapp_template_id, :phone_number_id, :send_mode,
      { whatsapp_template_params: [] },
      { message_blocks: %i[id type content media_url file_name caption media_source attachment_id] }
    ],
    "HookAction::CodeRunner" => %i[code],
    "HookAction::HttpRequest" => [ :url, :http_method ]
  }.freeze

  require_permission :core_settings

  before_action :set_hook, only: %i[show update destroy enable_signature rotate_signing_secret disable_signature]

  rescue_from SecretHeaders::NeedsRetyping do |error|
    render_error(
      status: :unprocessable_content,
      code: "secretHeaderNeedsRetyping",
      field: "webhookActions",
      message: t("errors.secret_header_needs_retyping", name: error.header)
    )
  end

  def index
    records, meta = paginate(Hook.for_organization(current_organization.id).includes(:hook_actions).order(:created_at), per_page: Paginated::MAX_PER_PAGE)
    render json: { webhooks: HookSerializer.many(records), meta: meta }
  end

  def show
    render json: { webhook: HookSerializer.one(@hook) }
  end

  # Todo webhook nasce em teste, com a ação do contato: é ela que acha a conversa.
  def create
    hook = Hook.new(hook_params.merge(organization_id: current_organization.id, status: "test"))
    hook.hook_actions.build(type: "HookAction::ContactHandling", config: {})
    hook.save!

    render json: { webhook: HookSerializer.one(hook) }, status: :created
  end

  # PATCH /webhooks/:id { webhook: { name?, status?, webhookActions?: [{ id?, type, config, _destroy? }] } }
  def update
    Hook.transaction do
      apply_actions
      @hook.update!(hook_params)
    end
    @hook.resolve_failure_alert!

    render json: { webhook: HookSerializer.one(@hook.reload) }
  rescue UnknownActionType
    render_error(status: :unprocessable_entity, code: "unknownActionType")
  end

  def destroy
    @hook.destroy!
    head :no_content
  end

  # `enable-signature` e `rotate-signing-secret` são o ÚNICO lugar em que o segredo sai da API, e só na hora em que nasce: se a
  # pessoa perder, resta renovar. Religar um webhook que já tinha chave devolve `signingSecret: null`, porque a chave continua a mesma.
  def enable_signature
    secret = @hook.enable_signature!
    render json: { webhook: HookSerializer.one(@hook), signingSecret: secret }
  end

  def rotate_signing_secret
    secret = @hook.rotate_signing_secret!
    render json: { webhook: HookSerializer.one(@hook), signingSecret: secret }
  end

  def disable_signature
    @hook.disable_signature!
    render json: { webhook: HookSerializer.one(@hook) }
  end

  private

  class UnknownActionType < StandardError; end

  def set_hook
    @hook = Hook.for_organization(current_organization.id).find(params[:id])
  end

  def hook_params
    params.require(:webhook).permit(:name, :status)
  end

  def apply_actions
    list = params.require(:webhook)[:webhook_actions]
    return if list.nil?

    Array(list).each { |attributes| apply_action(attributes) }
  end

  # O id é procurado dentro do webhook. Na origem bastava conhecer o id da ação de outro workspace.
  def apply_action(attributes)
    action = attributes[:id].present? ? @hook.hook_actions.find(attributes[:id]) : nil
    return destroy_action(action) if ActiveModel::Type::Boolean.new.cast(attributes[:_destroy])

    type = action&.type || attributes[:type].to_s
    allowed = ACTION_TYPES[type]
    raise UnknownActionType if allowed.nil?

    action ||= @hook.hook_actions.build(type: type)
    action.config = with_kept_secret_headers(action.config.to_h, action.config.to_h.merge(permitted_config(attributes, allowed)))
    action.save!
  end

  def with_kept_secret_headers(before, after)
    return after unless after.key?("headers")

    same_destination = SecretHeaders.same_destination?(before["url"], after["url"])
    after.merge("headers" => SecretHeaders.restore(after["headers"], stored: before["headers"], same_destination: same_destination))
  end

  # A ação do contato é fixa: é ela que acha a conversa, e as demais dependem disso.
  def destroy_action(action)
    action&.destroy! unless action&.static?
  end

  def permitted_config(attributes, allowed)
    config = attributes[:config]
    return {} unless config.respond_to?(:permit)

    permitted = config.permit(*allowed).to_h
    # Cabeçalhos e corpo são livres, com chaves que são dados.
    if allowed.include?(:http_method)
      permitted["headers"] = Array(config[:headers]).map { |header| header.respond_to?(:to_unsafe_h) ? header.to_unsafe_h : header } if config.key?(:headers)
      body = config[:body]
      permitted["body"] = body.respond_to?(:to_unsafe_h) ? body.to_unsafe_h : body if config.key?(:body)
    end
    permitted
  end
end
