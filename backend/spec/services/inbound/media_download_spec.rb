require "rails_helper"

# Cada provedor entrega a mídia de um jeito. A regressão que motivou boa parte disto veio da
# origem: a CDN da Meta recusa o Bearer que o lookaside exige, e o SDK não segue redirect.
RSpec.describe Inbound::MediaDownload do
  before { stub_every_host_as_public }

  include InboundHelpers

  let(:organization) { create(:organization) }
  let(:created_paths) { [] }

  after { created_paths.each { |path| File.delete(path) if File.exist?(path) } }

  def downloaded(result)
    created_paths << result.path.to_s
    result
  end

  describe ".media" do
    context "WhatsApp Cloud" do
      let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }

      def download(properties = {})
        downloaded(described_class.media(connector, "MEDIA1", message_id: "wamid.1", properties: properties.with_indifferent_access, raw: {}))
      end

      it "baixa em dois saltos e devolve o tipo e o tamanho que a Meta informa" do
        stub_waba_media("MEDIA1", body: "%PDF-1.4", mime_type: "application/pdf", file_size: 84_233)

        result = download(mime_type: "application/pdf", fileName: "proposta.pdf")

        expect(File.binread(result.path)).to eq("%PDF-1.4")
        expect(result).to have_attributes(content_type: "application/pdf", file_size: 84_233)
      end

      it "manda o Bearer para os metadados e o lookaside, e nada para a CDN" do
        urls = stub_waba_media("MEDIA1")

        download

        expect(a_request(:get, urls[:metadata]).with(headers: { "Authorization" => "Bearer token-da-meta" })).to have_been_made.once
        expect(a_request(:get, urls[:lookaside]).with(headers: { "Authorization" => "Bearer token-da-meta" })).to have_been_made.once
        expect(a_request(:get, urls[:cdn]).with { |request| !request.headers.key?("Authorization") }).to have_been_made.once
      end

      it "aceita o token do usuário quando não há o da conta" do
        connector.set(access_token_ciphertext: nil)
        connector.user_access_token = "token-do-usuario"
        connector.save!
        stub_waba_media("MEDIA1", token: "token-do-usuario")

        expect(File.exist?(download.path)).to be(true)
      end

      it "sem redirect, o próprio lookaside entrega" do
        stub_request(:get, "https://graph.facebook.com/MEDIA1").to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { id: "MEDIA1", url: "https://lookaside.fbsbx.com/x", mime_type: "image/jpeg" }.to_json)
        stub_request(:get, "https://lookaside.fbsbx.com/x").to_return(status: 200, body: "bytes")

        result = download

        expect(File.binread(result.path)).to eq("bytes")
      end

      it "sem o tamanho nos metadados, mede o arquivo" do
        stub_request(:get, "https://graph.facebook.com/MEDIA1").to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { id: "MEDIA1", url: "https://lookaside.fbsbx.com/x", mime_type: "image/jpeg" }.to_json)
        stub_request(:get, "https://lookaside.fbsbx.com/x").to_return(status: 200, body: "12345")

        expect(download.file_size).to eq(5)
      end

      it "limpa o id da mídia antes de usar em caminho de arquivo" do
        stub_request(:get, %r{graph\.facebook\.com}).to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { id: "x", url: "https://lookaside.fbsbx.com/x", mime_type: "image/jpeg" }.to_json)
        stub_request(:get, "https://lookaside.fbsbx.com/x").to_return(status: 200, body: "bytes")

        result = downloaded(described_class.media(connector, "../../etc/passwd", message_id: "m", properties: {}.with_indifferent_access, raw: {}))

        expect(File.dirname(result.path)).to eq(Rails.root.join("tmp").to_s)
        expect(File.basename(result.path)).to start_with("wab-etcpasswd-")
      end

      it "nos metadados sem URL, levanta" do
        stub_request(:get, "https://graph.facebook.com/MEDIA1").to_return(status: 400, headers: InboundHelpers::JSON_HEADERS, body: { error: { message: "nope", code: 100 } }.to_json)

        expect { download }.to raise_error(/WABA media metadata missing URL/)
      end

      context "quando o binário não vem" do
        before do
          stub_request(:get, "https://graph.facebook.com/MEDIA1").to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { id: "MEDIA1", url: "https://lookaside.fbsbx.com/x", mime_type: "image/jpeg" }.to_json)
          allow(connector).to receive(:sleep)
        end

        it "tenta 3 vezes e levanta com o status" do
          stub = stub_request(:get, "https://lookaside.fbsbx.com/x").to_return(status: 403, body: "proibido")

          expect { download }.to raise_error(/WABA media download failed.*status=403/)
          expect(stub).to have_been_requested.times(3)
        end

        it "corpo vazio também conta como falha" do
          stub_request(:get, "https://lookaside.fbsbx.com/x").to_return(status: 200, body: "")

          expect { download }.to raise_error(/WABA media download failed/)
        end

        it "para de seguir redirect num laço" do
          stub_request(:get, "https://lookaside.fbsbx.com/x").to_return(status: 302, headers: { "Location" => "https://lookaside.fbsbx.com/x" })

          expect { download }.to raise_error(/exceeded redirect limit/)
        end
      end
    end

    context "Evolution" do
      let(:connector) { create(:connector_whatsapp_web, organization: organization) }

      def download(raw)
        downloaded(described_class.media(connector, "https://cdn/enc", message_id: "E1", properties: {}.with_indifferent_access, raw: raw.with_indifferent_access))
      end

      it "baixa pelo mediaUrl do bucket" do
        stub_request(:get, "https://bucket.exemplo.com/foto.jpg").to_return(status: 200, body: "jpeg")

        result = download(message: { mediaUrl: "https://bucket.exemplo.com/foto.jpg" })

        expect(File.binread(result.path)).to eq("jpeg")
        expect(result.path.to_s).to end_with(".jpg")
      end

      it "sem mediaUrl, pede o base64 à instância" do
        base64 = stub_request(:post, "http://evolution.test/chat/getBase64FromMediaMessage/#{connector.instance_name}")
          .with(body: { message: { key: { id: "E1" } }, convertToMp4: false }.to_json, headers: { "apikey" => "chave-evolution" })
          .to_return(status: 200, headers: InboundHelpers::JSON_HEADERS, body: { base64: Base64.strict_encode64("bytes-decodificados") }.to_json)

        result = download({})

        expect(base64).to have_been_requested
        expect(File.binread(result.path)).to eq("bytes-decodificados")
      end

      it "o bucket fora do ar levanta" do
        stub_request(:get, "https://bucket.exemplo.com/foto.jpg").to_return(status: 500)

        expect { download(message: { mediaUrl: "https://bucket.exemplo.com/foto.jpg" }) }.to raise_error(/Failed to fetch media/)
      end
    end

    context "provider Vekoo" do
      let(:connector) { create(:connector_whatsapp_web, :vekoo, organization: organization) }

      let(:raw) { { key: { id: "E1" }, message: { imageMessage: { url: "https://cdn/enc" } } }.with_indifferent_access }

      def download
        downloaded(described_class.media(connector, "https://cdn/enc", message_id: "E1", properties: {}.with_indifferent_access, raw: raw))
      end

      it "pede o binário à instância, com o trecho do webhook" do
        retrieve = stub_request(:post, "http://vekoo.test/chat/retrieverMediaMessage/#{connector.instance_name}")
          .with(body: raw.to_json, headers: { "apikey" => "chave-evolution" })
          .to_return(status: 200, body: "jpeg")

        result = download

        expect(retrieve).to have_been_requested
        expect(File.binread(result.path)).to eq("jpeg")
        expect(result.path.to_s).to end_with(".jpg")
      end

      it "levanta quando a instância recusa" do
        allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
        stub_request(:post, "http://vekoo.test/chat/retrieverMediaMessage/#{connector.instance_name}").to_return(status: 500, body: "fora")

        expect { download }.to raise_error(/código de resposta 500/)
      end
    end

    [ :connector_messenger, :connector_instagram ].each do |factory|
      context factory.to_s do
        let(:connector) { create(factory, organization: organization) }

        def download
          downloaded(described_class.media(connector, "https://lookaside.fbsbx.com/ig?asset=1", message_id: "m1", properties: {}.with_indifferent_access, raw: {}))
        end

        it "baixa pela URL do anexo" do
          stub_request(:get, "https://lookaside.fbsbx.com/ig?asset=1").to_return(status: 200, body: "bytes")

          expect(File.binread(download.path)).to eq("bytes")
        end

        it "download que falha devolve caminho nenhum" do
          stub_request(:get, "https://lookaside.fbsbx.com/ig?asset=1").to_return(status: 500)

          expect(download.path).to be_nil
        end

        # O caminho precisa valer até o job apagar o arquivo: um `Tempfile.new` que morre ao
        # sair do método leva o arquivo junto no primeiro GC do processo, de qualquer thread.
        it "o arquivo baixado sobrevive ao coletor de lixo" do
          stub_request(:get, "https://lookaside.fbsbx.com/ig?asset=1").to_return(status: 200, body: "bytes")

          path = download.path
          Array.new(200_000) { Object.new }
          GC.start

          expect(File.binread(path)).to eq("bytes")
        end

        context "sem conseguir baixar" do
          let(:created) { [] }

          before do
            allow(Tempfile).to receive(:create).and_wrap_original do |original, *args|
              original.call(*args).tap { |file| created << file.path }
            end
          end

          it "resposta de erro não deixa arquivo para trás" do
            stub_request(:get, "https://lookaside.fbsbx.com/ig?asset=1").to_return(status: 500, body: "fora")

            download

            expect(created.size).to eq(1)
            expect(File.exist?(created.first)).to be(false)
          end

          it "falha de rede não deixa arquivo para trás" do
            stub_request(:get, "https://lookaside.fbsbx.com/ig?asset=1").to_timeout

            expect(download.path).to be_nil

            expect(created.size).to eq(1)
            expect(File.exist?(created.first)).to be(false)
          end
        end
      end
    end
  end

  describe ".audio" do
    context "WhatsApp Cloud" do
      let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }

      def download
        downloaded(described_class.audio(connector, "AUDIO1", message_id: "wamid.1", raw: nil))
      end

      before { stub_waba_media("AUDIO1", body: "bytes-ogg", mime_type: "audio/ogg") }

      it "converte para mp3 e apaga o original" do
        with_fake_ffmpeg do
          result = download

          expect(result.path).to end_with(".ogg.mp3")
          expect(File.read(result.path)).to eq("convertido\n")
          expect(File.exist?(result.path.delete_suffix(".mp3"))).to be(false)
        end
      end

      it "se a conversão falha, fica o arquivo original" do
        with_fake_ffmpeg(success: false) do
          result = download

          expect(result.path).to end_with(".ogg")
          expect(File.binread(result.path)).to eq("bytes-ogg")
        end
      end

      it "sem ffmpeg na máquina, fica o arquivo original" do
        original_path = ENV["PATH"]

        begin
          ENV["PATH"] = Dir.mktmpdir("sem-ffmpeg")
          result = download

          expect(result.path).to end_with(".ogg")
        ensure
          ENV["PATH"] = original_path
        end
      end

      it "levanta quando não baixa" do
        stub_request(:get, "https://graph.facebook.com/AUDIO1").to_return(status: 400, headers: InboundHelpers::JSON_HEADERS, body: { error: { message: "nope", code: 100 } }.to_json)

        expect { download }.to raise_error(/metadata missing URL/)
      end
    end

    context "Evolution" do
      let(:connector) { create(:connector_whatsapp_web, organization: organization) }

      it "usa o mediaUrl do trecho do webhook" do
        stub_request(:get, "https://bucket.exemplo.com/a.ogg").to_return(status: 200, body: "ogg")

        result = downloaded(described_class.audio(connector, "https://cdn/enc", message_id: "E1", raw: { message: { mediaUrl: "https://bucket.exemplo.com/a.ogg" } }.with_indifferent_access))

        expect(File.binread(result.path)).to eq("ogg")
        expect(result.path.to_s).to end_with(".ogg")
      end

      it "sem o trecho, a URL recebida faz o papel dele" do
        stub_request(:get, "https://bucket.exemplo.com/a.ogg").to_return(status: 200, body: "ogg")

        result = downloaded(described_class.audio(connector, "https://bucket.exemplo.com/a.ogg", message_id: "E1", raw: nil))

        expect(File.binread(result.path)).to eq("ogg")
      end
    end

    context "LeadChat" do
      let(:connector) { create(:connector_lead_chat, organization: organization) }

      it "baixa pelo link público, como mp3" do
        stub_request(:get, "https://lc/a.mp3").to_return(status: 200, body: "mp3")

        result = downloaded(described_class.audio(connector, "https://lc/a.mp3", message_id: "L1", raw: nil))

        expect(File.binread(result.path)).to eq("mp3")
        expect(result.path.to_s).to end_with(".mp3")
      end

      it "levanta quando o link não responde" do
        stub_request(:get, "https://lc/a.mp3").to_return(status: 404, body: "não achei")

        expect { described_class.audio(connector, "https://lc/a.mp3", message_id: "L1", raw: nil) }.to raise_error(/HTTP 404/)
      end
    end

    context "Messenger" do
      let(:connector) { create(:connector_messenger, organization: organization) }

      it "baixa pela URL do anexo" do
        stub_request(:get, "https://cdn.fbsbx.com/a").to_return(status: 200, body: "bytes")

        result = downloaded(described_class.audio(connector, "https://cdn.fbsbx.com/a", message_id: "m1", raw: nil))

        expect(File.binread(result.path)).to eq("bytes")
      end
    end
  end

  describe ".cleanup" do
    it "apaga o arquivo" do
      file = Tempfile.create("media-download-spec")
      file.close

      described_class.cleanup(file.path)

      expect(File.exist?(file.path)).to be(false)
    end

    it "aceita Pathname" do
      file = Tempfile.create("media-download-spec")
      file.write("algo")
      file.close

      described_class.cleanup(Pathname.new(file.path))

      expect(File.exist?(file.path)).to be(false)
    end

    it "ignora nil e arquivo que já não existe" do
      expect { described_class.cleanup(nil) }.not_to raise_error
      expect { described_class.cleanup("/tmp/nao-existe-#{SecureRandom.hex}") }.not_to raise_error
    end

    it "erro ao apagar só vai para o log" do
      allow(File).to receive(:delete).and_raise(Errno::EACCES)
      allow(File).to receive(:exist?).and_return(true)
      allow(Rails.logger).to receive(:error)

      expect { described_class.cleanup("/qualquer") }.not_to raise_error
      expect(Rails.logger).to have_received(:error).with(a_string_including("Error deleting /qualquer"))
    end
  end

  describe ".audio_payload" do
    it "serve aos dois formatos de provedor" do
      expect(described_class.audio_payload("https://a")).to eq(message: { mediaUrl: "https://a" }, audio: { audioUrl: "https://a" })
    end
  end

  # A extensão é o que impede documento de virar `.jpg`: foi o bug de "sempre atribuindo o
  # arquivo como imagem" da origem.
  describe ".media_extension" do
    {
      { fileName: "Proposta Final.PDF", mime_type: "application/pdf" } => "pdf",
      { fileName: "planilha.xlsx" } => "xlsx",
      { fileName: "sem-extensao", mime_type: "application/pdf" } => "pdf",
      { mime_type: "application/pdf" } => "pdf",
      { mimetype: "application/pdf" } => "pdf",
      { mime_type: "image/jpeg" } => "jpg",
      { mime_type: "image/png" } => "jpg",
      { mimetype: "image" } => "jpg",
      { fileName: "foto.png", mime_type: "image/png" } => "png",
      { mime_type: "application/x-desconhecido" } => "x-desconhecido",
      { mimetype: "video" } => "video",
      {} => "bin"
    }.each do |properties, extension|
      it "#{properties} usa #{extension}" do
        expect(described_class.media_extension(properties.with_indifferent_access)).to eq(extension)
      end
    end
  end
  # O Whisper recusa `.bin`, e o arquivo guardado precisa do nome certo para abrir no navegador.
  describe ".with_real_extension" do
    let(:path) { Rails.root.join("tmp", "teste-#{SecureRandom.hex(4)}.bin").to_s }

    after { [ path, path.sub(".bin", ".ogg"), path.sub(".bin", ".oga") ].each { |file| File.delete(file) if File.exist?(file) } }

    it "troca .bin pela extensão do conteúdo" do
      File.binwrite(path, "OggS\x00\x02".b + ("\x00" * 64).b)

      renamed = described_class.with_real_extension(path)

      expect(File.extname(renamed)).to be_in(%w[.ogg .oga .opus])
      expect(File.exist?(renamed)).to be(true)
      File.delete(renamed)
    end

    it "mantém quando não reconhece o conteúdo" do
      File.binwrite(path, "conteúdo qualquer")

      expect(described_class.with_real_extension(path)).to eq(path)
    end

    it "não mexe em quem já tem extensão, nem em caminho vazio" do
      expect(described_class.with_real_extension("/tmp/audio.ogg")).to eq("/tmp/audio.ogg")
      expect(described_class.with_real_extension(nil)).to be_nil
    end
  end
end
