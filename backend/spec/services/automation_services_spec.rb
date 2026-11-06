require "rails_helper"

RSpec.describe "Serviços de automação" do
  include ActionCable::TestHelper

  let(:organization) { create(:organization) }

  describe Flows::KeywordMatcher do
    it "casa sem ligar para caixa e acento, como palavra inteira" do
      expect(described_class.match?("Quero um ORCAMENTO, por favor", [ "orçamento" ])).to be(true)
      expect(described_class.match?("aceita pix?", [ "cartão", "PIX" ])).to be(true)
      expect(described_class.match?("gostei do pixel", [ "pix" ])).to be(false)
      expect(described_class.match?("falar com atendente humano", [ "atendente humano" ])).to be(true)
    end

    it "sem palavra ou sem texto, não casa" do
      expect(described_class.match?("oi", [])).to be(false)
      expect(described_class.match?("oi", [ "", nil ])).to be(false)
      expect(described_class.match?("", [ "oi" ])).to be(false)
    end

    it "palavra com caractere especial não vira expressão" do
      expect(described_class.match?("quero c++", [ "c++" ])).to be(true)
      expect(described_class.match?("abc", [ "a.c" ])).to be(false)
    end
  end

  describe Flows::TriggerIndex do
    it "diz o que a organização tem publicado, e esquece ao mudar" do
      expect(described_class.active?(organization.id, "contact_created")).to be(false)

      published_flow(organization, [ node("t", "trigger_contact_created") ], [], trigger_type: "contact_created")

      expect(described_class.active?(organization.id, "contact_created")).to be(true)
      expect(described_class.message_flows?(organization.id)).to be(false)
    end

    it "não consulta o banco a cada mensagem" do
      described_class.types(organization.id)

      expect(Flow).not_to receive(:published)
      described_class.types(organization.id)
    end
  end

  describe Flows::CancelActive do
    let(:flow) { create(:flow, organization: organization) }
    let(:chat) { create(:chat, organization: organization) }

    it "encerra as vivas do fluxo e da conversa, e deixa as outras" do
      viva = create(:flow_execution, flow: flow, chat_id: chat.id.to_s, status: "waiting", resume_token: "x")
      terminada = create(:flow_execution, flow: flow, chat_id: chat.id.to_s, status: "completed")
      teste = create(:flow_execution, flow: flow, chat_id: chat.id.to_s, status: "running", playground: true)

      described_class.for_chat(chat)

      expect(viva.reload).to have_attributes(status: "cancelled", resume_token: nil)
      expect(terminada.reload.status).to eq("completed")
      expect(teste.reload.status).to eq("running")
    end

    it "por fluxo, também" do
      viva = create(:flow_execution, flow: flow, chat_id: chat.id.to_s, status: "waiting_for_message")

      described_class.for_flow(flow)

      expect(viva.reload.status).to eq("cancelled")
    end
  end

  describe Tools::InstallService do
    let(:tool) { create(:tool, credentials_schema: [ { "name" => "api_key", "required" => true } ]) }

    it "copia as funções para a organização" do
      result = described_class.new(tool, organization, credentials: { api_key: "x" }).call

      expect(result).to be_success
      function = result.data.tool_functions.first
      expect(function).to have_attributes(name: "consultar_cep", organization_id: organization.id.to_s, tool_installation_id: result.data.id.to_s)
    end

    it "falta credencial obrigatória: não instala" do
      result = described_class.new(tool, organization).call

      expect(result).not_to be_success
      expect(result.errors.first).to include("api_key")
      expect(ToolInstallation.for_organization(organization.id)).not_to exist
    end

    it "instalar de novo refaz as funções, sem duplicar nem perder a credencial" do
      described_class.new(tool, organization, credentials: { api_key: "x" }).call
      first_ids = ToolInstallation.for_organization(organization.id).take.tool_function_ids

      tool.update!(credentials_schema: [])
      result = described_class.new(tool, organization).call

      expect(ToolInstallation.for_organization(organization.id).count).to eq(1)
      expect(result.data.tool_function_ids).not_to eq(first_ids)
      expect(organization.tool_functions.count).to eq(1)
      expect(result.data.credentials).to eq("api_key" => "x")
    end

    it "em organizações diferentes, cada uma com a sua" do
      other = create(:organization)
      described_class.new(tool, organization, credentials: { api_key: "a" }).call
      described_class.new(tool, other, credentials: { api_key: "b" }).call

      expect(ToolInstallation.count).to eq(2)
      expect(organization.tool_functions.count).to eq(1)
    end
  end

  describe Tools::UninstallService do
    it "leva as funções do catálogo e deixa a que foi personalizada" do
      tool = create(:tool, credentials_schema: [])
      installation = Tools::InstallService.new(tool, organization).call.data
      function = installation.tool_functions.first
      personal = create(:tool_function, organization: organization)
      installation.update!(tool_function_ids: installation.tool_function_ids + [ personal.id.to_s ])

      Tools::UninstallService.new(installation).call

      expect(ToolInstallation.for_organization(organization.id)).not_to exist
      expect(ToolFunction::MiniRacer.where(id: function.id)).not_to exist
      expect(ToolFunction::MiniRacer.where(id: personal.id)).to exist
    end
  end

  describe Tools::FunctionListSerializer do
    it "traz a ferramenta de origem, sem N+1" do
      tool = create(:tool, icon: "solar:cart", color: "#000000")
      installation = create(:tool_installation, organization: organization, tool_id: tool.id.to_s)
      installed = create(:tool_function, organization: organization, tool_installation_id: installation.id.to_s)
      own = create(:tool_function, organization: organization)

      list = described_class.call([ installed, own ])

      expect(list.first[:tool]).to include(name: tool.name, slug: tool.slug, icon: "solar:cart")
      expect(list.second[:tool]).to be_nil
      expect(described_class.call([])).to eq([])
    end
  end

  describe Hooks::SlimJsonPath do
    it "achata mapas e listas" do
      flat = described_class.fetch_all_slim("body" => { "a" => { "b" => 1 }, "l" => [ 1, { "c" => 2 }, [ 3 ] ] }, "x" => nil)

      expect(flat).to eq("body.a.b" => 1, "body.l.0" => 1, "body.l.1.c" => 2, "body.l.2.0" => 3, "x" => nil)
      expect(described_class.fetch_all_slim(nil)).to eq({})
    end
  end

  describe Hooks::Capture do
    it "corta o corpo grande para o log, e deixa o resto como está" do
      capture = { "body" => { "a" => "b" * (described_class::MAX_LOGGED_BODY_BYTES + 1) }, "query" => { "q" => "1" } }

      expect(described_class.for_log(capture)["body"]).to include("_truncated" => true)
      expect(described_class.for_log(capture)["query"]).to eq("q" => "1")
      expect(described_class.for_log("body" => { "a" => 1 })).to eq("body" => { "a" => 1 })
    end
  end
end
