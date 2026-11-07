require "rails_helper"

# Contrato polimórfico de `#send_text_message`.
#
# `Connector::Base` é despachada polimorficamente por toda a aplicação
# (`chat.connector.send_text_message(...)`), e quem chama usa o retorno de duas formas: como
# valor de `ChatMessage#message_id` (campo String) e como booleano, para decidir entre
# `delivery_ack` e `failed`.
#
# O contrato é: **devolver o id externo da mensagem como String, ou nil se o envio não
# produziu um id.** Um objeto rico quebra os dois usos em silêncio: o Mongoid persiste o
# `to_s` dele, e nenhum webhook de status acha a mensagem depois, e a checagem de verdade
# nunca vira `failed`. Foi o que acontecia na origem com o WhatsApp Cloud e com Messenger e
# Instagram.
#
# Este spec percorre todas as implementações para que um conector novo, ou uma alteração num
# existente, não volte a divergir sem quebrar o build.
RSpec.describe "Contrato de Connector#send_text_message" do
  include ConnectorHelpers

  let(:organization) { create(:organization) }

  def expect_id_or_nil(value)
    expect(value).to be_nil.or(be_a(String)), "esperava String ou nil, veio #{value.class}: #{value.inspect}"
  end

  before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

  describe Connector::WhatsappCloud do
    let(:connector) { create(:connector_whatsapp_cloud, organization: organization, phone_number_id: 1_234_567_890) }
    let(:url) { "https://graph.facebook.com/v19.0/1234567890/messages" }

    it "devolve o wamid como String" do
      stub_request(:post, url).to_return(json_reply({ messages: [ { id: "wamid.OUT" } ] }))

      expect(connector.send_text_message("5511999999999", "oi")).to eq("wamid.OUT")
    end

    it "devolve nil quando a resposta não traz id" do
      stub_request(:post, url).to_return(json_reply({}))

      expect_id_or_nil(connector.send_text_message("5511999999999", "oi"))
    end

    # Uma resposta de erro do SDK não tem `data`: não pode explodir.
    it "devolve nil em resposta de erro" do
      stub_request(:post, url).to_return(json_reply({ error: { code: 131_047, message: "fora da janela" } }, status: 400))

      expect(connector.send_text_message("5511999999999", "oi")).to be_nil
    end

    it "devolve nil em resposta de formato inesperado" do
      stub_request(:post, url).to_return(json_reply({ foo: "bar" }))

      expect(connector.send_text_message("5511999999999", "oi")).to be_nil
    end
  end

  describe Connector::WhatsappWeb do
    { aiva: "http://aiva.test", evolution: "http://evolution.test" }.each do |provider, base|
      context "com o provedor #{provider}" do
        let(:connector) do
          traits = provider == :aiva ? [ :aiva ] : []
          create(:connector_whatsapp_web, *traits, organization: organization, instance_name: "WS-1")
        end
        let(:url) { "#{base}/message/sendText/WS-1" }

        it "devolve o id do provedor como String" do
          stub_request(:post, url).to_return(json_reply({ key: { id: "OUT-1" } }))

          expect(connector.send_text_message("5511999999999", "oi")).to eq("OUT-1")
        end

        it "devolve nil em 2xx sem corpo" do
          stub_request(:post, url).to_return(status: 200, body: "")

          expect(connector.send_text_message("5511999999999", "oi")).to be_nil
        end

        it "devolve nil em 2xx sem o id" do
          stub_request(:post, url).to_return(json_reply({}))

          expect(connector.send_text_message("5511999999999", "oi")).to be_nil
        end
      end
    end

    it "devolve nil desconectado" do
      closed = create(:connector_whatsapp_web, :aiva, organization: organization, status: :closed)

      expect(closed.send_text_message("5511999999999", "oi")).to be_nil
    end
  end

  describe Connector::FacebookMessenger do
    let(:connector) { create(:connector_messenger, organization: organization, page_id: "P1") }
    let(:url) { "https://graph.facebook.com/v22.0/P1/messages" }

    it "devolve o id como String, nunca a resposta HTTP" do
      stub_request(:post, url).to_return(json_reply({ recipient_id: "PSID", message_id: "mid.1" }))

      expect(connector.send_text_message("PSID", "oi")).to eq("mid.1")
    end

    it "devolve nil quando a Meta recusa" do
      stub_request(:post, url).to_return(json_reply({ error: { message: "x" } }, status: 400))

      expect(connector.send_text_message("PSID", "oi")).to be_nil
    end
  end

  describe Connector::InstagramDirect do
    let(:connector) { create(:connector_instagram, organization: organization, instagram_account_id: "1784") }
    let(:url) { "https://graph.instagram.com/v22.0/1784/messages" }

    it "devolve o id como String, nunca a resposta HTTP" do
      stub_request(:post, url).to_return(json_reply({ recipient_id: "IGSID", message_id: "mid.2" }))

      expect(connector.send_text_message("IGSID", "oi")).to eq("mid.2")
    end

    it "devolve nil quando a Meta recusa" do
      stub_request(:post, url).to_return(json_reply({ error: { message: "x" } }, status: 400))

      expect(connector.send_text_message("IGSID", "oi")).to be_nil
    end
  end

  describe Connector::LeadChat do
    let(:connector) { create(:connector_lead_chat, organization: organization) }
    let(:chat) { create(:chat, connector: connector, external_fields: { "session_id" => "S1" }) }
    let(:url) { "#{LeadChatApi::Config::API_BASE_URL}/chat/v1/session/S1/message/sync" }

    it "devolve o id como String, nunca o hash da resposta" do
      stub_request(:post, url).to_return(status: 200, body: { id: "L1" }.to_json)

      expect(connector.send_text_message("x", "oi", chat)).to eq("L1")
    end

    it "converte id numérico" do
      stub_request(:post, url).to_return(status: 200, body: { id: 7 }.to_json)

      expect(connector.send_text_message("x", "oi", chat)).to eq("7")
    end

    it "devolve nil em timeout" do
      stub_request(:post, url).to_raise(Faraday::TimeoutError)

      expect(connector.send_text_message("x", "oi", chat)).to be_nil
    end

    it "devolve nil sem conversa" do
      expect(connector.send_text_message("x", "oi")).to be_nil
    end
  end

  describe Connector::WebWidget do
    let(:connector) { create(:connector_web_widget, organization: organization) }

    it "devolve o id gerado como String" do
      chat = create(:chat, connector: connector, external_id: "visitante")

      expect(connector.send_text_message("x", "oi", chat)).to be_a(String)
    end

    it "devolve nil sem conversa" do
      expect(connector.send_text_message("x", "oi", nil)).to be_nil
    end
  end

  # Conector novo entra aqui e nos blocos acima: é o que garante que ninguém fica sem contrato.
  it "cobre todos os conectores que existem" do
    Rails.application.eager_load! unless Rails.application.config.eager_load

    known = [
      Connector::WhatsappCloud, Connector::WhatsappWeb, Connector::FacebookMessenger,
      Connector::InstagramDirect, Connector::LeadChat, Connector::WebWidget
    ]

    # O Google Agenda também é um conector, mas não conversa com ninguém: não entra no contrato.
    not_channels = [ Connector::GoogleCalendar ]

    # `name`: outras specs podem ter criado subclasses anônimas, que também ficam na lista.
    expect(Connector::Base.descendants.select(&:name) - not_channels).to match_array(known)
    expect(known).to all(satisfy { |klass| klass.method_defined?(:send_text_message) })
    expect(not_channels).to all(satisfy { |klass| !klass.method_defined?(:send_text_message) })
  end

  # O id precisa caber no campo: é o que os webhooks de status procuram depois.
  it "o id devolvido persiste como veio em ChatMessage#message_id" do
    connector = create(:connector_whatsapp_cloud, organization: organization, phone_number_id: 1_234_567_890)
    chat = create(:chat, connector: connector)
    stub_request(:post, "https://graph.facebook.com/v19.0/1234567890/messages").to_return(json_reply({ messages: [ { id: "wamid.PERSISTE" } ] }))

    message = create(:chat_text_message, chat: chat, message_id: connector.send_text_message("5511999999999", "oi"))

    expect(ChatMessage::Base.unscoped.where(chat_id: chat.id, message_id: "wamid.PERSISTE").take).to eq(message)
  end
end
