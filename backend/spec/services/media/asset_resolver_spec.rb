require "rails_helper"

RSpec.describe Media::AssetResolver do
  subject(:resolver) { described_class.new(reference) }

  let(:key) { "ozd53ipr4djgjwggz1mfkq0dxsl0" }

  around do |example|
    saved = ENV.values_at("BACKEND_URL", "MEDIA_PROXY_ALLOWED_HOSTS")
    ENV["BACKEND_URL"] = "https://api.vekoo.test"
    ENV["MEDIA_PROXY_ALLOWED_HOSTS"] = "cdn.exemplo.com"
    example.run
  ensure
    ENV["BACKEND_URL"], ENV["MEDIA_PROXY_ALLOWED_HOSTS"] = saved
  end

  def create_blob(**attributes)
    ActiveStorage::Blob.create_and_upload!(
      io: StringIO.new("0123456789"),
      filename: attributes.fetch(:filename, "contrato assinado.pdf"),
      content_type: attributes.fetch(:content_type, "application/pdf"),
      metadata: attributes.fetch(:metadata, {}),
      identify: false
    )
  end

  describe "#call" do
    context "com referência inválida" do
      let(:reference) { "not a url" }

      it "devolve nil" do
        expect(resolver.call).to be_nil
      end
    end

    context "com host fora da lista" do
      let(:reference) { "http://169.254.169.254/latest/meta-data/" }

      it "devolve nil sem tocar na rede" do
        expect(resolver.call).to be_nil
        expect(a_request(:any, /169\.254/)).not_to have_been_made
      end
    end

    context "com a key de um blob do Active Storage" do
      let(:blob) { create_blob(metadata: { "width" => 800, "height" => 600, "duration" => 12.5 }) }
      let(:reference) { "https://api.vekoo.test/#{blob.key}" }

      it "prefere o blob a uma ida até a origem" do
        resolver.call

        expect(a_request(:head, /api\.vekoo\.test/)).not_to have_been_made
      end

      it "devolve o nome original gravado no envio" do
        expect(resolver.call.filename).to eq("contrato assinado.pdf")
      end

      it "devolve todos os metadados" do
        expect(resolver.call).to have_attributes(
          key: blob.key,
          content_type: "application/pdf",
          byte_size: 10,
          checksum: blob.checksum,
          created_at: blob.created_at,
          width: 800,
          height: 600,
          duration: 12.5,
          source: "active_storage",
          blob: blob
        )
      end

      it "deixa o blob interno de fora do que vai para a API" do
        payload = resolver.call.to_h

        expect(payload).not_to have_key(:blob)
        expect(payload).to include(key: blob.key, filename: "contrato assinado.pdf")
      end

      it "deixa as chaves vazias de fora do que vai para a API" do
        plain = create_blob

        expect(described_class.new(plain.key).call.to_h).not_to have_key(:width)
      end
    end

    context "só com a key" do
      let(:blob) { create_blob(filename: "foto.jpg", content_type: "image/jpeg") }
      let(:reference) { blob.key }

      it "resolve do mesmo jeito" do
        expect(resolver.call.filename).to eq("foto.jpg")
      end
    end

    context "com o caminho proxy guardado na mensagem" do
      let(:blob) { create_blob(filename: "foto.jpg", content_type: "image/jpeg") }
      let(:reference) { Media::Storage.path_for(blob) }

      it "resolve pela assinatura" do
        expect(resolver.call).to have_attributes(filename: "foto.jpg", source: "active_storage", blob: blob)
      end
    end

    context "com a assinatura adulterada na rota do Active Storage" do
      let(:reference) { "/rails/active_storage/blobs/proxy/adulterada/foto.jpg" }

      it "cai na origem e, sem objeto lá, devolve nil" do
        stub_request(:head, "https://api.vekoo.test#{reference}").to_return(status: 404)

        expect(resolver.call).to be_nil
      end
    end

    context "sem blob para a key" do
      let(:reference) { "https://cdn.exemplo.com/#{key}" }
      # Cabeçalhos reais de um bucket: sem content-disposition, por isso o nome é sintetizado.
      let(:headers) do
        {
          "Content-Type" => "image/jpeg",
          "Content-Length" => "2945",
          "ETag" => '"c0e06abae228f5cc5512f8441c0ec0e0"',
          "Last-Modified" => "Mon, 22 Dec 2025 19:41:16 GMT"
        }
      end

      before { stub_request(:head, reference).to_return(status: 200, headers: headers) }

      it "cai nos cabeçalhos da origem" do
        expect(resolver.call).to have_attributes(
          content_type: "image/jpeg",
          byte_size: 2945,
          checksum: "c0e06abae228f5cc5512f8441c0ec0e0",
          source: "origin",
          blob: nil
        )
      end

      it "sintetiza o nome com a extensão inferida do tipo" do
        expect(resolver.call.filename).to eq("#{key}.jpeg")
      end

      it "transforma last-modified em data" do
        expect(resolver.call.created_at).to eq(Time.utc(2025, 12, 22, 19, 41, 16))
      end

      context "com um tipo que tem parâmetros" do
        let(:headers) { { "Content-Type" => "image/png; charset=binary" } }

        it "fica só com o tipo" do
          expect(resolver.call.content_type).to eq("image/png")
        end
      end

      context "sem tipo" do
        let(:headers) { {} }

        it "usa o tipo genérico e o nome fica sem extensão inventada" do
          asset = resolver.call

          expect(asset.content_type).to eq("application/octet-stream")
          expect(asset.filename).to start_with(key)
        end
      end

      context "com last-modified inválido" do
        let(:headers) { { "Last-Modified" => "ontem" } }

        it "fica sem data" do
          expect(resolver.call.created_at).to be_nil
        end
      end
    end

    context "com o objeto que não existe na origem" do
      let(:reference) { "https://cdn.exemplo.com/#{key}" }

      it "devolve nil" do
        stub_request(:head, reference).to_return(status: 404)

        expect(resolver.call).to be_nil
      end
    end

    context "com a origem fora do ar" do
      let(:reference) { "https://cdn.exemplo.com/#{key}" }

      it "devolve nil em vez de levantar" do
        stub_request(:head, reference).to_timeout

        expect(resolver.call).to be_nil
      end
    end
  end
end
