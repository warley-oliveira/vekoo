require "rails_helper"

RSpec.describe "Modelos de automação" do
  let(:organization) { create(:organization) }

  describe Flow do
    it "exige nome, status e gatilho conhecidos" do
      expect(build(:flow, name: "")).not_to be_valid
      expect(build(:flow, status: "outro")).not_to be_valid
      expect(build(:flow, trigger_type: "outro")).not_to be_valid
      expect(build(:flow, connector_filter: "x")).not_to be_valid
      expect(build(:flow)).to be_valid
    end

    it "só está publicado com versão publicada" do
      flow = create(:flow, status: "published")

      expect(flow).not_to be_published
    end

    it "o rascunho é a versão mais recente sem publicação" do
      flow = create(:flow)
      create(:flow_version, flow: flow, version_number: 1, published_at: Time.current)
      draft = create(:flow_version, flow: flow, version_number: 2)

      expect(flow.draft_version).to eq(draft)
    end

    it "publicar congela a versão, abre o próximo rascunho e sincroniza o gatilho" do
      flow = create(:flow, organization: organization, trigger_type: "manual")
      version = flow.versions.create!(version_number: 1, definition: { "nodes" => [ { "id" => "t", "type" => "trigger_keyword" } ] })

      flow.publish!(version: version)

      expect(flow.reload).to have_attributes(status: "published", published_version: version, trigger_type: "keyword")
      expect(version.reload).to be_published
      expect(flow.draft_version).to have_attributes(version_number: 2, definition: version.definition)
    end

    it "serve um canal conforme o filtro" do
      expect(build(:flow)).to be_serves_connector("qualquer")
      expect(build(:flow, connector_filter: { "connector_ids" => [ "a" ] })).to be_serves_connector("a")
      expect(build(:flow, connector_filter: { "connector_ids" => [ "a" ] })).not_to be_serves_connector("b")
    end

    it "apagar leva as versões, as execuções e os logs, em cascata no banco" do
      flow = published_flow(organization, [ node("t", "trigger_manual"), node("v", "set_variable", assignments: [ { name: "a", value: "1" } ]) ], [ edge("t", "v") ])
      execution = run_flow(flow, chat: create(:chat, organization: organization))
      log = execution.logs.first

      flow.destroy!

      expect(FlowVersion.where(flow_id: flow.id)).not_to exist
      expect(FlowExecution.exists?(execution.id)).to be(false)
      expect(FlowExecutionLog.exists?(log.id)).to be(false)
    end

    it "publicar e arquivar mudam o que a organização tem disparando" do
      flow = published_flow(organization, [ node("t", "trigger_first_message") ], [], trigger_type: "first_message")
      expect(Flows::TriggerIndex.message_flows?(organization.id)).to be(true)

      flow.update!(status: "archived")

      expect(Flows::TriggerIndex.message_flows?(organization.id)).to be(false)
    end

    it "a organização lista os dela, e apagar a organização leva tudo" do
      flow = create(:flow, organization: organization)
      hook = create(:hook, organization: organization)
      log = create(:hook_log, organization_id: organization.id)
      function = create(:tool_function, organization: organization)

      expect(organization.flows).to eq([ flow ])
      organization.destroy!

      expect(Flow.exists?(flow.id)).to be(false)
      expect(Hook.exists?(hook.id)).to be(false)
      expect(HookLog.where(id: log.id)).not_to exist
      expect(ToolFunction::Base.where(id: function.id)).not_to exist
    end
  end

  describe FlowVersion do
    let(:flow) { create(:flow) }

    it "não repete o número no mesmo fluxo" do
      create(:flow_version, flow: flow, version_number: 1)

      expect(build(:flow_version, flow: flow, version_number: 1)).not_to be_valid
    end

    it "recusa definição fora do formato ou grande demais" do
      expect(build(:flow_version, flow: flow, definition: { "nodes" => "x" })).not_to be_valid
      expect(build(:flow_version, flow: flow, definition: { "nodes" => [ { "data" => "a" * FlowVersion::MAX_DEFINITION_BYTES } ] })).not_to be_valid
    end

    it "lê blocos, conexões, campos e prompt base" do
      version = build(:flow_version, flow: flow, definition: {
        "nodes" => [ { "id" => "a", "type" => "trigger_manual" }, { "id" => "b", "type" => "send_text" } ],
        "edges" => [ { "source" => "a", "target" => "b" } ],
        "fields" => [ { "key" => "produto" }, { "key" => "Inválido!" } ],
        "base_prompt" => "x"
      })

      expect(version.find_node("b")["type"]).to eq("send_text")
      expect(version.outgoing_edges("a").length).to eq(1)
      expect(version.trigger_node["id"]).to eq("a")
      expect(version.trigger_type).to eq("manual")
      expect(version.entry_node_id).to eq("b")
      expect(version.field_keys).to eq([ "produto" ])
      expect(version.base_prompt).to eq("x")
    end

    it "sem nada depois do gatilho, começa nele; sem gatilho, no primeiro bloco" do
      expect(build(:flow_version, flow: flow, definition: { "nodes" => [ { "id" => "t", "type" => "trigger_manual" } ] }).entry_node_id).to eq("t")
      expect(build(:flow_version, flow: flow, definition: { "nodes" => [ { "id" => "x", "type" => "send_text" } ] }).entry_node_id).to eq("x")
    end
  end

  describe FlowExecution do
    let(:flow) { create(:flow, organization: organization) }

    it "só uma viva por fluxo e conversa, garantido pelo banco" do
      create(:flow_execution, flow: flow, chat_id: "c1", status: "waiting")

      expect { create(:flow_execution, flow: flow, chat_id: "c1", status: "running") }.to raise_error(ActiveRecord::RecordNotUnique)
    end

    it "as terminadas e as de teste não contam" do
      create(:flow_execution, flow: flow, chat_id: "c1", status: "completed")
      create(:flow_execution, flow: flow, chat_id: "c1", status: "running", playground: true)

      expect(create(:flow_execution, flow: flow, chat_id: "c1", status: "running")).to be_persisted
    end

    it "claim: um ganha, e o token vale só para ele" do
      execution = create(:flow_execution, flow: flow, status: "waiting_for_message")

      token = described_class.claim(execution.id, from: "waiting_for_message")

      expect(token).to be_present
      expect(execution.reload).to have_attributes(status: "running", run_token: token)
      expect(described_class.claim(execution.id, from: "waiting_for_message")).to be_nil
    end

    it "claim com token de espera só aceita o certo" do
      execution = create(:flow_execution, flow: flow, status: "waiting", resume_token: "certo")

      expect(described_class.claim(execution.id, from: "waiting", resume_token: "errado")).to be_nil
      expect(described_class.claim(execution.id, from: "waiting", resume_token: "certo")).to be_present
    end

    it "acha a conversa sempre com a organização" do
      chat = create(:chat, organization: organization)
      alheia = create(:chat, organization: create(:organization))

      expect(build(:flow_execution, flow: flow, chat_id: chat.id.to_s).chat).to eq(chat)
      expect(build(:flow_execution, flow: flow, chat_id: alheia.id.to_s).chat).to be_nil
    end

    it "fail! e complete! encerram, e cancel! tira o token de espera" do
      execution = create(:flow_execution, flow: flow, status: "waiting", resume_token: "x")

      execution.cancel!
      expect(execution).to have_attributes(status: "cancelled", resume_token: nil)

      other = create(:flow_execution, flow: flow, status: "running")
      other.fail!("a" * 3_000)
      expect(other.error_message.length).to eq(2_000)
    end
  end

  describe FlowExecutionLog do
    it "precisa de bloco, tipo e situação, e marca a hora" do
      execution = create(:flow_execution)

      expect(build(:flow_execution, flow: execution.flow).logs.build(node_id: "", node_type: "x")).not_to be_valid
      log = execution.logs.create!(node_id: "a", node_type: "send_text", status: "success")
      expect(log.executed_at).to be_present
      expect(execution.logs.build(node_id: "a", node_type: "x", status: "outro")).not_to be_valid
    end
  end

  describe FlowTemplate do
    it "carrega do diretório, com todos os blocos no catálogo final" do
      expect(described_class.all.map(&:slug)).to include("welcome_routing", "lead_qualification", "faq_support")

      types = described_class.all.flat_map { |template| template.definition["nodes"].pluck("type") }
      expect(types - FlowRuntime::NodeRegistry.types).to be_empty
    end

    it "acha pelo slug" do
      expect(described_class.find("welcome_routing").trigger_type).to eq("first_message")
      expect(described_class.find("nada")).to be_nil
    end

    it "ignora arquivo quebrado" do
      Dir.mktmpdir do |dir|
        File.write(File.join(dir, "a.json"), "{quebrado")
        File.write(File.join(dir, "b.json"), { slug: "b", name: "B" }.to_json)

        described_class.load_from_directory(dir)

        expect(described_class.all.map(&:slug)).to eq([ "b" ])
      end
    ensure
      described_class.reset!
    end
  end

  describe Tool do
    it "exige nome e descrição, e gera o slug" do
      expect(build(:tool, name: "")).not_to be_valid
      expect(build(:tool, description: "")).not_to be_valid
      expect(create(:tool, name: "Utilidades Brasil").slug).to eq("utilidades-brasil")
    end

    it "não repete o slug" do
      create(:tool, slug: "a")

      expect(build(:tool, slug: "a")).not_to be_valid
    end

    it "sabe se pede credencial" do
      expect(build(:tool, credentials_schema: [ { "name" => "x" } ])).to be_requires_credentials
      expect(build(:tool)).not_to be_requires_credentials
    end
  end

  describe ToolInstallation do
    it "guarda as credenciais cifradas" do
      installation = create(:tool_installation, organization: organization)
      installation.credentials = { "api_key" => "segredo" }
      installation.save!

      raw = ToolInstallation.collection.find(_id: installation.id).first
      expect(raw.to_json).not_to include("segredo")
      expect(installation.reload.credentials).to eq("api_key" => "segredo")
      expect(installation).to be_credentials
    end

    it "sem credencial, é um mapa vazio" do
      expect(build(:tool_installation).credentials).to eq({})
    end
  end

  describe ToolFunction::MiniRacer do
    it "normaliza o nome e calcula o esquema" do
      function = create(:tool_function, name: "Consultar Frete!", parameters: [
        { "name" => "meu cep", "type" => "string", "description" => "CEP", "required" => "true" },
        { "name" => "itens", "type" => "array", "items_type" => "number", "description" => "Itens" },
        { "name" => "pacotes", "type" => "array", "items_properties" => [ { "name" => "peso", "type" => "number", "description" => "Peso", "required" => true } ], "description" => "x", "min_items" => 1 }
      ])

      expect(function.name).to eq("consultar_frete")
      schema = function.input_schema
      expect(schema["required"]).to eq([ "meu_cep" ])
      expect(schema["properties"]["itens"]["items"]).to eq("type" => "number")
      expect(schema["properties"]["pacotes"]).to include("minItems" => 1)
      expect(schema["properties"]["pacotes"]["items"]["required"]).to eq([ "peso" ])
    end

    it "array sem tipo de item ainda é um esquema aceito" do
      function = create(:tool_function, parameters: [ { "name" => "a", "type" => "array", "description" => "x" } ])

      expect(function.input_schema["properties"]["a"]["items"]).to eq("type" => "string")
    end

    it "exige nome, descrição, código e dono" do
      expect(build(:tool_function, name: "")).not_to be_valid
      expect(build(:tool_function, description: "")).not_to be_valid
      expect(build(:tool_function, js_code: "")).not_to be_valid
      expect(build(:tool_function, organization_id: nil)).not_to be_valid
      expect(build(:tool_function, js_code: "a" * (described_class::MAX_CODE_BYTES + 1))).not_to be_valid
    end

    it "roda de verdade, com a organização e a conversa no contexto" do
      chat = create(:chat, organization: organization, user_name: "Ana")
      function = create(:tool_function, organization: organization, js_code: "return getContactInfo().name + params.a;")

      expect(function.invoke({ a: 1 }, organization: organization, chat: chat)).to eq("Ana1")
    end

    it "não roda se a ferramenta dela estiver desligada, nem entrega a credencial" do
      installation = create(:tool_installation, organization: organization, enabled: false)
      function = create(:tool_function, organization: organization, tool_installation_id: installation.id.to_s)

      expect(function).not_to be_runnable
      expect(function.credentials).to be_nil
      expect { function.invoke({}, organization: organization) }.to raise_error(MiniRacerEngine::Error, /disabled/)
    end

    it "não roda se a instalação sumiu" do
      expect(build(:tool_function, tool_installation_id: "x")).not_to be_runnable
    end
  end

  describe ToolFunction::Http do
    include ScriptEngineHelpers

    let(:valid) { { name: "x", description: "y", http_method: "GET", url: "https://api.exemplo.test/a", organization_id: organization.id.to_s } }

    it "confere o esquema dos parâmetros" do
      expect(described_class.new(valid)).to be_valid
      expect(described_class.new(valid.merge(parameters_json: "{quebrado"))).not_to be_valid
      expect(described_class.new(valid.merge(parameters_json: { type: "array", properties: {} }.to_json))).not_to be_valid
      expect(described_class.new(valid.merge(parameters_json: { type: "object" }.to_json))).not_to be_valid
      expect(described_class.new(valid.merge(parameters_json: { type: "object", properties: {}, required: [ "a" ] }.to_json))).not_to be_valid
      expect(described_class.new(valid.merge(parameters_json: { type: "object", properties: { a: { type: "outro" } } }.to_json))).not_to be_valid
    end

    it "só sai por SafeHttp: rede interna não" do
      stub_public_dns("interno.exemplo.test", ip: "10.0.0.1")
      function = described_class.new(valid.merge(url: "http://interno.exemplo.test/"))

      expect { function.perform }.to raise_error(SafeHttp::DestinationRefused)
    end
  end

  describe Hook do
    it "exige nome e situação conhecida, gera uid e slug" do
      expect(build(:hook, name: "")).not_to be_valid
      expect(build(:hook, status: "outro")).not_to be_valid

      hook = create(:hook, name: "Pedido Aprovado")
      expect(hook.uid.length).to eq(24)
      expect(hook.slug).to eq("pedido-aprovado")
    end

    it "guarda o segredo cifrado, e a dica mostra só o final" do
      hook = create(:hook)
      secret = hook.rotate_signing_secret!

      expect(secret).to start_with("whsec_")
      expect(hook.signing_secret_ciphertext).not_to include(secret)
      expect(hook.reload.signing_secret).to eq(secret)
      expect(hook.signing_secret_hint).to eq("whsec_••••••••#{secret.last(4)}")
    end

    it "segredo adulterado vira nil, sem derrubar" do
      hook = create(:hook, signing_secret_ciphertext: "lixo")

      expect(hook.signing_secret).to be_nil
    end

    it "a captura tem teto e a contagem é atômica" do
      hook = create(:hook)

      (Hook::MAX_STORED_PAYLOADS + 3).times { |index| hook.store_capture!("body" => { "i" => index }) }
      3.times { hook.count_request! }

      expect(hook.reload.received_payload.length).to eq(Hook::MAX_STORED_PAYLOADS)
      expect(hook.received_payload.last["body"]["i"]).to eq(Hook::MAX_STORED_PAYLOADS + 2)
      expect(hook.total_request).to eq(3)
    end

    it "a consulta leve não traz a coluna pesada" do
      hook = create(:hook, received_payload: [ { "a" => 1 } ])

      expect(Hook.light.find(hook.id).has_attribute?(:received_payload)).to be(false)
    end
  end

  describe HookLog do
    let(:hook) { create(:hook) }

    it "exige o webhook e uma situação conhecida" do
      expect(build(:hook_log, hook_id: nil)).not_to be_valid
      expect(build(:hook_log, status: "outro")).not_to be_valid
    end

    it "apaga sozinho depois de 90 dias" do
      ttl = described_class.index_specifications.find { |spec| spec.options[:expire_after] || spec.options[:expire_after_seconds] }

      expect(ttl).to be_present
      expect((ttl.options[:expire_after] || ttl.options[:expire_after_seconds]).to_i).to eq(90.days.to_i)
    end

    it "não derruba quem recebeu a requisição" do
      expect(described_class.record(hook: hook, capture: { "body" => "não é mapa" }, status: "inventado")).to be_nil
    end

    it "grava o erro em 500 por padrão" do
      log = described_class.record(hook: hook, capture: { "method" => "POST", "headers" => {}, "body" => {}, "query" => {}, "ip" => "1.1.1.1" }, status: "error", error_message: "x")

      expect(log).to have_attributes(status_code: 500, hook_name: hook.name, hook_status: hook.status)
      expect(log).to be_error
    end
  end
end
