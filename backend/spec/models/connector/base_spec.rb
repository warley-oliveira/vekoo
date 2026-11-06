require "rails_helper"

RSpec.describe Connector::Base do
  include ConnectorHelpers
  include ActionCable::TestHelper

  let(:organization) { create(:organization) }

  describe "validações e padrões" do
    it "exige a organização" do
      connector = Connector::WebWidget.new

      expect(connector).not_to be_valid
      expect(connector.errors[:organization_id]).to be_present
    end

    it "nasce inativo quando ninguém informa o status" do
      connector = Connector::WebWidget.create!(organization_id: organization.id)

      expect(connector.status).to eq(:inactive)
      expect(connector.reload.status_cd).to eq("inactive")
    end

    it "respeita o status informado na criação" do
      expect(create(:connector_web_widget, organization: organization, status: :paused).status).to eq(:paused)
    end

    it "recusa status fora da lista" do
      expect { Connector::WebWidget.new(status: :quebrado) }.to raise_error(ArgumentError, /status inválido/)
    end

    it "não manda o nome do atendente por padrão" do
      expect(create(:connector_web_widget, organization: organization).send_collaborator_name).to be(false)
    end
  end

  describe ".scoped" do
    let!(:connector) { create(:connector_web_widget, organization: organization) }

    it "acha o conector pelo par organização e id, no tipo certo" do
      expect(described_class.scoped(organization.id, connector.id)).to eq(connector)
      expect(described_class.scoped(organization.id, connector.id)).to be_a(Connector::WebWidget)
    end

    it "aceita o id como string, como ele vem da URL" do
      expect(described_class.scoped(organization.id, connector.id.to_s)).to eq(connector)
    end

    it "não alcança conector de outra organização" do
      expect(described_class.scoped(create(:organization).id, connector.id)).to be_nil
    end

    it "devolve nil para id que não existe" do
      expect(described_class.scoped(organization.id, BSON::ObjectId.new)).to be_nil
    end

    it "devolve nil para o que nem é um id, sem levantar" do
      expect(described_class.scoped(organization.id, "nao-e-um-id")).to be_nil
    end
  end

  describe "contrato de ciclo de vida" do
    it "obriga a subclasse a implementar activate e deactivate" do
      connector = described_class.new(organization_id: organization.id)

      expect { connector.activate }.to raise_error(NotImplementedError)
      expect { connector.deactivate }.to raise_error(NotImplementedError)
    end
  end

  describe "#organization" do
    it "carrega a organização dona" do
      expect(create(:connector_web_widget, organization: organization).organization).to eq(organization)
    end

    it "devolve nil, sem levantar, se a organização sumiu" do
      connector = create(:connector_web_widget, organization: organization)
      connector.set(organization_id: SecureRandom.uuid)

      expect(described_class.find(connector.id).organization).to be_nil
    end
  end

  describe "nomes" do
    it "expõe o status como texto" do
      expect(create(:connector_web_widget, organization: organization, status: :active).status_name).to eq("active")
    end

    {
      connector_whatsapp_cloud: "whatsapp_cloud",
      connector_whatsapp_web: "whatsapp_web",
      connector_zapi: "zapi",
      connector_instagram: "instagram_direct",
      connector_messenger: "facebook_messenger",
      connector_lead_chat: "lead_chat",
      connector_web_widget: "web_widget"
    }.each do |factory, type|
      it "#{factory} se apresenta como #{type} para a tela e a API" do
        connector = create(factory, organization: organization)

        expect(connector.connector_type).to eq(type)
        expect(connector.type).to eq(connector.class.name)
        expect(connector.display_name).to be_present
      end
    end

    it "usa o id como nome quando a subclasse não tem nome melhor" do
      connector = described_class.new(organization_id: organization.id)

      expect(connector.instance_name).to eq(connector.id.to_s)
      expect(connector.display_name).to eq(connector.id.to_s)
    end
  end

  describe "stream de conexão" do
    let(:connector) { create(:connector_web_widget, organization: organization) }

    it "fica no espaço da organização, separado por conector" do
      expect(connector.stream_name).to eq(ApplicationCable::Channel.organization_stream(organization.id, "connector:#{connector.id}"))
      expect(connector.stream_name).not_to eq(create(:connector_web_widget, organization: organization).stream_name)
    end

    it "transmite o progresso da conexão nesse stream" do
      expect { connector.broadcast_connection(status: "qr_updated", base64: "abc") }
        .to have_broadcasted_to(connector.stream_name).with(status: "qr_updated", base64: "abc")
    end
  end

  describe "#inbound_url" do
    let(:connector) { create(:connector_web_widget, organization: organization) }

    around { |example| with_env("BACKEND_URL" => "https://api.vekoo.test/") { example.run } }

    {
      [ :whatsapp_cloud, "ID" ] => "/inbound/whatsapp-cloud/ID",
      [ :meta_messaging ] => "/inbound/meta-messaging",
      [ :evolution, "IWA-1" ] => "/inbound/evolution/IWA-1",
      [ :lead_chat_event, "ID" ] => "/inbound/lead-chat/ID/event",
      [ :zapi_message_received, "ID" ] => "/inbound/zapi/ID/on-message-received",
      [ :zapi_message_send, "ID" ] => "/inbound/zapi/ID/on-message-send",
      [ :zapi_disconnected, "ID" ] => "/inbound/zapi/ID/on-whatsapp-disconnected",
      [ :zapi_connected, "ID" ] => "/inbound/zapi/ID/on-whatsapp-connected"
    }.each do |args, path|
      it "monta #{path} sobre a URL pública do backend" do
        expect(connector.inbound_url(*args)).to eq("https://api.vekoo.test#{path}")
      end
    end
  end

  describe "ao apagar" do
    let(:connector) { create(:connector_web_widget, organization: organization) }

    it "leva junto as conversas e as mensagens delas" do
      chat = create(:chat, connector: connector)
      message = create(:chat_text_message, chat: chat)

      connector.destroy

      expect(Chat.where(id: chat.id).exists?).to be(false)
      expect(ChatMessage::Base.unscoped.where(chat_id: chat.id, id: message.id).exists?).to be(false)
    end

    it "solta o proxy sem apagá-lo" do
      proxy = Proxy.create!(url: "http://usuario:senha@proxy.exemplo.com:3128", organization_id: organization.id, connector: connector)

      # Do banco, como no uso real: a instância que criou o proxy guarda o documento cru na
      # associação, sem o `nullify` do proxy do Mongoid.
      described_class.find(connector.id).destroy

      expect(proxy.reload.connector_id).to be_nil
    end
  end
end
