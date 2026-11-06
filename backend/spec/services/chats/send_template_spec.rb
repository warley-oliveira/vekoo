require "rails_helper"

RSpec.describe Chats::SendTemplate do
  include AttachmentHelpers

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, name: "Alice Prado") }
  let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5531971810932") }
  let(:graph_url) { "https://graph.facebook.com/v19.0/#{connector.phone_number_id}/messages" }
  let(:template) { create(:whatsapp_template, connector: connector, name: "lembrete", components: [ { "type" => "BODY", "text" => "Olá {{1}}" } ]) }
  let(:components) { [ { "type" => "body", "parameters" => [ { "type" => "text", "text" => "Maria" } ] } ] }

  def accepted(id = "wamid.TPL")
    { status: 200, body: { messaging_product: "whatsapp", contacts: [ { input: "5531971810932", wa_id: "5531971810932" } ], messages: [ { id: id } ] }.to_json }
  end

  def refused(code: 132_000, message: "O modelo não existe")
    { status: 400, body: { error: { code: code, message: message, type: "OAuthException" } }.to_json }
  end

  def send_template(**options)
    described_class.call(chat: chat, template: template, components: components, account: account, **options)
  end

  def a_template_request(**body)
    a_request(:post, graph_url).with(body: hash_including(body.stringify_keys))
  end

  def header_template(format, **header)
    create(
      :whatsapp_template,
      connector: connector,
      name: "promocao_#{format}",
      components: [
        { "type" => "HEADER", "format" => format.upcase }.merge(header.stringify_keys),
        { "type" => "BODY", "text" => "Olá {{1}}" }
      ]
    )
  end

  describe "modelo de texto" do
    before { stub_request(:post, graph_url).to_return(accepted) }

    it "cria a mensagem com o texto renderizado e quem enviou" do
      message = send_template

      expect(message).to be_a(ChatMessage::Text)
      expect(message.reload).to have_attributes(
        role: "assistant",
        content: "Olá Maria",
        sender_name: "Alice Prado",
        account_id: account.id,
        message_origin: "frontend"
      )
    end

    it "guarda o id devolvido pela Meta" do
      expect(send_template.reload).to have_attributes(message_id: "wamid.TPL", status: "delivery_ack")
    end

    it "manda nome, idioma e parâmetros para a Meta" do
      send_template

      expect(a_template_request(
        type: "template",
        to: 5531971810932,
        template: { "name" => "lembrete", "language" => { "code" => "pt_BR" }, "components" => components }
      )).to have_been_made.once
    end

    it "atualiza a prévia da lista" do
      send_template

      expect(chat.reload).to have_attributes(last_message_content: "Olá Maria", last_message_by: "assistant", last_message_type: "text")
    end

    it "aceita parâmetros do controlador" do
      params = [ ActionController::Parameters.new(components.first) ]

      message = described_class.call(chat: chat, template: template, components: params, account: account)

      expect(message.content).to eq("Olá Maria")
    end

    # É como os outros domínios chamam, de Ruby.
    it "aceita parâmetros com chave em símbolo, e o histórico guarda o texto preenchido" do
      params = [ { type: "body", parameters: [ { type: "text", text: "Maria" } ] } ]

      message = described_class.call(chat: chat, template: template, components: params, account: account)

      expect(message.content).to eq("Olá Maria")
      expect(a_request(:post, graph_url).with { |request| request.body.include?("Maria") }).to have_been_made
    end

    it "sem parâmetros, vale o texto do modelo" do
      expect(described_class.call(chat: chat, template: template, account: account).content).to eq("Olá {{1}}")
    end

    it "não mexe na automação: quem pausa é o canal" do
      send_template

      expect(chat.reload.automation_enabled).to be(true)
    end
  end

  describe "quando não foi uma pessoa" do
    before { stub_request(:post, graph_url).to_return(accepted) }

    it "assina com o nome informado e marca como da plataforma" do
      message = described_class.call(chat: chat, template: template, components: components, sender_name: "Campanha de Natal")

      expect(message).to have_attributes(sender_name: "Campanha de Natal", account_id: nil, message_origin: "platform")
    end

    it "guarda os atributos extras" do
      message = described_class.call(chat: chat, template: template, components: components, attributes: { campaign_id: "camp-1" })

      expect(message.campaign_id).to eq("camp-1")
    end
  end

  describe "modelo sem texto renderizado" do
    it "cai no aviso com o nome do modelo" do
      stub_request(:post, graph_url).to_return(accepted)
      empty = create(:whatsapp_template, connector: connector, name: "sem_corpo", components: [])

      expect(described_class.call(chat: chat, template: empty, account: account).content).to eq("Modelo: sem_corpo")
    end
  end

  describe "cabeçalho de mídia" do
    let(:image_url) { "https://cdn.exemplo.com/banner.jpg" }

    before { stub_request(:post, graph_url).to_return(accepted) }

    context "com imagem" do
      let(:template) { header_template("image", example: { "header_url" => [ image_url ] }) }

      it "cria uma mensagem de imagem com a URL pública" do
        message = send_template

        expect(message).to be_a(ChatMessage::Image)
        expect(message.reload).to have_attributes(
          image_url: image_url,
          media_type: "image",
          caption: "Olá Maria",
          content: "Olá Maria",
          message_id: "wamid.TPL",
          status: "delivery_ack"
        )
      end

      it "acrescenta o cabeçalho com o link no envio" do
        send_template

        expect(a_request(:post, graph_url).with { |request|
          sent = JSON.parse(request.body)["template"]["components"]
          sent.first == { "type" => "header", "parameters" => [ { "type" => "image", "image" => { "link" => image_url } } ] } && sent.size == 2
        }).to have_been_made
      end

      it "não duplica o cabeçalho que já veio nos parâmetros" do
        header = { "type" => "header", "parameters" => [ { "type" => "image", "image" => { "link" => "https://cdn.exemplo.com/outra.jpg" } } ] }

        described_class.call(chat: chat, template: template, components: [ header, *components ], account: account)

        expect(a_request(:post, graph_url).with { |request|
          sent = JSON.parse(request.body)["template"]["components"]
          sent.count { |component| component["type"] == "header" } == 1 && sent.first == header
        }).to have_been_made
      end
    end

    %w[video document].each do |format|
      context "com #{format}" do
        let(:media_url) { "https://cdn.exemplo.com/material.#{format == 'video' ? 'mp4' : 'pdf'}" }
        let(:template) { header_template(format, example: { "header_url" => [ media_url ] }) }

        it "cria uma mensagem de mídia" do
          message = send_template

          expect(message).to be_a(ChatMessage::Media)
          expect(message.reload).to have_attributes(media_url: media_url, media_type: format, caption: "Olá Maria", content: "Olá Maria")
        end
      end
    end

    context "com o anexo ligado ao modelo" do
      let!(:attachment) { stub_attachment(filename: "banner.jpg", url: "https://arquivos.exemplo.com/banner.jpg") }
      let(:template) do
        header_template("image", example: { "header_handle" => [ "https://scontent.whatsapp.net/v/t61/x.jpg" ] }).tap do |record|
          record.set(header_attachment_id: attachment.id)
        end
      end

      it "usa o arquivo do anexo, e não o que a Meta devolveu" do
        expect(send_template.image_url).to eq("https://arquivos.exemplo.com/banner.jpg")
      end
    end

    # O `header_handle` aponta para o CDN interno da Meta: abre no navegador logado, mas guardado
    # no histórico vira mídia quebrada.
    context "só com o link do CDN da Meta" do
      let(:template) { header_template("image", example: { "header_handle" => [ "https://scontent.whatsapp.net/v/t61/x.jpg" ] }) }

      it "não guarda o link interno" do
        expect(send_template.image_url).to be_nil
      end
    end

    context "com cabeçalho de texto" do
      let(:template) { header_template("text", text: "Novidade") }

      it "cria uma mensagem de texto com o cabeçalho em negrito" do
        message = send_template

        expect(message).to be_a(ChatMessage::Text)
        expect(message.content).to eq("*Novidade*\n\nOlá Maria")
      end
    end

    context "com cabeçalho de localização" do
      let(:template) { header_template("location") }

      it "cria uma mensagem de texto" do
        expect(send_template).to be_a(ChatMessage::Text)
      end
    end
  end

  describe "quando a Meta recusa" do
    it "fica failed com a causa que ela mandou" do
      stub_request(:post, graph_url).to_return(refused)

      expect(send_template.reload).to have_attributes(status: "failed", status_message: "O modelo não existe", message_id: nil)
    end

    it "sem causa na resposta, usa o aviso genérico" do
      stub_request(:post, graph_url).to_return(status: 200, body: { messaging_product: "whatsapp" }.to_json)

      expect(send_template.reload).to have_attributes(status: "failed", status_message: I18n.t("connectors.messages.template_failed"))
    end

    it "a tentativa continua no histórico" do
      stub_request(:post, graph_url).to_return(refused)

      message = send_template

      expect(ChatMessage::Base.unscoped.list_for_chat.where(chat_id: chat.id).to_a).to eq([ message ])
    end

    it "registra no log" do
      stub_request(:post, graph_url).to_return(refused)
      allow(Rails.logger).to receive(:error)

      send_template

      expect(Rails.logger).to have_received(:error).with(/\[Chats::SendTemplate\] lembrete \(pt_BR\): \[132000\] O modelo não existe/)
    end

    it "transmite o status failed para a tela" do
      stub_request(:post, graph_url).to_return(refused)
      chat

      expect { send_template }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat)).with(
        a_hash_including("status" => "failed", "statusMessage" => "O modelo não existe")
      )
    end
  end

  describe "quando a rede falha" do
    it "fica failed com a causa, sem levantar" do
      stub_request(:post, graph_url).to_timeout

      message = nil
      expect { message = send_template }.not_to raise_error

      expect(message.reload.status).to eq("failed")
      expect(message.status_message).to be_present
    end

    it "ainda atualiza a prévia da lista" do
      stub_request(:post, graph_url).to_timeout

      send_template

      expect(chat.reload.last_message_content).to eq("Olá Maria")
    end
  end
end
