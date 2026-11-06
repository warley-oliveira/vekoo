require "rails_helper"

RSpec.describe Chats::SendMedia do
  let(:organization) { create(:organization, name: "Clínica Vida") }
  let(:account) { create(:account, organization: organization, name: "Alice Prado") }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:chat) { create(:chat, connector: connector, external_id: "5531971810932") }
  let(:media_url) { "https://cdn.exemplo.com/foto.jpg" }
  let(:media) { MediaMessageDto.new("image", "foto.jpg", nil, nil, "Olha a foto", media_url: media_url) }
  let(:evolution_media_url) { "http://evolution.test/message/sendMedia/#{connector.instance_name}" }
  let(:evolution_audio_url) { "http://evolution.test/message/sendWhatsAppAudio/#{connector.instance_name}" }

  def json_reply(payload, status: 201)
    { status: status, body: payload.to_json, headers: { "Content-Type" => "application/json" } }
  end

  def send_media(**options)
    described_class.call(chat: chat, media: media, **options)
  end

  before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

  describe "a mensagem criada" do
    before { stub_request(:post, evolution_media_url).to_return(json_reply({ key: { id: "EVO-1" } })) }

    it "guarda tipo, URL, legenda e nome do arquivo" do
      expect(send_media.reload).to have_attributes(
        role: "assistant",
        media_type: "image",
        media_url: media_url,
        content: "Olha a foto",
        caption: "Olha a foto",
        media_properties: { "fileName" => "foto.jpg" }
      )
    end

    it "com uma pessoa, assina com o nome dela" do
      expect(send_media(account: account)).to have_attributes(sender_name: "Alice Prado", account_id: account.id, message_origin: "frontend")
    end

    it "sem pessoa, assina com o nome informado" do
      expect(send_media(sender_name: "Campanha")).to have_attributes(sender_name: "Campanha", account_id: nil, message_origin: "platform")
    end

    it "sem nome, assina com a organização" do
      expect(send_media.sender_name).to eq("Clínica Vida")
    end

    it "guarda os atributos extras" do
      expect(send_media(attributes: { campaign_id: "camp-1" }).campaign_id).to eq("camp-1")
    end

    it "guarda o anexo escolhido" do
      dto = MediaMessageDto.new("image", "foto.jpg", nil, "anexo-1", nil, media_url: media_url)

      expect(described_class.call(chat: chat, media: dto).attachment_id).to eq("anexo-1")
    end

    it "sem legenda, content fica vazio" do
      dto = MediaMessageDto.new("image", "foto.jpg", nil, nil, nil, media_url: media_url)

      expect(described_class.call(chat: chat, media: dto)).to have_attributes(content: "", caption: nil)
    end

    it "aparece na lista e atualiza a prévia" do
      message = send_media

      expect(ChatMessage::Base.unscoped.list_for_chat.where(chat_id: chat.id).to_a).to eq([ message ])
      expect(chat.reload).to have_attributes(last_message_type: "media", last_message_by: "assistant", last_message_content: "Olha a foto")
    end
  end

  it "fica pending enquanto o canal não responde" do
    status_during_send = nil
    stub_request(:post, evolution_media_url).to_return do
      status_during_send = ChatMessage::Media.unscoped.where(chat_id: chat.id).take&.status
      json_reply({ key: { id: "EVO-1" } })
    end

    send_media

    expect(status_during_send).to eq("pending")
  end

  describe "envio pelo conector" do
    it "Evolution: guarda o key.id" do
      send = stub_request(:post, evolution_media_url)
             .with(body: hash_including("number" => "5531971810932", "mediatype" => "image", "media" => media_url, "caption" => "Olha a foto"))
             .to_return(json_reply({ key: { id: "EVO-1" } }))

      expect(send_media.reload).to have_attributes(message_id: "EVO-1", status: "delivery_ack")
      expect(send).to have_been_requested
    end

    context "com a Z-API" do
      let(:connector) { create(:connector_whatsapp_web, :zapi, organization: organization) }

      it "guarda o messageId" do
        stub_request(:post, "https://api.z-api.io/instances/INST123/token/TOKABC/send-image")
          .to_return(json_reply({ messageId: "ZAPI-1" }, status: 200))

        expect(send_media.reload).to have_attributes(message_id: "ZAPI-1", status: "delivery_ack")
      end
    end

    context "com a WABA" do
      let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
      let(:graph_url) { "https://graph.facebook.com/v19.0/#{connector.phone_number_id}/messages" }

      it "guarda o wamid que vem na resposta do SDK" do
        send = stub_request(:post, graph_url)
               .with(body: hash_including("type" => "image", "to" => 5531971810932, "image" => hash_including("link" => media_url)))
               .to_return(status: 200, body: { messages: [ { id: "wamid.M" } ] }.to_json)

        expect(send_media.reload).to have_attributes(message_id: "wamid.M", status: "delivery_ack")
        expect(send).to have_been_requested
      end

      it "manda pelo número de origem da conversa" do
        chat.set(sender_phone_number_id: 777)
        send = stub_request(:post, "https://graph.facebook.com/v19.0/777/messages")
               .to_return(status: 200, body: { messages: [ { id: "wamid.M" } ] }.to_json)

        send_media

        expect(send).to have_been_requested
      end

      # O SDK não levanta: a recusa vem dentro da resposta.
      it "recusa da Meta fica failed com a causa, e não entregue" do
        stub_request(:post, graph_url).to_return(status: 400, body: { error: { code: 131_053, message: "Falha no upload da mídia" } }.to_json)

        expect(send_media.reload).to have_attributes(message_id: nil, status: "failed", status_message: "Falha no upload da mídia")
      end
    end

    context "com o Instagram" do
      let(:connector) { create(:connector_instagram, organization: organization) }
      let(:chat) { create(:chat, connector: connector, external_id: "178400001") }

      it "guarda o message_id" do
        stub_request(:post, %r{graph\.instagram\.com/.*/messages})
          .to_return(json_reply({ message_id: "mid.IG" }, status: 200))

        expect(send_media.reload).to have_attributes(message_id: "mid.IG", status: "delivery_ack")
      end
    end
  end

  describe "áudio" do
    let(:media) { MediaMessageDto.new("audio", "recado.ogg", nil, nil, nil, media_url: "/rails/active_storage/blobs/proxy/abc/recado.ogg") }

    it "vai pelo envio de áudio, com a URL absoluta" do
      public_url = Media::Storage.public_url("/rails/active_storage/blobs/proxy/abc/recado.ogg")
      send = stub_request(:post, evolution_audio_url)
             .with(body: hash_including("audio" => public_url))
             .to_return(json_reply({ key: { id: "AUD-1" } }))

      expect(send_media.reload).to have_attributes(message_id: "AUD-1", status: "delivery_ack", media_type: "audio")
      expect(send).to have_been_requested
      expect(a_request(:post, evolution_media_url)).not_to have_been_made
    end

    it "guarda o caminho, sem host, e manda a URL absoluta ao provedor" do
      send = stub_request(:post, evolution_audio_url)
             .with(body: hash_including("audio" => Media::Storage.public_url("/rails/active_storage/blobs/proxy/abc/recado.ogg")))
             .to_return(json_reply({ key: { id: "AUD-1" } }))

      expect(send_media.media_url).to eq("/rails/active_storage/blobs/proxy/abc/recado.ogg")
      expect(send).to have_been_requested
    end
  end

  describe "quando o canal recusa" do
    it "fica failed com a causa, sem levantar" do
      stub_request(:post, evolution_media_url).to_return(status: 500, body: "fora do ar")

      message = nil
      expect { message = send_media }.not_to raise_error

      expect(message.reload).to have_attributes(status: "failed", status_message: a_string_including("fora do ar"), message_id: nil)
    end

    it "fica failed com a rede fora" do
      stub_request(:post, evolution_media_url).to_timeout

      expect(send_media.reload).to have_attributes(status: "failed", status_message: I18n.t("connectors.messages.channel_unreachable"))
    end

    it "transmite o status failed para a tela" do
      stub_request(:post, evolution_media_url).to_timeout
      chat

      expect { send_media }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat)).with(a_hash_including("status" => "failed"))
    end
  end

  describe "resposta sem id, mas sem recusa" do
    it "Evolution com corpo vazio e sem como recuperar o id: conta como entregue" do
      stub_request(:post, evolution_media_url).to_return(status: 201, body: "")
      stub_request(:post, "http://evolution.test/chat/findMessages/#{connector.instance_name}")
        .to_return(json_reply({ messages: { records: [] } }, status: 200))

      expect(send_media.reload).to have_attributes(message_id: nil, status: "delivery_ack")
    end
  end
end
