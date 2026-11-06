FactoryBot.define do
  factory :flow do
    organization
    sequence(:name) { |n| "Boas-vindas #{n}" }
    status { "draft" }
    trigger_type { "manual" }
    connector_filter { {} }
  end

  factory :flow_version do
    flow
    sequence(:version_number)
    definition do
      {
        "nodes" => [ { "id" => "trigger", "type" => "trigger_manual", "data" => {} } ],
        "edges" => [],
        "viewport" => {}
      }
    end
  end

  factory :flow_execution do
    flow
    flow_version { association(:flow_version, flow: flow) }
    organization_id { flow.organization_id }
    status { "completed" }
    context { {} }
    started_at { Time.current }
  end

  factory :tool, class: "Tool" do
    sequence(:name) { |n| "Ferramenta #{n}" }
    description { "Consulta um serviço de fora." }
    category { "utilidades" }
    active { true }
    credentials_schema { [] }
    function_templates do
      [ { "name" => "consultar_cep", "description" => "Consulta um CEP", "parameters" => [], "js_code" => "return { ok: true, chave: credentials.api_key };" } ]
    end
  end

  factory :tool_function, class: "ToolFunction::MiniRacer" do
    transient { organization { nil } }

    organization_id { organization&.id&.to_s || association(:organization).id.to_s }
    sequence(:name) { |n| "consultar_cep_#{n}" }
    description { "Consulta um CEP" }
    js_code { "return { cep: params.cep };" }
    parameters { [ { "name" => "cep", "type" => "string", "description" => "O CEP", "required" => true } ] }
  end

  factory :tool_installation do
    transient { organization { nil } }

    organization_id { organization&.id&.to_s || association(:organization).id.to_s }
    tool_id { association(:tool).id.to_s }
    enabled { true }
  end

  factory :hook do
    organization
    sequence(:name) { |n| "Pedido aprovado #{n}" }
    status { "active" }
  end

  factory :hook_action_contact, class: "HookAction::ContactHandling" do
    hook
    config { { "contact_identifier" => "{{body.telefone}}", "contact_name" => "{{body.nome}}" } }
  end

  factory :hook_action_user_field, class: "HookAction::UserField" do
    hook
    config { {} }
  end

  factory :hook_action_start_flow, class: "HookAction::StartFlow" do
    hook
    config { {} }
  end

  factory :hook_action_code_runner, class: "HookAction::CodeRunner" do
    hook
    config { { "code" => "return 1;" } }
  end

  factory :hook_action_http, class: "HookAction::HttpRequest" do
    hook
    config { { "url" => "https://api.exemplo.test/pedidos", "http_method" => "POST" } }
  end

  factory :hook_log do
    hook_id { SecureRandom.uuid }
    hook_uid { SecureRandom.alphanumeric(24) }
    hook_name { "Pedido aprovado" }
    organization_id { SecureRandom.uuid }
    status { "success" }
    hook_status { "active" }
    request_body { { "nome" => "Ana" } }
  end
end
