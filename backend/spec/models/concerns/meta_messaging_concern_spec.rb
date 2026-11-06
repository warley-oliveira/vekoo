require "rails_helper"

# O que Messenger e Instagram dividem: envio, token e chamadas à Graph API.
RSpec.describe MetaMessagingConcern do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:messenger) { create(:connector_messenger, organization: organization, page_id: "PAGINA", page_access_token: "tok-pagina") }
  let(:instagram) { create(:connector_instagram, organization: organization, instagram_account_id: "1784", instagram_user_access_token: "tok-ig") }
  let(:instagram_by_page) do
    create(:connector_instagram, organization: organization, auth_provider: "facebook_login", page_id: "PAGINA", page_access_token: "tok-pagina", instagram_user_access_token: nil)
  end
  let(:facebook_graph) { MetaApiClient::FACEBOOK_GRAPH_URL }
  let(:instagram_graph) { MetaApiClient::INSTAGRAM_GRAPH_URL }
  let(:messenger_messages) { "#{facebook_graph}/PAGINA/messages" }
  let(:instagram_messages) { "#{instagram_graph}/1784/messages" }

  describe "credenciais por tipo de login" do
    it "login pelo Instagram usa o token, a API e a conta do Instagram" do
      expect(instagram.retrieve_current_token).to eq("tok-ig")
      expect(instagram.api_base_url).to eq(instagram_graph)
      expect(instagram.messaging_endpoint_id).to eq("1784")
    end

    it "login pelo Facebook usa o token, a API e a página do Facebook" do
      expect(messenger.retrieve_current_token).to eq("tok-pagina")
      expect(messenger.api_base_url).to eq(facebook_graph)
      expect(messenger.messaging_endpoint_id).to eq("PAGINA")
    end

    it "Instagram ligado pela página fala pelo Facebook, com o id da página" do
      expect(instagram_by_page.retrieve_current_token).to eq("tok-pagina")
      expect(instagram_by_page.api_base_url).to eq(facebook_graph)
      expect(instagram_by_page.messaging_endpoint_id).to eq("PAGINA")
    end

    it "Messenger com login do Instagram cai no id da página: ele não tem conta do Instagram" do
      expect(described_class.instance_method(:messaging_endpoint_id).bind_call(Connector::FacebookMessenger.new(auth_provider: "instagram_login", page_id: "P"))).to eq("P")
    end
  end

  describe "tokens em repouso" do
    it "guarda só o texto cifrado no Mongo" do
      connector = create(:connector_instagram, organization: organization, instagram_user_access_token: "ig-secreto", page_access_token: "pagina-secreto")
      raw = stored_document(connector)

      expect(raw.to_json).not_to include("ig-secreto", "pagina-secreto")
      expect(raw.keys).to include("instagram_user_access_token_ciphertext", "page_access_token_ciphertext")
      expect(raw.keys).not_to include("instagram_user_access_token", "page_access_token")
    end

    it "devolve o valor original ao ler do banco" do
      connector = create(:connector_messenger, organization: organization, page_access_token: "pagina-secreto")

      expect(Connector::Base.find(connector.id).page_access_token).to eq("pagina-secreto")
    end
  end

  it "gera o token de verificação do webhook nos dois canais" do
    expect(messenger.verification_token).to match(/\A[a-z0-9]{32}\z/)
    expect(instagram.verification_token).to match(/\A[a-z0-9]{32}\z/)
  end

  describe "#send_text_message" do
    it "no Messenger, sai pela página com o Bearer dela e devolve o id" do
      request = stub_request(:post, messenger_messages)
        .with(
          headers: { "Authorization" => "Bearer tok-pagina" },
          body: { recipient: { id: "PSID" }, messaging_type: "RESPONSE", message: { text: "oi" } }.to_json
        )
        .to_return(json_reply({ recipient_id: "PSID", message_id: "mid.1" }))

      expect(messenger.send_text_message("PSID", "oi")).to eq("mid.1")
      expect(request).to have_been_requested
    end

    it "no Instagram, sai pela conta com o Bearer dela e devolve o id" do
      request = stub_request(:post, instagram_messages)
        .with(headers: { "Authorization" => "Bearer tok-ig" })
        .to_return(json_reply({ recipient_id: "IGSID", message_id: "mid.2" }))

      expect(instagram.send_text_message("IGSID", "oi")).to eq("mid.2")
      expect(request).to have_been_requested
    end

    it "devolve nil quando a Meta recusa, nunca a resposta crua" do
      stub_request(:post, messenger_messages).to_return(json_reply({ error: { message: "fora da janela" } }, status: 400))

      expect(messenger.send_text_message("PSID", "oi")).to be_nil
    end

    it "devolve nil quando a resposta não traz id" do
      stub_request(:post, messenger_messages).to_return(json_reply({}))

      expect(messenger.send_text_message("PSID", "oi")).to be_nil
    end

    it "devolve nil quando a resposta não é JSON" do
      stub_request(:post, messenger_messages).to_return(status: 200, body: "ok", headers: { "Content-Type" => "text/plain" })

      expect(messenger.send_text_message("PSID", "oi")).to be_nil
    end

    it "ignora a citação: a API de mensagens da Meta não tem como responder aqui" do
      stub_request(:post, messenger_messages).to_return(json_reply({ message_id: "mid.1" }))

      expect(messenger.send_text_message("PSID", "oi", nil, reply_to_external_id: "PAI")).to eq("mid.1")
    end
  end

  describe "#send_media_message" do
    def attachment(type, url = "https://cdn.exemplo.com/foto.jpg")
      { "recipient" => { "id" => "PSID" }, "messaging_type" => "RESPONSE", "message" => { "attachment" => { "type" => type, "payload" => { "url" => url, "is_reusable" => true } } } }
    end

    before { stub_request(:post, messenger_messages).to_return(json_reply({ message_id: "mid.M" })) }

    { "image" => "image", "video" => "video", "audio" => "audio", "document" => "file", "file" => "file", nil => "file" }.each do |media_type, sent_as|
      it "pelo DTO, #{media_type.inspect} vai como #{sent_as} e devolve o id" do
        expect(messenger.send_media_message("PSID", media_dto(media_type))).to eq("mid.M")

        expect(a_request(:post, messenger_messages).with(body: attachment(sent_as).to_json)).to have_been_made
      end
    end

    it "aceita o terceiro argumento dos outros conectores: a conversa" do
      chat = create(:chat, connector: messenger)

      expect(messenger.send_media_message("PSID", media_dto, chat)).to eq("mid.M")
    end

    it "aceita a forma direta, com tipo e URL" do
      expect(messenger.send_media_message("PSID", "video", "https://x/y.mp4")).to eq("mid.M")

      expect(a_request(:post, messenger_messages).with(body: attachment("video", "https://x/y.mp4").to_json)).to have_been_made
    end

    it "devolve nil quando a Meta recusa" do
      stub_request(:post, messenger_messages).to_return(json_reply({ error: { message: "x" } }, status: 400))

      expect(messenger.send_media_message("PSID", media_dto)).to be_nil
    end
  end

  describe "#send_audio_message_by_url" do
    it "manda como anexo de áudio e devolve o id" do
      stub_request(:post, messenger_messages).to_return(json_reply({ message_id: "mid.A" }))

      expect(messenger.send_audio_message_by_url("PSID", "https://x/a.ogg")).to eq("mid.A")

      expect(a_request(:post, messenger_messages).with(body: hash_including(
        "message" => { "attachment" => { "type" => "audio", "payload" => { "url" => "https://x/a.ogg", "is_reusable" => true } } }
      ))).to have_been_made
    end
  end

  describe "ações de remetente" do
    before { stub_request(:post, messenger_messages).to_return(json_reply({ success: true })) }

    it "#mark_read_message marca como vista" do
      messenger.mark_read_message("PSID", "mid.1")

      expect(a_request(:post, messenger_messages).with(body: { recipient: { id: "PSID" }, sender_action: "mark_seen" }.to_json)).to have_been_made
    end

    it "#mark_seen marca como vista" do
      messenger.mark_seen("PSID")

      expect(a_request(:post, messenger_messages).with(body: hash_including("sender_action" => "mark_seen"))).to have_been_made
    end

    it "#send_typing_indicator mostra digitando" do
      messenger.send_typing_indicator("PSID")

      expect(a_request(:post, messenger_messages).with(body: hash_including("sender_action" => "typing_on"))).to have_been_made
    end

    it "#send_presence só traduz composing" do
      messenger.send_presence("PSID", "composing")

      expect(a_request(:post, messenger_messages).with(body: hash_including("sender_action" => "typing_on"))).to have_been_made
    end

    it "#send_presence ignora os outros valores" do
      expect(messenger.send_presence("PSID", "paused")).to be_nil

      expect(a_request(:post, messenger_messages)).not_to have_been_made
    end
  end

  describe "#download_media" do
    it "baixa para um arquivo temporário" do
      stub_request(:get, "https://cdn.exemplo.com/foto.jpg").to_return(status: 200, body: "BYTES")

      path = messenger.download_media("https://cdn.exemplo.com/foto.jpg")

      expect(File.binread(path)).to eq("BYTES")
    ensure
      remove_file(path)
    end

    it "devolve nil em erro" do
      stub_request(:get, "https://cdn.exemplo.com/foto.jpg").to_return(status: 404, body: "")

      expect(messenger.download_media("https://cdn.exemplo.com/foto.jpg")).to be_nil
    end
  end

  describe "troca do código OAuth" do
    it "no Facebook usa as credenciais do app da Meta" do
      request = stub_request(:post, MetaApiClient::OAuth::FACEBOOK_OAUTH_URL)
        .with(body: hash_including("client_id" => "META-APP", "client_secret" => "META-SEGREDO", "code" => "COD"))
        .to_return(json_reply({ access_token: "tok" }))

      result = with_env("META_APP_ID" => "META-APP", "META_APP_SECRET" => "META-SEGREDO") { messenger.exchange_facebook_oauth_code(code: "COD") }

      expect(result).to eq(success: true, access_token: "tok")
      expect(request).to have_been_requested
    end

    it "no Instagram usa as credenciais do app do Instagram" do
      request = stub_request(:post, MetaApiClient::OAuth::INSTAGRAM_OAUTH_URL)
        .with(body: hash_including("client_id" => "IG-APP", "client_secret" => "IG-SEGREDO", "code" => "COD", "redirect_uri" => "https://r"))
        .to_return(json_reply({ error_message: "ruim" }, status: 400))

      result = with_env("INSTAGRAM_APP_ID" => "IG-APP", "INSTAGRAM_APP_SECRET" => "IG-SEGREDO") { instagram.exchange_instagram_oauth_code(code: "COD", redirect_uri: "https://r") }

      expect(result).to eq(success: false, error: "ruim")
      expect(request).to have_been_requested
    end
  end

  describe "#refresh_instagram_token!" do
    let(:refresh_url) { "#{instagram_graph}/refresh_access_token" }

    it "grava o token novo, a validade e limpa o erro" do
      instagram.update!(error_message: "token vencendo")
      stub_request(:get, refresh_url)
        .with(query: { grant_type: "ig_refresh_token", access_token: "tok-ig" })
        .to_return(json_reply({ access_token: "tok-novo", expires_in: 5_184_000 }))

      expect(instagram.refresh_instagram_token!).to be(true)

      instagram.reload
      expect(instagram).to have_attributes(instagram_user_access_token: "tok-novo", error_message: nil)
      expect(instagram.instagram_token_expires_at).to be_within(1.minute).of(5_184_000.seconds.from_now)
    end

    it "cifra o token novo" do
      stub_request(:get, refresh_url).with(query: hash_including({})).to_return(json_reply({ access_token: "tok-novo", expires_in: 100 }))

      instagram.refresh_instagram_token!

      expect(stored_document(instagram).to_json).not_to include("tok-novo")
    end

    it "o próximo envio já sai com o token novo" do
      stub_request(:post, instagram_messages).to_return(json_reply({ message_id: "mid.1" }))
      stub_request(:get, refresh_url).with(query: hash_including({})).to_return(json_reply({ access_token: "tok-novo", expires_in: 100 }))

      instagram.send_text_message("IGSID", "antes")
      instagram.refresh_instagram_token!
      instagram.send_text_message("IGSID", "depois")

      expect(a_request(:post, instagram_messages).with(headers: { "Authorization" => "Bearer tok-novo" })).to have_been_made.once
    end

    it "devolve false e mantém o token quando a Meta recusa" do
      stub_request(:get, refresh_url).with(query: hash_including({})).to_return(json_reply({ error: { message: "expirado" } }, status: 400))

      expect(instagram.refresh_instagram_token!).to be(false)
      expect(instagram.reload.instagram_user_access_token).to eq("tok-ig")
    end

    it "devolve false em falha de rede, sem levantar" do
      stub_request(:get, refresh_url).with(query: hash_including({})).to_timeout

      expect(instagram.refresh_instagram_token!).to be(false)
    end

    it "não se aplica ao login pelo Facebook" do
      expect(instagram_by_page.refresh_instagram_token!).to be(false)
      expect(messenger.refresh_instagram_token!).to be(false)
    end

    it "não se aplica sem token" do
      instagram.instagram_user_access_token = nil

      expect(instagram.refresh_instagram_token!).to be(false)
      expect(a_request(:get, refresh_url).with(query: hash_including({}))).not_to have_been_made
    end

    it "não escreve os tokens no log" do
      stub_request(:get, refresh_url).with(query: hash_including({})).to_return(json_reply({ access_token: "tok-novo", expires_in: 100 }))

      log = captured_log { instagram.refresh_instagram_token! }

      expect(log).to include("Token refreshed")
      expect(log).not_to include("tok-ig", "tok-novo")
    end
  end

  describe "#instagram_token_expiring_soon?" do
    it "é verdadeiro sem data de validade" do
      expect(instagram.instagram_token_expiring_soon?).to be(true)
    end

    it "é verdadeiro a menos de 7 dias do fim" do
      instagram.instagram_token_expires_at = 6.days.from_now

      expect(instagram.instagram_token_expiring_soon?).to be(true)
    end

    it "é falso com mais tempo" do
      instagram.instagram_token_expires_at = 8.days.from_now

      expect(instagram.instagram_token_expiring_soon?).to be(false)
    end

    it "aceita outra margem" do
      instagram.instagram_token_expires_at = 8.days.from_now

      expect(instagram.instagram_token_expiring_soon?(days: 10)).to be(true)
    end
  end

  describe "leituras na Graph API" do
    it "#fetch_page_info pega a primeira página" do
      stub_request(:get, "#{facebook_graph}/me/accounts").with(query: { access_token: "tok" }).to_return(json_reply({ data: [ { id: "P1" } ] }))

      expect(messenger.fetch_page_info("tok")).to eq("id" => "P1")
    end

    it "#fetch_instagram_account_for_page acha a conta ligada" do
      stub_request(:get, "#{facebook_graph}/P1").with(query: hash_including("access_token" => "tok")).to_return(json_reply({ instagram_business_account: { id: "1784" } }))

      expect(messenger.fetch_instagram_account_for_page("P1", "tok")).to eq("1784")
    end

    it "#fetch_instagram_profile usa a API do tipo de login" do
      stub_request(:get, "#{instagram_graph}/1784").with(query: hash_including("access_token" => "tok")).to_return(json_reply({ username: "ana" }))
      stub_request(:get, "#{facebook_graph}/1784").with(query: hash_including("access_token" => "tok")).to_return(json_reply({ username: "ana-fb" }))

      expect(instagram.fetch_instagram_profile("1784", "tok")).to eq("username" => "ana")
      expect(instagram_by_page.fetch_instagram_profile("1784", "tok")).to eq("username" => "ana-fb")
    end

    it "#fetch_instagram_me lê o /me" do
      stub_request(:get, "#{instagram_graph}/me").with(query: hash_including("access_token" => "tok")).to_return(json_reply({ user_id: "1784" }))

      expect(instagram.fetch_instagram_me("tok")).to eq("user_id" => "1784")
    end

    describe "#fetch_instagram_sender_profile" do
      let(:url) { "#{instagram_graph}/IGSID" }

      it "lê nome, usuário e foto de quem mandou a mensagem" do
        stub_request(:get, url).with(query: { fields: "name,username,profile_pic", access_token: "tok-ig" }).to_return(json_reply({ name: "Maria", username: "maria" }))

        expect(instagram.fetch_instagram_sender_profile("IGSID")).to eq("name" => "Maria", "username" => "maria")
      end

      it "devolve nil em erro" do
        stub_request(:get, url).with(query: hash_including({})).to_return(json_reply({ error: { message: "x" } }, status: 400))

        expect(instagram.fetch_instagram_sender_profile("IGSID")).to be_nil
      end

      it "devolve nil sem token, sem chamar a Meta" do
        instagram.instagram_user_access_token = nil

        expect(instagram.fetch_instagram_sender_profile("IGSID")).to be_nil
        expect(a_request(:get, url).with(query: hash_including({}))).not_to have_been_made
      end
    end

    it "#subscribe_page_webhooks! assina a página" do
      stub_request(:post, "#{facebook_graph}/P1/subscribed_apps").with(query: hash_including("access_token" => "tok")).to_return(json_reply({ success: true }))

      expect(messenger.subscribe_page_webhooks!("P1", "tok")).to eq(success: true)
    end
  end

  describe "#display_name" do
    it "é o nome da instância" do
      expect(messenger.display_name).to eq("Loja da Ana")
      expect(instagram.display_name).to eq("@lojadaana")
    end
  end
end
