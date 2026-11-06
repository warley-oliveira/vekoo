require "rails_helper"

# Rota inteira, com blobs de verdade no armazenamento de teste e host externo por WebMock.
# Os detalhes de Media::AssetResolver e Media::ProxyDownloadService ficam em spec/services/media/.
RSpec.describe "MediaDownloads", type: :request do
  let(:account) { create(:account) }
  let(:headers) { auth_headers(account) }
  let(:external_key) { "ozd53ipr4djgjwggz1mfkq0dxsl0" }
  let(:external_url) { "https://cdn.exemplo.com/#{external_key}" }

  # Só este host externo é liberado. O próprio backend sempre é.
  around do |example|
    saved = ENV["MEDIA_PROXY_ALLOWED_HOSTS"]
    ENV["MEDIA_PROXY_ALLOWED_HOSTS"] = "cdn.exemplo.com, CDN2.exemplo.com"
    example.run
  ensure
    saved ? ENV["MEDIA_PROXY_ALLOWED_HOSTS"] = saved : ENV.delete("MEDIA_PROXY_ALLOWED_HOSTS")
  end

  def create_blob(content = "binary-bytes", filename: "contrato assinado.pdf", content_type: "application/pdf", **attributes)
    ActiveStorage::Blob.create_and_upload!(io: StringIO.new(content), filename: filename, content_type: content_type, **attributes)
  end

  def stub_external_head(url = external_url, status: 200, headers: {})
    stub_request(:head, url).to_return(status: status, headers: { "Content-Type" => "application/pdf" }.merge(headers))
  end

  def stub_external_get(url = external_url, body: "bytes-externos", status: 200)
    stub_request(:get, url).to_return(status: status, body: body)
  end

  describe "GET /media/download" do
    def download(**params)
      get "/media/download", params: params, headers: headers
    end

    it "responde 401 sem sessão" do
      get "/media/download", params: { key: create_blob.key }

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 422 sem URL nem chave" do
      download

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("mediaReferenceRequired")
    end

    describe "blob do Active Storage" do
      let(:blob) { create_blob }

      it "baixa pela chave" do
        download(key: blob.key)

        expect(response).to have_http_status(:ok)
        expect(response.body).to eq("binary-bytes")
      end

      it "manda como anexo, com o nome original e o tipo guardados" do
        download(key: blob.key)

        expect(response.headers["Content-Disposition"]).to include("attachment", "contrato")
        expect(response.headers["Content-Disposition"]).to include("filename*=UTF-8''contrato%20assinado.pdf")
        expect(response.headers["Content-Type"]).to include("application/pdf")
      end

      it "mantém acento no nome do arquivo" do
        blob = create_blob(filename: "relatório de março.pdf")

        download(key: blob.key)

        expect(response.headers["Content-Disposition"]).to include("filename*=UTF-8''relat%C3%B3rio%20de%20mar%C3%A7o.pdf")
      end

      # É este o formato que fica guardado nas mensagens (`Media::Storage.path_for`).
      it "baixa pelo caminho proxy guardado nas mensagens" do
        download(url: Media::Storage.path_for(blob))

        expect(response).to have_http_status(:ok)
        expect(response.body).to eq("binary-bytes")
        expect(response.headers["Content-Disposition"]).to include("attachment", "contrato")
      end

      it "baixa a mídia de uma mensagem recebida" do
        message = create(:chat_image_message, chat: create(:chat, :with_connector), image_url: Media::Storage.path_for(blob), media_blob_id: blob.id)

        download(url: message.image_url)

        expect(response).to have_http_status(:ok)
        expect(response.body).to eq("binary-bytes")
      end

      it "baixa pela URL absoluta da rota proxy" do
        download(url: Media::Storage.public_url(Media::Storage.path_for(blob)))

        expect(response).to have_http_status(:ok)
        expect(response.body).to eq("binary-bytes")
      end

      it "baixa pela rota de redirect do Active Storage" do
        path = Rails.application.routes.url_helpers.rails_blob_path(blob, only_path: true)

        download(url: path)

        expect(response).to have_http_status(:ok)
        expect(response.body).to eq("binary-bytes")
      end

      it "prefere a URL quando vêm as duas" do
        other = create_blob("outros-bytes", filename: "outro.pdf")

        download(url: Media::Storage.path_for(blob), key: other.key)

        expect(response.body).to eq("binary-bytes")
      end

      it "responde 404 quando o arquivo sumiu do armazenamento" do
        blob.service.delete(blob.key)

        download(key: blob.key)

        expect(response).to have_http_status(:not_found)
        expect(json.dig("error", "code")).to eq("notFound")
      end

      it "responde 413 acima de 100 MB, sem baixar" do
        blob.update_column(:byte_size, Media::ProxyDownloadService::MAX_BYTES + 1)

        download(key: blob.key)

        expect(response).to have_http_status(:content_too_large)
        expect(json.dig("error", "code")).to eq("mediaTooLarge")
      end

      it "aceita exatamente 100 MB" do
        blob.update_column(:byte_size, Media::ProxyDownloadService::MAX_BYTES)

        download(key: blob.key)

        expect(response).to have_http_status(:ok)
      end
    end

    describe "host externo liberado" do
      before { stub_external_head }

      it "busca pelo servidor e manda como anexo, com nome a partir da chave e do tipo" do
        stub_external_get

        download(url: external_url)

        expect(response).to have_http_status(:ok)
        expect(response.body).to eq("bytes-externos")
        expect(response.headers["Content-Disposition"]).to include("attachment", "#{external_key}.pdf")
        expect(response.headers["Content-Type"]).to include("application/pdf")
      end

      it "aceita o segundo host da lista, sem diferenciar caixa" do
        stub_external_head("https://cdn2.exemplo.com/arquivo")
        stub_external_get("https://cdn2.exemplo.com/arquivo")

        download(url: "https://CDN2.exemplo.com/arquivo")

        expect(response).to have_http_status(:ok)
      end

      it "responde 502 quando a origem falha no download" do
        stub_external_get(status: 500)

        download(url: external_url)

        expect(response).to have_http_status(:bad_gateway)
        expect(json.dig("error", "code")).to eq("mediaUpstreamError")
      end

      it "responde 502 quando a rede cai no download" do
        stub_request(:get, external_url).to_timeout

        download(url: external_url)

        expect(response).to have_http_status(:bad_gateway)
      end

      it "responde 413 quando o corpo passa do limite, mesmo sem Content-Length" do
        stub_const("Media::ProxyDownloadService::MAX_BYTES", 5)
        stub_external_get(body: "maior-que-cinco")

        download(url: external_url)

        expect(response).to have_http_status(:content_too_large)
        expect(json.dig("error", "code")).to eq("mediaTooLarge")
      end
    end

    it "responde 413 quando a origem declara mais de 100 MB, sem baixar o corpo" do
      stub_external_head(headers: { "Content-Length" => (Media::ProxyDownloadService::MAX_BYTES + 1).to_s })

      download(url: external_url)

      expect(response).to have_http_status(:content_too_large)
      expect(a_request(:get, external_url)).not_to have_been_made
    end

    it "responde 404 quando a origem diz que não existe" do
      stub_external_head(status: 404)

      download(url: external_url)

      expect(response).to have_http_status(:not_found)
    end

    it "responde 404 quando a rede cai na consulta" do
      stub_request(:head, external_url).to_timeout

      download(url: external_url)

      expect(response).to have_http_status(:not_found)
    end

    it "responde 404 com chave desconhecida" do
      key = "a" * 28
      stub_external_head("#{Media::Storage.backend_url}/#{key}", status: 404)

      download(key: key)

      expect(response).to have_http_status(:not_found)
    end

    it "responde 404 com assinatura adulterada no caminho proxy" do
      path = "/rails/active_storage/blobs/proxy/assinatura-falsa/foto.jpg"
      stub_external_head("#{Media::Storage.backend_url}#{path}", status: 404)

      download(url: path)

      expect(response).to have_http_status(:not_found)
    end

    # Sem lista de hosts este endpoint seria um proxy aberto (SSRF). A rede fechada garante
    # que nenhuma chamada sai: um pedido sem stub derrubaria o exemplo.
    describe "host fora da lista" do
      [
        "https://evil.example.com/x",
        "http://169.254.169.254/latest/meta-data/",
        "http://127.0.0.1:6379/",
        "https://cdn.exemplo.com.evil.com/x",
        "https://cdn.exemplo.com@evil.example.com/x"
      ].each do |url|
        it "responde 403 para #{url}" do
          download(url: url)

          expect(response).to have_http_status(:forbidden)
          expect(json.dig("error", "code")).to eq("mediaHostNotAllowed")
        end
      end
    end

    describe "referência inválida" do
      [
        "ftp://cdn.exemplo.com/arquivo",
        "file:///etc/passwd",
        "http://",
        "javascript:alert(1)",
        "http://exemplo .com/x",
        "nao é url"
      ].each do |reference|
        it "responde 422 para #{reference.inspect}" do
          download(url: reference)

          expect(response).to have_http_status(:unprocessable_content)
          expect(json.dig("error", "code")).to eq("invalidMediaUrl")
        end
      end
    end

    it "expõe o Content-Disposition para o front em outra origem ler o nome do arquivo" do
      origin = Rails.application.config.action_cable.allowed_request_origins.first

      get "/media/download", params: { key: create_blob.key }, headers: headers.merge("Origin" => origin)

      expect(response.headers["Access-Control-Allow-Origin"]).to eq(origin)
      expect(response.headers["Access-Control-Expose-Headers"]).to include("Content-Disposition")
    end
  end

  describe "GET /media/metadata" do
    def metadata(**params)
      get "/media/metadata", params: params, headers: headers
    end

    it "responde 401 sem sessão" do
      get "/media/metadata", params: { key: "x" }

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 422 sem URL nem chave" do
      metadata

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("mediaReferenceRequired")
    end

    context "com blob do Active Storage" do
      let(:blob) { create_blob("0123456789", filename: "foto.jpg", content_type: "image/jpeg", metadata: { width: 800, height: 600, duration: 3.5 }) }

      it "devolve os metadados em camelCase, com a data em milissegundos" do
        metadata(key: blob.key)

        expect(response).to have_http_status(:ok)
        expect(json).to include(
          "key" => blob.key,
          "filename" => "foto.jpg",
          "contentType" => "image/jpeg",
          "byteSize" => 10,
          "checksum" => blob.checksum,
          "width" => 800,
          "height" => 600,
          "duration" => 3.5,
          "source" => "active_storage"
        )
        expect(json["createdAt"]).to be_within(1000).of(blob.created_at.to_i * 1000)
      end

      it "não baixa o arquivo nem expõe o blob" do
        metadata(key: blob.key)

        expect(json).not_to have_key("blob")
      end

      it "resolve pelo caminho proxy guardado nas mensagens" do
        metadata(url: Media::Storage.path_for(blob))

        expect(json).to include("filename" => "foto.jpg", "source" => "active_storage")
      end

      it "não traz campos vazios" do
        plain = create_blob("x", filename: "nota.txt", content_type: "text/plain")

        metadata(key: plain.key)

        expect(json.keys).not_to include("width", "height", "duration")
      end
    end

    context "com host externo liberado" do
      it "consulta a origem com HEAD, sem baixar os bytes" do
        stub_external_head(headers: { "Content-Length" => "2945", "ETag" => '"abc123"', "Last-Modified" => "Wed, 21 Oct 2026 07:28:00 GMT" })

        metadata(url: external_url)

        expect(response).to have_http_status(:ok)
        expect(json).to include(
          "key" => external_key,
          "filename" => "#{external_key}.pdf",
          "contentType" => "application/pdf",
          "byteSize" => 2945,
          "checksum" => "abc123",
          "source" => "origin",
          "createdAt" => Time.utc(2026, 10, 21, 7, 28).to_i * 1000
        )
        expect(a_request(:get, external_url)).not_to have_been_made
      end

      it "não traz data quando a origem não informa" do
        stub_external_head

        metadata(url: external_url)

        expect(json).not_to have_key("createdAt")
      end
    end

    it "responde 404 para o que não resolve" do
      stub_external_head(status: 404)

      metadata(url: external_url)

      expect(response).to have_http_status(:not_found)
      expect(json.dig("error", "code")).to eq("notFound")
    end

    it "responde 404 para host fora da lista, sem consultar" do
      metadata(url: "https://evil.example.com/x")

      expect(response).to have_http_status(:not_found)
    end

    it "responde 404 para referência inválida" do
      metadata(url: "ftp://cdn.exemplo.com/x")

      expect(response).to have_http_status(:not_found)
    end
  end
end
