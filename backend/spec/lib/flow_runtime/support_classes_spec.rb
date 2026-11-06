require "rails_helper"

RSpec.describe "O apoio do motor de fluxos" do
  let(:organization) { create(:organization) }

  describe FlowRuntime::NodeRegistry do
    let(:contract) { Rails.root.join("../docs/migration/api/automation.md").read }

    it "acha a classe de todos os blocos" do
      described_class.types.each { |type| expect(described_class.for(type)).to be < FlowRuntime::Nodes::Base }
    end

    it "levanta no bloco que não existe" do
      expect { described_class.for("inventado") }.to raise_error(described_class::UnknownNodeType)
      expect(described_class.known?("send_text")).to be(true)
      expect(described_class.known?("inventado")).to be(false)
    end

    it "não deixa metade de cada jeito: os nomes antigos não existem mais" do
      expect(described_class.types.grep(/kanban|department|conversation/)).to be_empty
    end

    it "todos os blocos estão no contrato, e o contrato não cita bloco que não existe" do
      documented = contract.scan(/^\| `([a-z_]+)` \| (?:trigger|message|ai|logic|action|pipeline|integration|flow_control) \|/).flatten

      expect(documented).to match_array(described_class.types)
      expect(described_class.category_of("pipeline_mark_won")).to eq("pipeline")
    end

    it "os modelos de fluxo só usam blocos da lista" do
      nodes = FlowTemplate.all.flat_map { |template| template.definition["nodes"] }

      expect(nodes.pluck("type").uniq - described_class.types).to be_empty
    end
  end

  describe FlowRuntime::DefinitionValidator do
    def issues(nodes, edges = [])
      flow = create(:flow, organization: organization)
      version = flow.versions.create!(version_number: 1, definition: { "nodes" => nodes, "edges" => edges })
      described_class.new(version).issues.map(&:to_h)
    end

    it "aceita o que faz sentido" do
      expect(issues([ node("t", "trigger_manual"), node("a", "send_text") ], [ edge("t", "a") ])).to eq([])
    end

    it "aponta cada problema" do
      expect(issues([ node("a", "send_text") ])).to eq([ { code: "noTrigger" } ])
      expect(issues([ node("t", "trigger_manual"), node("u", "trigger_keyword") ])).to eq([ { code: "multipleTriggers", nodeId: "u", type: "trigger_keyword" } ])
      expect(issues([ node("t", "trigger_manual"), node("x", "inventado") ])).to eq([ { code: "unknownBlock", nodeId: "x", type: "inventado" } ])
      expect(issues([ node("t", "trigger_manual"), node("a", "send_text"), node("a", "send_text") ])).to include({ code: "duplicatedNodeId", nodeId: "a", type: "send_text" })
      expect(issues([ node("t", "trigger_manual") ], [ edge("t", "nada") ])).to eq([ { code: "brokenEdge", edgeId: "t-nada-" } ])
      expect(issues([ node("t", "trigger_manual"), { "type" => "send_text" } ])).to eq([ { code: "missingNodeId", type: "send_text" } ])
    end
  end

  describe FlowRuntime::ChatData do
    let(:flow) { create(:flow, organization: organization) }
    let(:version) { create(:flow_version, flow: flow, definition: { "nodes" => [], "fields" => [ { "key" => "produto" }, { "key" => "nota" } ] }) }
    let(:chat) { create(:chat, organization: organization) }
    let(:execution) { create(:flow_execution, flow: flow, flow_version: version, chat_id: chat.id.to_s, status: "running") }

    it "reconhece a chave válida" do
      expect(described_class.valid_key?("produto_1")).to be(true)
      expect(described_class.valid_key?("1produto")).to be(false)
      expect(described_class.valid_key?("a.b")).to be(false)
    end

    it "grava só o que foi cadastrado, por chave, sem apagar o que já havia" do
      chat.update!(flow_data: { flow.id.to_s => { "nota" => 9 }, "outro" => { "x" => 1 } })

      described_class.new(execution).persist("produto" => "a" * 3_000, "nota" => nil, "solta" => "x")

      stored = chat.reload.flow_data
      expect(stored["outro"]).to eq("x" => 1)
      expect(stored[flow.id.to_s]["nota"]).to eq(9)
      expect(stored[flow.id.to_s]["produto"].length).to eq(described_class::MAX_STRING_LENGTH)
      expect(stored[flow.id.to_s]).not_to have_key("solta")
    end

    it "no teste do editor, não grava" do
      execution.update!(playground: true)

      expect(described_class.new(execution).persist("produto" => "x")).to be(false)
    end

    it "lê só os cadastrados" do
      chat.flow_data = { flow.id.to_s => { "produto" => "x", "solta" => "y" } }

      expect(described_class.stored_values(chat, flow, version)).to eq("produto" => "x")
      expect(described_class.stored_values(nil, flow, version)).to eq({})
    end
  end

  describe FlowRuntime::ExitJudge do
    let(:llm) { instance_double(FlowRuntime::Llm) }
    let(:outputs) do
      [
        { "id" => "comprar", "label" => "Comprar", "when" => "Quer comprar", "parameters" => [ { "name" => "produto", "type" => "string", "required" => true, "description" => "O produto" }, { "name" => "qtd", "type" => "integer" } ] },
        { "id" => "sair", "label" => "Sair" }
      ]
    end
    let(:history) { [ { role: "user", content: "oi" }, { role: "assistant", content: "olá" } ] }

    def judge(**options)
      described_class.new(llm: llm, outputs: outputs, history: history, turns: 1, **options)
    end

    it "sem saídas, fica sem chamar o modelo" do
      decision = described_class.new(llm: llm, outputs: [], history: history, turns: 1).call

      expect(decision).not_to be_exit
      expect(decision.output_id).to eq("stay")
    end

    it "antes do mínimo de trocas, fica sem chamar o modelo" do
      instance = described_class.new(llm: llm, outputs: outputs, history: history, turns: 1, min_turns: 3)

      expect(instance.call).not_to be_exit
      expect(instance.called_model?).to be(false)
    end

    it "sai com os dados, no formato pedido" do
      allow(llm).to receive(:structured).and_return("decision" => "comprar", "reason" => "pediu", "data" => { "produto" => "caneca", "qtd" => nil, "intruso" => 1 })

      decision = judge.call

      expect(decision).to have_attributes(output_id: "comprar", reason: "pediu", data: { "produto" => "caneca" })
      expect(decision).to be_exit
    end

    it "pergunta ao modelo com o esquema das saídas e a conversa inteira" do
      allow(llm).to receive(:structured).and_return("decision" => "stay", "reason" => "x")

      judge.call

      expect(llm).to have_received(:structured) do |system:, prompt:, schema:, size:|
        expect(size).to eq("fast")
        expect(prompt).to eq("Cliente: oi\nAssistente: olá")
        expect(system).to include("id: comprar | quando: Quer comprar")
        expect(schema["properties"]["decision"]["enum"]).to eq(%w[comprar sair stay])
        expect(schema["properties"]["data"]["properties"]["produto"]["type"]).to eq(%w[string null])
        expect(schema["properties"]["data"]["additionalProperties"]).to be(false)
      end
    end

    it "sem dado obrigatório, fica e diz o que falta" do
      allow(llm).to receive(:structured).and_return("decision" => "comprar", "reason" => "x", "data" => { "produto" => nil })

      decision = judge.call

      expect(decision).not_to be_exit
      expect(decision.missing).to eq([ "produto" ])
    end

    it "decisão fora da lista é ficar" do
      allow(llm).to receive(:structured).and_return("decision" => "inventada", "reason" => "")

      expect(judge.call.output_id).to eq("stay")
    end

    it "sem parâmetros em nenhuma saída, o esquema nem pede dados" do
      allow(llm).to receive(:structured).and_return("decision" => "stay", "reason" => "")

      described_class.new(llm: llm, outputs: [ { "id" => "a", "label" => "A" } ], history: history, turns: 1).call

      expect(llm).to have_received(:structured) { |schema:, **| expect(schema["properties"]).not_to have_key("data") }
    end
  end

  describe FlowRuntime::ToolRegistry do
    it "vazio não entrega nada: quem escolhe é o bloco" do
      create(:tool_function, organization: organization)

      expect(described_class.for(organization: organization, tool_ids: []).tools).to be_empty
    end

    it "traz só o que foi escolhido, da organização" do
      tool = create(:tool_function, organization: organization)
      other = create(:tool_function, organization: organization)
      alheia = create(:tool_function, organization: create(:organization))

      registry = described_class.for(organization: organization, tool_ids: [ tool.id.to_s, alheia.id.to_s ])

      expect(registry.tools).to eq([ tool ])
      expect(registry.find(tool.name)).to eq(tool)
      expect(registry.find(other.name)).to be_nil
    end

    it "não oferece função de ferramenta desligada" do
      installation = create(:tool_installation, organization: organization, enabled: false)
      tool = create(:tool_function, organization: organization, tool_installation_id: installation.id.to_s)

      expect(described_class.for(organization: organization, tool_ids: [ tool.id.to_s ]).tools).to be_empty
    end

    it "monta o formato da API, sem nome repetido" do
      first = create(:tool_function, organization: organization, name: "igual")
      second = create(:tool_function, organization: organization, name: "igual")

      definitions = described_class.for(organization: organization, tool_ids: [ first.id.to_s, second.id.to_s ]).definitions

      expect(definitions.length).to eq(1)
      expect(definitions.first).to include(name: "igual", description: first.description)
      expect(definitions.first[:input_schema]).to include("type" => "object")
    end
  end

  describe FlowRuntime::Limits do
    it "deixa passar o que cabe, e corta o que não cabe" do
      expect(described_class.clip("abc", 10)).to eq("abc")
      expect(described_class.clip("a" * 20, 10).bytesize).to be <= 10
      expect(described_class.clip({ "a" => 1 }, 100)).to eq("a" => 1)
      expect(described_class.clip({ "a" => "b" * 200 }, 100)).to include("_truncated" => true)
      expect(described_class.clip(10, 1)).to eq(10)
      expect(described_class.clip(nil, 1)).to be_nil
    end

    it "levanta quando o conjunto de variáveis passa do teto" do
      many = Array.new(20) { |index| [ "v#{index}", "a" * described_class::MAX_VARIABLE_BYTES ] }.to_h

      expect { described_class.bound_variables(many) }.to raise_error(described_class::TooLarge)
    end
  end

  describe FlowRuntime::InboundMessage do
    it "vai e volta pelo argumento do job" do
      message = described_class.new("oi", message_id: "EXT-1", media_url: "https://a.test/b.ogg")

      restored = described_class.from_h(JSON.parse(message.to_h.to_json))

      expect(restored).to have_attributes(content: "oi", role: "user", message_id: "EXT-1", media_url: "https://a.test/b.ogg", text: "oi", body: "oi")
    end

    it "sem nada, é nil" do
      expect(described_class.from_h(nil)).to be_nil
    end
  end

  describe FlowRuntime::ExecutionContext::Templating do
    let(:scope) { { "vars" => { "lista" => [ { "titulo" => "a" } ], "n" => 0, "mapa" => { "x" => 1 } }, "contact" => {} } }

    it "atravessa mapas e listas, e o que não existe vira vazio" do
      expect(described_class.render("{{vars.lista.0.titulo}} {{ vars.n }} {{vars.mapa}} {{vars.nada.mais}} {{contact.name}}.", scope)).to eq("a 0 {\"x\":1}  .")
    end

    it "deixa como está o que não é variável" do
      expect(described_class.render("{ vars.n } {{}}", scope)).to eq("{ vars.n } {{}}")
    end
  end

  describe FlowRuntime::KanbanGateway do
    it "sem conversa, não chega a chamar a operação" do
      context = instance_double(FlowRuntime::ExecutionContext, chat: nil, organization: organization)
      allow(Pipelines::Automation).to receive(:call)

      expect(described_class.new(context).call(:move_card, "x")).to eq(ok: false, error: "no_chat")
      expect(Pipelines::Automation).not_to have_received(:call)
    end

    it "chama a operação com a organização e a conversa do fluxo" do
      chat = create(:chat, organization: organization)
      context = instance_double(FlowRuntime::ExecutionContext, chat: chat, organization: organization)

      expect(described_class.new(context).call(:get_card, SecureRandom.uuid)).to include(ok: false, error: a_string_starting_with("not_found: Card"))
    end
  end

  describe FlowRuntime::CardRefs do
    it "lembra o card na execução e na conversa, e lê de volta nas duas" do
      chat = create(:chat, organization: organization)
      flow = create(:flow, organization: organization)
      execution = create(:flow_execution, flow: flow, chat_id: chat.id.to_s, status: "running")
      context = FlowRuntime::ExecutionContext.new(execution: execution)

      described_class.new(context).remember("no-1", "card-1")
      described_class.new(context).remember("inválido!", "card-2")

      expect(described_class.new(context).fetch("no-1")).to eq("card-1")
      expect(chat.reload.flow_data[flow.id.to_s]["_cards"]).to eq("no-1" => "card-1")

      fresh = create(:flow_execution, flow: flow, chat_id: chat.id.to_s, status: "completed")
      expect(described_class.new(FlowRuntime::ExecutionContext.new(execution: fresh)).fetch("no-1")).to eq("card-1")
    end
  end
end
