require "rails_helper"

RSpec.describe Chats::InboundCommands do
  include InboundHelpers

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5531971810932", automation_enabled: false, flow_next_node_id: "no-3") }
  let!(:send_text) do
    stub_request(:post, "http://evolution.test/message/sendText/#{connector.instance_name}")
      .to_return(status: 201, headers: InboundHelpers::JSON_HEADERS, body: { key: { id: "RESPOSTA" } }.to_json)
  end

  def handle(text, to: "5531971810932", **options)
    described_class.handle(chat: chat, connector: connector, text: text, to: to, **options)
  end

  describe "limpar o contexto" do
    [ "--CLEAR-CONTEXT--", "CCTX", "cctx", "Cctx", "  CCTX\n", "--clear-context--" ].each do |command|
      it "#{command.inspect} é comando" do
        expect(handle(command)).to be(true)
      end
    end

    it "desativa o histórico" do
      previous = create(:chat_text_message, chat: chat)

      handle("CCTX")

      expect(previous.reload.active).to be(false)
    end

    it "religa a automação e tira a conversa do meio do fluxo" do
      handle("CCTX")

      expect(chat.reload).to have_attributes(automation_enabled: true, flow_next_node_id: nil)
    end

    it "deixa a nota no histórico" do
      handle("CCTX")

      expect(notes_of(chat, "context-clear").take).to have_attributes(content: "Contexto limpo", role: "base")
    end

    it "a próxima mensagem conta como a primeira" do
      create(:chat_text_message, chat: chat)

      handle("CCTX")

      expect(ChatMessage::Base.where(chat_id: chat.id).exists?).to be(false)
    end

    it "responde para o destino informado" do
      handle("CCTX", to: "5531900000000")

      expect(send_text.with(body: hash_including("number" => "5531900000000@s.whatsapp.net", "text" => "Contexto limpo"))).to have_been_requested
    end

    # O LeadChat usa um comando próprio, para não colidir.
    context "com comandos próprios" do
      it "vale o comando informado" do
        expect(handle("--X-CLEAR-CONTEXT-X--", clear_commands: [ "--X-CLEAR-CONTEXT-X--" ])).to be(true)
      end

      it "os padrões deixam de valer" do
        expect(handle("CCTX", clear_commands: [ "--X-CLEAR-CONTEXT-X--" ])).to be(false)
        expect(send_text).not_to have_been_requested
      end
    end

    it "se o canal falhar, o erro sobe para o job tentar de novo" do
      allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
      stub_request(:post, "http://evolution.test/message/sendText/#{connector.instance_name}").to_return(status: 500, body: "fora")

      expect { handle("CCTX") }.to raise_error(/Failed to send message/)
    end
  end

  describe "--RE-ACTIVE-ME--" do
    [ "--RE-ACTIVE-ME--", "  --RE-ACTIVE-ME-- ", "--re-active-me--" ].each do |command|
      it "#{command.inspect} é comando" do
        expect(handle(command)).to be(true)
      end
    end

    it "religa a automação" do
      handle("--RE-ACTIVE-ME--")

      expect(chat.reload.automation_enabled).to be(true)
    end

    it "não mexe no histórico" do
      previous = create(:chat_text_message, chat: chat)

      handle("--RE-ACTIVE-ME--")

      expect(previous.reload.active).to be(true)
      expect(notes_of(chat, "context-clear").count).to eq(0)
    end

    it "deixa a nota da automação retomada" do
      handle("--RE-ACTIVE-ME--")

      expect(notes_of(chat, "automation-toggle-notation").take.content).to eq("A automação foi retomada.")
    end

    it "confirma para o contato" do
      handle("--RE-ACTIVE-ME--")

      expect(send_text.with(body: hash_including("text" => "Certo, sua conversa está ativa de novo."))).to have_been_requested
    end

    it "fica de fora nos canais que não têm o comando" do
      expect(handle("--RE-ACTIVE-ME--", reactivate: false)).to be(false)

      expect(chat.reload.automation_enabled).to be(false)
      expect(send_text).not_to have_been_requested
    end
  end

  describe "texto comum" do
    [ "Oi, tudo bem?", "CCTX agora", "quero o CCTX", "", nil, "PFUP" ].each do |text|
      it "#{text.inspect} não é comando" do
        expect(handle(text)).to be(false)

        expect(chat.reload.automation_enabled).to be(false)
        expect(send_text).not_to have_been_requested
      end
    end
  end
end
