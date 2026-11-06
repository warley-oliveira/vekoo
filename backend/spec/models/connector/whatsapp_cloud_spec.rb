require "rails_helper"

# WhatsApp Cloud sem dublê do SDK: `whatsapp_sdk` fala com graph.facebook.com de verdade, e o
# WebMock responde. Templates estão em whatsapp_cloud_templates_spec.rb.
RSpec.describe Connector::WhatsappCloud do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:connector) do
    create(:connector_whatsapp_cloud, organization: organization, access_token: "token-da-meta", phone_number_id: 1_234_567_890, waba_id: 555_666_777)
  end
  let(:graph) { "https://graph.facebook.com/v19.0" }
  let(:messages_url) { "#{graph}/1234567890/messages" }

  def sent(id = "wamid.OUT-1")
    json_reply({ messaging_product: "whatsapp", contacts: [ { input: "5511999999999", wa_id: "5511999999999" } ], messages: [ { id: id } ] })
  end

  it "gera o token de verificação do webhook ao nascer" do
    expect(connector.verification_token).to match(/\A[a-z0-9]{32}\z/)
  end

  describe "#instance_name" do
    it "prefere o nome verificado, depois o telefone, depois o id" do
      expect(described_class.new(verified_name: "Clínica", display_phone_number: "+55 31").instance_name).to eq("Clínica")
      expect(described_class.new(display_phone_number: "+55 31").instance_name).to eq("+55 31")

      bare = described_class.new
      expect(bare.instance_name).to eq(bare.id.to_s)
    end
  end

  describe "#send_text_message" do
    it "devolve o wamid, não a resposta crua do SDK" do
      stub_request(:post, messages_url).to_return(sent)

      expect(connector.send_text_message("5511999999999", "oi")).to eq("wamid.OUT-1")
    end

    it "fala com a Meta pelo Bearer do conector" do
      request = stub_request(:post, messages_url)
        .with(headers: { "Authorization" => "Bearer token-da-meta" })
        .to_return(sent)

      connector.send_text_message("5511999999999", "oi")

      expect(request).to have_been_requested
    end

    it "manda o destino como número e o texto no corpo" do
      stub_request(:post, messages_url).to_return(sent)

      connector.send_text_message("5511999999999", "oi")

      expect(a_request(:post, messages_url).with(body: hash_including(
        "messaging_product" => "whatsapp", "to" => 5_511_999_999_999, "type" => "text", "text" => { "body" => "oi" }
      ))).to have_been_made
    end

    it "não manda contexto sem citação" do
      request = stub_request(:post, messages_url).with { |req| !JSON.parse(req.body).key?("context") }.to_return(sent)

      connector.send_text_message("5511999999999", "oi")

      expect(request).to have_been_requested
    end

    it "cita a mensagem em context.message_id" do
      stub_request(:post, messages_url).to_return(sent)

      connector.send_text_message("5511999999999", "respondendo", nil, reply_to_external_id: "wamid.PAI")

      expect(a_request(:post, messages_url).with(body: hash_including("context" => { "message_id" => "wamid.PAI" }))).to have_been_made
    end

    it "trata citação em branco como nenhuma" do
      request = stub_request(:post, messages_url).with { |req| !JSON.parse(req.body).key?("context") }.to_return(sent)

      connector.send_text_message("5511999999999", "oi", nil, reply_to_external_id: "")

      expect(request).to have_been_requested
    end

    it "sai pelo número de origem da conversa quando ela tem um" do
      chat = create(:chat, connector: connector, sender_phone_number_id: 999)
      request = stub_request(:post, "#{graph}/999/messages").to_return(sent)

      connector.send_text_message("5511999999999", "oi", chat)

      expect(request).to have_been_requested
    end

    it "devolve nil quando a resposta não traz mensagem" do
      stub_request(:post, messages_url).to_return(json_reply({}))

      expect(connector.send_text_message("5511999999999", "oi")).to be_nil
    end

    it "devolve nil quando a Meta responde erro" do
      stub_request(:post, messages_url).to_return(json_reply({ error: { code: 131_047, message: "fora da janela" } }, status: 400))

      expect(connector.send_text_message("5511999999999", "oi")).to be_nil
    end
  end

  describe "#send_media_message" do
    {
      "image" => [ "image", { "link" => "https://cdn.exemplo.com/foto.jpg", "caption" => "" } ],
      "video" => [ "video", { "link" => "https://cdn.exemplo.com/foto.jpg", "caption" => "" } ],
      "document" => [ "document", { "link" => "https://cdn.exemplo.com/foto.jpg", "caption" => "" } ],
      "sticker" => [ "document", { "link" => "https://cdn.exemplo.com/foto.jpg", "caption" => "" } ]
    }.each do |media_type, (sent_as, payload)|
      it "#{media_type} sai como #{sent_as}" do
        stub_request(:post, messages_url).to_return(sent("wamid.M"))

        response = connector.send_media_message("5511999999999", media_dto(media_type))

        expect(a_request(:post, messages_url).with(body: hash_including("type" => sent_as, sent_as => payload))).to have_been_made
        expect(Connectors::ExternalId.from(response)).to eq("wamid.M")
      end
    end

    it "sai pelo número de origem da conversa" do
      chat = create(:chat, connector: connector, sender_phone_number_id: 999)
      request = stub_request(:post, "#{graph}/999/messages").to_return(sent)

      connector.send_media_message("5511999999999", media_dto, chat)

      expect(request).to have_been_requested
    end
  end

  describe "áudio" do
    around { |example| with_env("BACKEND_URL" => "https://api.vekoo.test") { example.run } }

    it "#send_audio_message_by_url devolve o wamid e torna absoluto o caminho guardado" do
      stub_request(:post, messages_url).to_return(sent("wamid.A"))

      expect(connector.send_audio_message_by_url("5511999999999", "/rails/active_storage/blobs/proxy/abc/audio.ogg")).to eq("wamid.A")

      expect(a_request(:post, messages_url).with(body: hash_including(
        "type" => "audio", "audio" => { "link" => "https://api.vekoo.test/rails/active_storage/blobs/proxy/abc/audio.ogg" }
      ))).to have_been_made
    end

    it "#send_audio_message manda a URL do DTO, pelo número de origem da conversa" do
      chat = create(:chat, connector: connector, sender_phone_number_id: 999)
      request = stub_request(:post, "#{graph}/999/messages").to_return(sent("wamid.A"))

      expect(connector.send_audio_message("5511999999999", media_dto("audio", "a.ogg", url: "https://x/a.ogg"), chat)).to eq("wamid.A")
      expect(request).to have_been_requested
    end
  end

  describe "#mark_read_message" do
    it "marca como lida" do
      request = stub_request(:post, messages_url)
        .with(body: hash_including("status" => "read", "message_id" => "wamid.1"))
        .to_return(json_reply({ success: true }))

      connector.mark_read_message("5511999999999", "wamid.1")

      expect(request).to have_been_requested
    end
  end

  describe "o que a Cloud API não tem" do
    it "presença não faz nada" do
      expect(connector.send_presence("5511999999999", "composing")).to be_nil
    end

    it "webhook, reload e logout não existem aqui" do
      expect { connector.setup_webhook! }.to raise_error("Not implemented")
      expect { connector.reload_instance }.to raise_error("Not implemented")
      expect { connector.logout_instance }.to raise_error("Not implemented")
    end
  end

  # O download nativo do SDK usa Net::HTTP cru, que não segue redirect e não grava nada em
  # resposta != 200, sem erro. A falha só aparecia depois, como "arquivo não encontrado".
  describe "#download_media_object" do
    let(:media_id) { "spec-#{SecureRandom.hex(4)}" }
    let(:metadata_url) { "https://graph.facebook.com/#{media_id}" }
    let(:lookaside_url) { "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123" }
    let(:cdn_url) { "https://scontent.xx.fbcdn.net/v/t1/123.pdf?_nc_sig=abc" }

    def stub_metadata(url: lookaside_url, mime_type: "application/pdf", file_size: 84_233)
      stub_request(:get, metadata_url)
        .with(headers: { "Authorization" => "Bearer token-da-meta" })
        .to_return(json_reply({ id: media_id, messaging_product: "whatsapp", url: url, mime_type: mime_type, sha256: "abc", file_size: file_size }))
    end

    def leftovers
      Dir.glob(Rails.root.join("tmp", "wab-#{media_id}*"))
    end

    after { leftovers.each { |path| remove_file(path) } }

    context "com download direto" do
      before do
        stub_metadata
        stub_request(:get, lookaside_url).to_return(status: 200, body: "%PDF-1.4 bytes", headers: { "Content-Type" => "application/pdf" })
      end

      it "autentica o pedido ao lookaside com o token do conector" do
        connector.download_media_object(media_id: media_id, format: "pdf")

        expect(a_request(:get, lookaside_url).with(headers: { "Authorization" => "Bearer token-da-meta" })).to have_been_made
      end

      it "grava o arquivo e devolve caminho, tamanho e tipo" do
        result = connector.download_media_object(media_id: media_id, format: "pdf")

        expect(File.binread(result.file_path)).to eq("%PDF-1.4 bytes")
        expect(result.file_path).to match(%r{/tmp/wab-#{media_id}-\h{8}\.pdf\z})
        expect(result.mime_type).to eq("application/pdf")
        expect(result.file_size).to eq(84_233)
      end

      # Regressão da origem: em produção OpenStruct#file_path devolveu nil, mesmo com o valor
      # visível no inspect, e o controlador quebrava com TypeError em File.exist?.
      it "devolve um Struct, cujos acessores nunca voltam nil em silêncio" do
        result = connector.download_media_object(media_id: media_id, format: "pdf")

        expect(result).to be_a(described_class::MediaDownloadResult)
        expect(result).not_to be_a(OpenStruct)
        expect(result.file_path).not_to be_nil
      end

      it "mede o arquivo quando a Meta não informa o tamanho" do
        stub_metadata(file_size: nil)

        expect(connector.download_media_object(media_id: media_id, format: "pdf").file_size).to eq("%PDF-1.4 bytes".bytesize)
      end

      it "#download_media devolve só o caminho" do
        path = connector.download_media(media_id: media_id, format: "pdf")

        expect(File.binread(path)).to eq("%PDF-1.4 bytes")
      end

      it "#retriever_media_message grava imagem como jpg e o resto como bin" do
        expect(connector.retriever_media_message(media_id, :image)).to end_with(".jpg")
        expect(connector.retriever_media_message(media_id, :document)).to end_with(".bin")
      end

      it "#retriever_image_message grava como jpg" do
        expect(connector.retriever_image_message(media_id)).to end_with(".jpg")
      end
    end

    context "quando o lookaside redireciona para a CDN assinada" do
      before do
        stub_metadata
        stub_request(:get, lookaside_url).to_return(status: 302, headers: { "Location" => cdn_url })
        stub_request(:get, cdn_url).to_return(status: 200, body: "%PDF-1.4 bytes")
      end

      it "manda o Bearer ao lookaside e nunca à CDN" do
        result = connector.download_media_object(media_id: media_id, format: "pdf")

        expect(a_request(:get, lookaside_url).with(headers: { "Authorization" => "Bearer token-da-meta" })).to have_been_made
        expect(a_request(:get, cdn_url).with { |req| !req.headers.key?("Authorization") }).to have_been_made
        expect(File.binread(result.file_path)).to eq("%PDF-1.4 bytes")
      end
    end

    context "com a Meta em redirect sem fim" do
      before do
        stub_metadata
        stub_request(:get, lookaside_url).to_return(status: 302, headers: { "Location" => lookaside_url })
      end

      it "desiste no limite, sem deixar arquivo" do
        expect { connector.download_media_object(media_id: media_id, format: "pdf") }.to raise_error(/exceeded redirect limit/)
        expect(leftovers).to be_empty
      end
    end

    context "com download que falha" do
      before do
        stub_metadata
        allow(connector).to receive(:sleep)
        stub_request(:get, lookaside_url).to_return(status: 404, body: "Not Found")
      end

      it "levanta com o status real, depois de 3 tentativas, sem deixar arquivo fantasma" do
        expect { connector.download_media_object(media_id: media_id, format: "pdf") }.to raise_error(/WABA media download failed.*status=404/m)

        expect(a_request(:get, lookaside_url)).to have_been_made.times(3)
        expect(leftovers).to be_empty
      end

      it "se recupera numa tentativa seguinte" do
        stub_request(:get, lookaside_url).to_return({ status: 500, body: "" }, { status: 200, body: "BYTES" })

        result = connector.download_media_object(media_id: media_id, format: "pdf")

        expect(File.binread(result.file_path)).to eq("BYTES")
      end

      it "não aceita 200 sem nada dentro" do
        stub_request(:get, lookaside_url).to_return(status: 200, body: "")

        expect { connector.download_media_object(media_id: media_id, format: "pdf") }.to raise_error(/WABA media download failed.*bytes=0/m)
      end

      it "traduz o timeout, com o id da mídia na mensagem" do
        stub_request(:get, lookaside_url).to_timeout

        expect { connector.download_media_object(media_id: media_id, format: "pdf") }.to raise_error(/WABA media download error \(media_id=#{media_id}\)/)
      end
    end

    context "quando os metadados não trazem URL (token ou permissão)" do
      before do
        stub_request(:get, metadata_url).to_return(json_reply({ error: { code: 190, message: "token expirado" } }, status: 401))
      end

      it "levanta antes de tentar baixar" do
        expect { connector.download_media_object(media_id: media_id, format: "pdf") }.to raise_error(/WABA media metadata missing URL/)
        expect(a_request(:get, lookaside_url)).not_to have_been_made
      end
    end

    context "com id de mídia vindo do webhook" do
      let(:media_id) { "../../etc/passwd" }
      let(:metadata_url) { %r{graph\.facebook\.com} }

      before do
        stub_metadata
        stub_request(:get, lookaside_url).to_return(status: 200, body: "BYTES")
      end

      it "nunca usa o id cru no caminho do arquivo" do
        result = connector.download_media_object(media_id: media_id, format: "pdf")

        expect(File.dirname(result.file_path)).to eq(Rails.root.join("tmp").to_s)
        expect(File.basename(result.file_path)).to match(/\Awab-etcpasswd-\h{8}\.pdf\z/)
      ensure
        remove_file(result&.file_path)
      end
    end
  end

  # O corpo pode chegar em parsed_response e não em body, conforme o salto do redirect.
  describe "#media_response_bytes" do
    def bytes_of(body:, parsed_response: nil)
      connector.send(:media_response_bytes, double("HTTParty::Response", body: body, parsed_response: parsed_response))
    end

    it "prefere o corpo" do
      expect(bytes_of(body: "BYTES", parsed_response: "OUTRO")).to eq("BYTES")
    end

    it "cai em parsed_response quando o corpo vem vazio" do
      expect(bytes_of(body: "", parsed_response: "%PDF-1.4 bytes")).to eq("%PDF-1.4 bytes")
    end

    it "nunca grava um corpo de erro em JSON como se fosse a mídia" do
      expect(bytes_of(body: "", parsed_response: { "error" => "x" })).to eq("")
    end
  end

  describe "#retrieve_audio_message" do
    let(:media_id) { "audio-#{SecureRandom.hex(4)}" }

    before do
      stub_request(:get, "https://graph.facebook.com/#{media_id}").to_return(json_reply({ id: media_id, url: "https://lookaside.fbsbx.com/a", mime_type: "audio/ogg" }))
      stub_request(:get, "https://lookaside.fbsbx.com/a").to_return(status: 200, body: "OGG")
    end

    after { Dir.glob(Rails.root.join("tmp", "wab-#{media_id}*")).each { |path| remove_file(path) } }

    it "converte para mp3 e apaga o ogg" do
      original = nil
      allow(connector).to receive(:system) do |*args|
        original = args[args.index("-i") + 1]
        File.write(args.last, "MP3")
        true
      end

      path = connector.retrieve_audio_message(media_id)

      expect(path).to end_with(".ogg.mp3")
      expect(File.read(path)).to eq("MP3")
      expect(File.exist?(original)).to be(false)
    end

    it "fica com o arquivo original quando o ffmpeg falha: melhor um formato ruim do que perder a mensagem" do
      allow(connector).to receive(:system).and_return(false)

      path = connector.retrieve_audio_message(media_id)

      expect(path).to end_with(".ogg")
      expect(File.read(path)).to eq("OGG")
    end

    it "fica com o original também sem ffmpeg na máquina" do
      allow(connector).to receive(:system).and_return(nil)

      expect(File.read(connector.retrieve_audio_message(media_id))).to eq("OGG")
    end
  end

  describe "#exchange_oauth_code_for_token" do
    let(:oauth_url) { described_class::FACEBOOK_OAUTH_URL }

    around { |example| with_env("META_APP_ID" => "APP", "META_APP_SECRET" => "SEGREDO") { example.run } }

    it "troca o código pelo token do usuário e guarda" do
      request = stub_request(:post, oauth_url)
        .with(body: { client_id: "APP", client_secret: "SEGREDO", code: "CODIGO", grant_type: "authorization_code" }.to_json)
        .to_return(json_reply({ access_token: "novo-token", token_type: "bearer" }))

      expect(connector.exchange_oauth_code_for_token(code: "CODIGO")).to eq(success: true, token_type: "bearer")

      expect(request).to have_been_requested
      expect(connector.reload.user_access_token).to eq("novo-token")
    end

    it "devolve o erro da Meta sem levantar" do
      stub_request(:post, oauth_url).to_return(json_reply({ error: { message: "código expirado" } }, status: 400))

      expect(connector.exchange_oauth_code_for_token(code: "CODIGO")).to eq(success: false, error: "código expirado")
      expect(connector.reload.user_access_token).to be_nil
    end

    it "levanta em falha de rede" do
      stub_request(:post, oauth_url).to_timeout

      expect { connector.exchange_oauth_code_for_token(code: "CODIGO") }.to raise_error(Net::OpenTimeout)
    end
  end

  describe "#retrieve_current_token" do
    it "prefere o token do sistema" do
      connector.user_access_token = "do-usuario"

      expect(connector.retrieve_current_token).to eq("token-da-meta")
    end

    it "cai no token do usuário" do
      connector.access_token = nil
      connector.user_access_token = "do-usuario"

      expect(connector.retrieve_current_token).to eq("do-usuario")
    end
  end

  describe "assinatura do app na WABA" do
    let(:url) { "https://graph.facebook.com/v24.0/555666777/subscribed_apps" }

    around { |example| with_env("META_APP_ID" => "APP") { example.run } }

    it "#subscribe_app! assina com o app do ambiente" do
      request = stub_request(:post, url).with(query: { access_token: "token-da-meta", app_id: "APP" }).to_return(json_reply({ success: true }))

      expect(connector.subscribe_app!).to eq(success: true, data: { "success" => true })
      expect(request).to have_been_requested
    end

    it "#subscribe_app! devolve o erro sem levantar" do
      stub_request(:post, url).with(query: hash_including({})).to_return(json_reply({ error: { message: "sem permissão" } }, status: 403))

      expect(connector.subscribe_app!).to eq(success: false, error: "sem permissão")
    end

    it "#subscribe_app! levanta em falha de rede" do
      stub_request(:post, url).with(query: hash_including({})).to_timeout

      expect { connector.subscribe_app! }.to raise_error(Net::OpenTimeout)
    end

    it "#subscribed_apps lista as assinaturas" do
      stub_request(:get, url).with(query: { access_token: "token-da-meta" }).to_return(json_reply({ data: [] }))

      expect(connector.subscribed_apps).to eq(success: true, data: { "data" => [] })
    end

    it "#subscribed_apps devolve o erro sem levantar" do
      stub_request(:get, url).with(query: hash_including({})).to_return(json_reply({ error: { message: "sem permissão" } }, status: 403))

      expect(connector.subscribed_apps).to eq(success: false, error: "sem permissão")
    end

    it "cai no business_id sem WABA" do
      fallback = create(:connector_whatsapp_cloud, organization: organization, waba_id: nil, business_id: 42)
      request = stub_request(:post, "https://graph.facebook.com/v24.0/42/subscribed_apps").with(query: hash_including({})).to_return(json_reply({}))

      fallback.subscribe_app!

      expect(request).to have_been_requested
    end
  end

  describe "números e perfil" do
    let(:phone_fields) { WhatsappSdk::Api::PhoneNumbers::DEFAULT_FIELDS }
    let(:numbers_url) { "#{graph}/555666777/phone_numbers?fields=#{phone_fields}" }
    let(:profile_url) { "#{graph}/1234567890/whatsapp_business_profile?fields=#{WhatsappSdk::Api::BusinessProfile::DEFAULT_FIELDS}" }

    def phone(status: "CONNECTED", id: "1234567890")
      {
        id: id, verified_name: "Clínica Vida", display_phone_number: "+55 31 3333-0000", quality_rating: "GREEN",
        is_pin_enabled: false, is_official_business_account: false, account_mode: "LIVE", code_verification_status: "VERIFIED",
        name_status: "APPROVED", status: status
      }
    end

    def business_profile
      { data: [ { about: "Sobre", address: "Rua A", description: "Clínica", email: "a@b.com", profile_picture_url: "https://x/p.jpg", websites: [ "https://b.com" ] } ] }
    end

    describe "#activate" do
      around { |example| with_env("META_APP_ID" => "APP", "META_APP_SECRET" => "SEGREDO") { example.run } }

      let(:connector) do
        create(:connector_whatsapp_cloud, organization: organization, access_token: "token-da-meta", phone_number_id: 1_234_567_890,
                                          waba_id: 555_666_777, status: :inactive, verified_name: nil, display_phone_number: nil)
      end
      let(:number_url) { "#{graph}/1234567890?fields=#{phone_fields}" }
      let(:subscribe_url) { "https://graph.facebook.com/v24.0/555666777/subscribed_apps" }

      def stub_everything
        stub_request(:get, number_url).to_return(json_reply(phone))
        stub_request(:get, numbers_url).to_return(json_reply({ data: [ phone ] }))
        stub_request(:post, subscribe_url).with(query: hash_including({})).to_return(json_reply({ success: true }))
        stub_request(:get, profile_url).to_return(json_reply(business_profile))
      end

      it "lê o número na Meta, assina o app e fica ativo" do
        stub_everything

        connector.activate

        expect(connector.reload).to have_attributes(
          status_cd: "active", display_phone_number: "+55 31 3333-0000", verified_name: "Clínica Vida", fb_status: "CONNECTED", quality_rating: "GREEN"
        )
        expect(a_request(:post, subscribe_url).with(query: hash_including("app_id" => "APP"))).to have_been_made
      end

      it "guarda a lista de números e o perfil de cada um" do
        stub_everything

        connector.activate

        expect(connector.reload.phone_number_list.first).to include("id" => "1234567890", "verified_name" => "Clínica Vida", "status" => "CONNECTED")
        expect(connector.reload.phone_number_details["1234567890"]).to include("about" => "Sobre", "email" => "a@b.com", "websites" => [ "https://b.com" ])
      end

      it "troca o código OAuth antes, quando ele vem" do
        stub_everything
        oauth = stub_request(:post, described_class::FACEBOOK_OAUTH_URL).to_return(json_reply({ access_token: "novo", token_type: "bearer" }))

        connector.activate("CODIGO")

        expect(oauth).to have_been_requested
        expect(connector.reload.user_access_token).to eq("novo")
      end

      it "fica failed com a mensagem da Meta quando o número não abre" do
        stub_request(:get, number_url).to_return(json_reply({ error: { code: 100, message: "número inválido" } }, status: 400))

        connector.activate

        expect(connector.reload).to have_attributes(status_cd: "failed", error_message: "número inválido")
      end

      it "não escreve o token no log quando falha" do
        stub_request(:get, number_url).to_return(json_reply({ error: { code: 190, message: "token ruim" } }, status: 401))

        log = captured_log { connector.activate }

        expect(log).to include("token ruim")
        expect(log).not_to include("token-da-meta")
      end

      it "segue ativo quando o perfil de um número falha" do
        stub_everything
        stub_request(:get, profile_url).to_return(json_reply({ error: { message: "x" } }, status: 400))

        connector.activate

        expect(connector.reload).to be_active
      end
    end

    describe "#fetch_registered_numbers" do
      it "registra número pendente e lê a lista de novo" do
        register = stub_request(:post, "#{graph}/1234567890/register").to_return(json_reply({ success: true }))
        stub_request(:get, numbers_url).to_return(
          json_reply({ data: [ phone(status: "PENDING") ] }),
          json_reply({ data: [ phone(status: "CONNECTED") ] })
        )

        expect(connector.fetch_registered_numbers.first[:status]).to eq("CONNECTED")
        expect(register).to have_been_requested
        expect(a_request(:get, numbers_url)).to have_been_made.twice
      end

      it "não registra quem já está conectado" do
        stub_request(:get, numbers_url).to_return(json_reply({ data: [ phone ] }))

        connector.fetch_registered_numbers

        expect(a_request(:post, /register/)).not_to have_been_made
        expect(a_request(:get, numbers_url)).to have_been_made.once
      end

      it "cai no business_id sem WABA" do
        fallback = create(:connector_whatsapp_cloud, organization: organization, waba_id: nil, business_id: 42)
        request = stub_request(:get, "#{graph}/42/phone_numbers?fields=#{phone_fields}").to_return(json_reply({ data: [] }))

        expect(fallback.fetch_registered_numbers).to eq([])
        expect(request).to have_been_requested
      end
    end

    describe "#fetch_registered_numbers!" do
      it "grava a lista e os perfis" do
        stub_request(:get, numbers_url).to_return(json_reply({ data: [ phone ] }))
        stub_request(:get, profile_url).to_return(json_reply(business_profile))

        connector.fetch_registered_numbers!

        expect(connector.reload.phone_number_list.size).to eq(1)
        expect(connector.reload.phone_number_details.keys).to eq([ "1234567890" ])
      end
    end

    describe "#refresh_details" do
      it "guarda o perfil com o id em texto: chave de hash no Mongo é sempre string" do
        stub_request(:get, profile_url).to_return(json_reply(business_profile))

        connector.refresh_details(1_234_567_890)
        connector.save!

        expect(connector.reload.phone_number_details).to have_key("1234567890")
      end
    end
  end

  # Upload resumível da Meta: é ele que devolve o header_handle exigido para criar template
  # com mídia no cabeçalho.
  describe "#upload_media_for_template" do
    let(:file_url) { "https://cdn.exemplo.com/banner.jpg" }
    let(:session_url) { "https://graph.facebook.com/v22.0/APP/uploads" }
    let(:upload_url) { "https://graph.facebook.com/v22.0/upload:SESSAO" }

    around { |example| with_env("META_APP_ID" => "APP") { example.run } }

    def stub_session
      stub_request(:post, session_url).with(query: hash_including({})).to_return(json_reply({ id: "upload:SESSAO" }))
    end

    before do
      stub_request(:get, file_url).to_return(status: 200, body: "BYTES", headers: { "Content-Type" => "image/jpeg" })
    end

    it "abre a sessão, sobe o arquivo e devolve o handle" do
      stub_session
      upload = stub_request(:post, upload_url)
        .with(headers: { "Authorization" => "OAuth token-da-meta", "file_offset" => "0" }, body: "BYTES")
        .to_return(json_reply({ h: "HANDLE-1" }))

      expect(connector.upload_media_for_template(file_url)).to eq("HANDLE-1")

      expect(upload).to have_been_requested
      expect(a_request(:post, session_url).with(query: hash_including("file_name" => "banner.jpg", "file_length" => "5", "file_type" => "image/jpeg"))).to have_been_made
    end

    it "deduz o tipo pela extensão quando a resposta não informa" do
      stub_request(:get, file_url).to_return(status: 200, body: "BYTES")
      stub_session
      stub_request(:post, upload_url).to_return(json_reply({ h: "HANDLE-1" }))

      connector.upload_media_for_template(file_url)

      expect(a_request(:post, session_url).with(query: hash_including("file_type" => "image/jpeg"))).to have_been_made
    end

    it "dá nome ao arquivo sem extensão" do
      stub_request(:get, "https://cdn.exemplo.com/abc").to_return(status: 200, body: "BYTES", headers: { "Content-Type" => "video/mp4" })
      stub_session
      stub_request(:post, upload_url).to_return(json_reply({ h: "HANDLE-1" }))

      connector.upload_media_for_template("https://cdn.exemplo.com/abc")

      expect(a_request(:post, session_url).with(query: hash_including("file_name" => a_string_matching(/\Amedia_\h{8}\.mp4\z/)))).to have_been_made
    end

    it "devolve nil quando o arquivo não baixa" do
      stub_request(:get, file_url).to_return(status: 404, body: "")

      expect(connector.upload_media_for_template(file_url)).to be_nil
      expect(a_request(:post, session_url).with(query: hash_including({}))).not_to have_been_made
    end

    it "devolve nil quando a sessão não abre" do
      stub_request(:post, session_url).with(query: hash_including({})).to_return(json_reply({ error: { message: "x" } }, status: 400))

      expect(connector.upload_media_for_template(file_url)).to be_nil
    end

    it "devolve nil quando o envio falha" do
      stub_session
      stub_request(:post, upload_url).to_return(json_reply({ error: { message: "x" } }, status: 400))

      expect(connector.upload_media_for_template(file_url)).to be_nil
    end

    it "devolve nil em falha de rede, sem levantar" do
      stub_request(:get, file_url).to_timeout

      expect(connector.upload_media_for_template(file_url)).to be_nil
    end

    it "não escreve o token no log em falha" do
      stub_session
      stub_request(:post, upload_url).to_return(json_reply({ error: { message: "x" } }, status: 400))

      log = captured_log { connector.upload_media_for_template(file_url) }

      expect(log).to include("Failed to upload file")
      expect(log).not_to include("token-da-meta")
    end
  end

  describe "tokens em repouso" do
    let(:connector) do
      create(:connector_whatsapp_cloud, organization: organization, access_token: "acesso-secreto", user_access_token: "usuario-secreto")
    end

    it "guarda só o texto cifrado no Mongo" do
      raw = stored_document(connector)

      expect(raw.to_json).not_to include("acesso-secreto", "usuario-secreto")
      expect(raw.keys).to include("access_token_ciphertext", "user_access_token_ciphertext")
      expect(raw.keys).not_to include("access_token", "user_access_token")
    end

    it "devolve o valor original ao ler do banco" do
      expect(Connector::Base.find(connector.id)).to have_attributes(access_token: "acesso-secreto", user_access_token: "usuario-secreto")
    end

    it "não devolve lixo com texto cifrado adulterado" do
      connector.set(access_token_ciphertext: "adulterado")

      expect(Connector::Base.find(connector.id).access_token).to be_nil
    end

    it "apaga o cifrado ao receber vazio" do
      connector.access_token = ""
      connector.save!

      expect(stored_document(connector)["access_token_ciphertext"]).to be_nil
    end
  end

  describe "tokens no log" do
    let(:connector) do
      create(:connector_whatsapp_cloud, organization: organization, access_token: "acesso-secreto", user_access_token: "usuario-secreto",
                                        phone_number_id: 1_234_567_890, waba_id: 555_666_777)
    end
    let(:media_id) { "log-#{SecureRandom.hex(4)}" }

    around { |example| with_env("META_APP_ID" => "APP", "META_APP_SECRET" => "SEGREDO-DO-APP") { example.run } }

    it "nada que passa pela Meta escreve token ou segredo" do
      stub_request(:post, messages_url).to_return(sent, json_reply({ error: { code: 1, message: "falhou" } }, status: 500))
      stub_request(:post, described_class::FACEBOOK_OAUTH_URL).to_return(json_reply({ access_token: "novo-secreto" }), json_reply({ error: { message: "ruim" } }, status: 400))
      stub_request(:get, "https://graph.facebook.com/v24.0/555666777/message_templates").with(query: hash_including({}))
        .to_return(json_reply({ data: [ { id: "1", name: "a", language: "pt_BR", status: "APPROVED" } ] }), json_reply({ error: { code: 190, message: "expirou" } }, status: 401))
      stub_request(:post, "https://graph.facebook.com/v24.0/555666777/subscribed_apps").with(query: hash_including({})).to_return(json_reply({ error: { message: "ruim" } }, status: 403))
      stub_request(:get, "https://graph.facebook.com/#{media_id}").to_return(json_reply({ id: media_id, url: "https://lookaside.fbsbx.com/m?mid=1", mime_type: "image/jpeg" }))
      stub_request(:get, "https://lookaside.fbsbx.com/m?mid=1").to_return(status: 302, headers: { "Location" => "https://scontent.fbcdn.net/m.jpg?sig=1" })
      stub_request(:get, "https://scontent.fbcdn.net/m.jpg?sig=1").to_return(status: 200, body: "BYTES")

      path = nil
      log = captured_log do
        2.times { connector.send_text_message("5511999999999", "oi") }
        2.times { connector.exchange_oauth_code_for_token(code: "CODIGO") }
        connector.sync_templates
        begin
          connector.sync_templates
        rescue RuntimeError => e
          expect(e.message).to include("expirou")
          expect(e.message).not_to include("acesso-secreto")
        end
        connector.subscribe_app!
        path = connector.download_media(media_id: media_id, format: "jpg")
      end

      expect(log).not_to include("acesso-secreto", "usuario-secreto", "novo-secreto", "SEGREDO-DO-APP")
    ensure
      remove_file(path)
    end
  end

  describe "aviso de erro de conta" do
    let(:service) { spy("OrganizationAlertService") }

    before { stub_const("OrganizationAlertService", service) }

    describe "#simulate_billing_error!" do
      it "grava a mensagem amigável e dispara o aviso da organização" do
        message = connector.simulate_billing_error!(133_010)

        expect(message).to include("Problema de cobrança")
        expect(connector.reload.error_message).to eq(message)
        expect(service).to have_received(:connector_error).with(
          organization, connector, code: "waba_billing_133010", message: message, metadata: hash_including(error_code: 133_010, simulated: true)
        )
      end

      it "ignora código que não é de conta nem de cobrança" do
        expect(connector.simulate_billing_error!(131_047)).to be_nil

        expect(connector.reload.error_message).to be_nil
        expect(service).not_to have_received(:connector_error)
      end

      it "vale sem o serviço de avisos instalado" do
        hide_const("OrganizationAlertService")

        expect(connector.simulate_billing_error!).to include("Problema de cobrança")
      end
    end

    describe "#clear_billing_error!" do
      it "limpa a mensagem e resolve os avisos" do
        connector.update!(error_message: "Problema de cobrança")

        connector.clear_billing_error!

        expect(connector.reload.error_message).to be_nil
        expect(service).to have_received(:connector_reconnected).with(organization, connector)
      end
    end
  end
end
