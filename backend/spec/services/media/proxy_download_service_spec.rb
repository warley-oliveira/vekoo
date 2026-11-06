require "rails_helper"

RSpec.describe Media::ProxyDownloadService do
  subject(:service) { described_class.new(reference) }

  around do |example|
    saved = ENV.values_at("BACKEND_URL", "MEDIA_PROXY_ALLOWED_HOSTS")
    ENV["BACKEND_URL"] = "https://api.vekoo.test"
    ENV["MEDIA_PROXY_ALLOWED_HOSTS"] = "cdn.exemplo.com"
    example.run
  ensure
    ENV["BACKEND_URL"], ENV["MEDIA_PROXY_ALLOWED_HOSTS"] = saved
  end

  describe "#call" do
    context "com referência malformada" do
      let(:reference) { "not a url" }

      it "falha com invalid_url" do
        expect(service.call.error).to eq(:invalid_url)
      end

      it "não é sucesso" do
        expect(service.call).not_to be_success
      end
    end

    context "com esquema que não é http" do
      let(:reference) { "file:///etc/passwd" }

      it "falha com invalid_url" do
        expect(service.call.error).to eq(:invalid_url)
      end
    end

    context "com host fora da lista" do
      let(:reference) { "http://169.254.169.254/latest/meta-data/" }

      it "falha com host_not_allowed sem fazer pedido nenhum" do
        expect(service.call.error).to eq(:host_not_allowed)
        expect(a_request(:any, /169\.254/)).not_to have_been_made
      end
    end

    context "com a key de um blob do Active Storage" do
      let(:blob) do
        ActiveStorage::Blob.create_and_upload!(io: StringIO.new("binary-bytes"), filename: "foto.jpg", content_type: "image/jpeg")
      end
      let(:reference) { "https://api.vekoo.test/#{blob.key}" }

      it "devolve os bytes do blob sem ir à rede" do
        result = service.call

        expect(result).to be_success
        expect(result.body).to eq("binary-bytes")
        expect(a_request(:get, /api\.vekoo\.test/)).not_to have_been_made
      end

      it "expõe o nome e o tipo resolvidos do blob" do
        expect(service.call).to have_attributes(filename: "foto.jpg", content_type: "image/jpeg")
      end

      it "aceita o caminho proxy guardado na mensagem" do
        expect(described_class.new(Media::Storage.path_for(blob)).call.body).to eq("binary-bytes")
      end

      context "maior que o limite" do
        before { stub_const("#{described_class}::MAX_BYTES", 5) }

        it "falha com too_large" do
          expect(service.call.error).to eq(:too_large)
        end
      end

      context "quando o arquivo sumiu do armazenamento" do
        before { blob.service.delete(blob.key) }

        it "falha com not_found" do
          expect(service.call.error).to eq(:not_found)
        end
      end
    end

    context "quando a mídia não é resolvida" do
      let(:reference) { "https://cdn.exemplo.com/nao-existe" }

      before { stub_request(:head, reference).to_return(status: 404) }

      it "falha com not_found" do
        expect(service.call.error).to eq(:not_found)
      end
    end

    context "com mídia de host liberado, sem blob aqui" do
      let(:reference) { "https://cdn.exemplo.com/legacy-key" }
      let(:head_headers) { { "Content-Type" => "image/png", "Content-Length" => "12" } }

      before { stub_request(:head, reference).to_return(status: 200, headers: head_headers) }

      it "busca pelo lado do servidor" do
        stub_request(:get, reference).to_return(status: 200, body: "remote-bytes")

        result = service.call

        expect(result).to be_success
        expect(result.body).to eq("remote-bytes")
        expect(result.content_type).to eq("image/png")
        expect(result.filename).to eq("legacy-key.png")
      end

      context "com a origem redirecionando" do
        let(:outside) { "https://fora-da-lista.exemplo.com/segredo" }

        it "não segue redirect para host fora da lista" do
          stub_request(:get, reference).to_return(status: 302, headers: { "Location" => outside })
          forbidden = stub_request(:get, outside).to_return(status: 200, body: "dados internos")

          expect(service.call.error).to eq(:host_not_allowed)
          expect(forbidden).not_to have_been_requested
        end

        it "segue redirect dentro da lista" do
          target = "#{reference}-final"
          stub_request(:get, reference).to_return(status: 302, headers: { "Location" => target })
          stub_request(:get, target).to_return(status: 200, body: "remote-bytes")

          expect(service.call.body).to eq("remote-bytes")
        end

        it "para no teto de redirects" do
          stub_request(:get, reference).to_return(status: 302, headers: { "Location" => reference })

          expect(service.call.error).to eq(:host_not_allowed)
        end
      end

      context "com a origem respondendo erro" do
        it "falha com upstream_error" do
          stub_request(:get, reference).to_return(status: 500)

          expect(service.call.error).to eq(:upstream_error)
        end
      end

      context "com a origem estourando o tempo" do
        it "falha com upstream_error" do
          stub_request(:get, reference).to_raise(Net::ReadTimeout)

          expect(service.call.error).to eq(:upstream_error)
        end

        it "falha com upstream_error na conexão também" do
          stub_request(:get, reference).to_timeout

          expect(service.call.error).to eq(:upstream_error)
        end
      end

      context "com o tamanho declarado acima do limite" do
        let(:head_headers) { { "Content-Type" => "image/png", "Content-Length" => (described_class::MAX_BYTES + 1).to_s } }

        it "falha com too_large sem baixar" do
          expect(service.call.error).to eq(:too_large)
          expect(a_request(:get, reference)).not_to have_been_made
        end
      end

      context "sem tamanho declarado e com o corpo acima do limite" do
        let(:head_headers) { { "Content-Type" => "image/png" } }

        before { stub_const("#{described_class}::MAX_BYTES", 5) }

        it "falha com too_large depois de baixar" do
          stub_request(:get, reference).to_return(status: 200, body: "remote-bytes")

          expect(service.call.error).to eq(:too_large)
        end
      end
    end
  end
end
