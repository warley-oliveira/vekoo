require "rails_helper"

RSpec.describe Messages::ReactionService do
  subject(:service) { described_class.new(message: message, emoji: emoji, account: account) }

  let(:emoji) { "👍" }
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, name: "Warley Lima") }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5511999999999@s.whatsapp.net") }
  let(:role) { "assistant" }
  let(:message) { create(:chat_text_message, chat: chat, role: role, message_id: "EVO_MSG_ABC") }
  let(:reaction_url) { "http://evolution.test/message/sendReaction/#{connector.instance_name}" }

  def json_reply(payload, status: 201)
    { status: status, body: payload.to_json, headers: { "Content-Type" => "application/json" } }
  end

  def stub_provider
    stub_request(:post, reaction_url).to_return(json_reply({ key: { id: "REACTION_ID" } }))
  end

  def a_reaction(from_me:, emoji:)
    a_request(:post, reaction_url).with(
      body: { key: { remoteJid: "5511999999999@s.whatsapp.net", fromMe: from_me, id: "EVO_MSG_ABC" }, reaction: emoji }.to_json
    )
  end

  before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

  describe "reagindo a uma mensagem que nós enviamos" do
    before { stub_provider }

    # `key.fromMe` descreve a mensagem ALVO, não quem está reagindo.
    it "envia com fromMe true" do
      expect(service.call).to be_success

      expect(a_reaction(from_me: true, emoji: "👍")).to have_been_made.once
    end

    it "grava a reação do nosso lado com o autor da plataforma" do
      service.call

      expect(message.reload.reactions.first).to include(
        "emoji" => "👍", "from" => "assistant", "sender_name" => "Warley Lima", "account_id" => account.id
      )
    end

    it "transmite a mensagem com a reação, que é como a bolha reage em tempo real" do
      message

      expect { service.call }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat)).with(
        a_hash_including("id" => message.id.to_s, "reactions" => [ a_hash_including("emoji" => "👍", "from" => "assistant") ])
      )
    end

    it "sem conta, grava sem autor" do
      described_class.new(message: message, emoji: "👍").call

      expect(message.reload.reactions.first.keys).to contain_exactly("emoji", "from", "reacted_at")
    end
  end

  describe "reagindo a uma mensagem recebida do contato" do
    let(:role) { "user" }

    it "envia com fromMe false" do
      stub_provider

      service.call

      expect(a_reaction(from_me: false, emoji: "👍")).to have_been_made.once
    end
  end

  describe "cada lado tem no máximo uma reação" do
    let(:contact_reaction) { { "emoji" => "❤️", "from" => "user", "sender_name" => "Maria" } }

    before do
      stub_provider
      message.set(reactions: [ contact_reaction ])
    end

    it "reagir não mexe na reação do outro lado" do
      service.call

      expect(message.reload.reactions.map { |reaction| reaction["from"] }).to contain_exactly("user", "assistant")
      expect(message.reactions).to include(contact_reaction)
    end

    it "trocar de emoji substitui a nossa" do
      service.call
      described_class.new(message: message, emoji: "🎉", account: account).call

      ours = message.reload.reactions.select { |reaction| reaction["from"] == "assistant" }
      expect(ours.map { |reaction| reaction["emoji"] }).to eq([ "🎉" ])
    end

    context "com o emoji em branco (remoção)" do
      let(:emoji) { "" }

      before do
        message.set(reactions: [ contact_reaction, { "emoji" => "👍", "from" => "assistant" } ])
      end

      it "envia vazio, que é como o protocolo remove a reação" do
        expect(service.call).to be_success

        expect(a_reaction(from_me: true, emoji: "")).to have_been_made.once
      end

      it "tira só a reação do nosso lado" do
        service.call

        expect(message.reload.reactions).to eq([ contact_reaction ])
      end
    end

    it "emoji nil também remove" do
      message.set(reactions: [ { "emoji" => "👍", "from" => "assistant" } ])

      described_class.new(message: message, emoji: nil, account: account).call

      expect(message.reload.reactions).to eq([])
    end
  end

  describe "validação do emoji" do
    before { stub_provider }

    context "composto com tom de pele" do
      let(:emoji) { "👍🏻" }

      it "aceita, porque é um único grafema" do
        expect(service.call).to be_success
      end
    end

    context "composto por junção (família)" do
      let(:emoji) { "👨‍👩‍👧" }

      it "aceita" do
        expect(service.call).to be_success
      end
    end

    context "com espaço em volta" do
      let(:emoji) { " 👍 " }

      it "limpa antes de enviar" do
        service.call

        expect(a_reaction(from_me: true, emoji: "👍")).to have_been_made.once
      end
    end

    context "com mais de um emoji" do
      let(:emoji) { "👍❤️" }

      it "recusa antes de chamar o provedor, que devolveria 400" do
        result = service.call

        expect(result).not_to be_success
        expect(result.errors).to include(I18n.t("connectors.messages.reaction_single_emoji"))
        expect(a_request(:post, reaction_url)).not_to have_been_made
      end
    end

    context "com texto no lugar do emoji" do
      let(:emoji) { "ok" }

      it "recusa" do
        result = service.call

        expect(result).not_to be_success
        expect(result.errors).to include(I18n.t("connectors.messages.reaction_single_emoji"))
      end
    end
  end

  describe "só a Evolution envia reação" do
    shared_examples "canal sem reação" do
      it "recusa" do
        result = service.call

        expect(result).not_to be_success
        expect(result.errors).to include(I18n.t("connectors.messages.reaction_unsupported"))
      end
    end

    context "com a Vekoo" do
      let(:connector) { create(:connector_whatsapp_web, :vekoo, organization: organization) }

      it_behaves_like "canal sem reação"
    end

    context "com a WABA" do
      let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }

      it_behaves_like "canal sem reação"
    end
  end

  describe "mensagem sem id no provedor" do
    let(:message) { create(:chat_text_message, chat: chat, role: role, message_id: nil) }

    it "recusa, porque não há chave para montar o pedido" do
      expect(service.call.errors).to include(I18n.t("connectors.messages.reaction_no_external_id"))
    end
  end

  describe "mensagem apagada" do
    let(:message) { create(:chat_text_message, chat: chat, role: role, message_id: "EVO_MSG_ABC", deleted_at: Time.current) }

    it "recusa" do
      expect(service.call.errors).to include(I18n.t("connectors.messages.reaction_deleted"))
    end
  end

  describe "conversa sem conector" do
    let(:chat) { create(:chat, organization: organization) }

    it "recusa" do
      expect(service.call.errors).to include(I18n.t("connectors.messages.connector_not_found"))
    end
  end

  describe "quando o provedor falha" do
    before { stub_request(:post, reaction_url).to_return(status: 500, body: "erro") }

    it "devolve falha sem gravar a reação local" do
      result = service.call

      expect(result).not_to be_success
      expect(result.errors).to include(I18n.t("connectors.messages.reaction_failed"))
      expect(message.reload.reactions).to eq([])
    end

    it "não transmite a mensagem" do
      message

      expect { service.call }.not_to have_broadcasted_to(ChatMessage::Base.stream_for(chat))
    end
  end

  it "fora do ar também devolve falha" do
    stub_request(:post, reaction_url).to_timeout

    expect(service.call.errors).to include(I18n.t("connectors.messages.reaction_failed"))
  end

  it "devolve a mensagem no resultado" do
    stub_provider

    expect(service.call.message).to eq(message)
  end
end
