require "rails_helper"

RSpec.describe Products::MirrorImageJob, type: :job do
  let(:url) { "https://cdn.exemplo.com.br/fotos/camiseta.png" }
  let(:image) { create(:product_image, source_url: url) }
  let(:png) { File.binread(Rails.root.join("spec/fixtures/files/foto.png")) }

  before { allow(Products::RemoteImage).to receive(:resolve).with("cdn.exemplo.com.br").and_return([ "93.184.216.34" ]) }

  it "roda na fila low" do
    expect(described_class.new.queue_name).to eq("low")
  end

  it "baixa a imagem para o nosso storage, guardando de onde ela veio" do
    stub_request(:get, url).to_return(status: 200, body: png, headers: { "Content-Type" => "image/png" })

    described_class.perform_now(image.id)

    image.reload
    expect(image).to be_hosted
    expect(image.source_url).to eq(url)
    expect(image.public_url).to start_with("/rails/active_storage/blobs/proxy/")
    expect(image.file.blob.download).to eq(png)
  end

  # A entrega no WhatsApp decide o tipo de mídia pelo nome do arquivo.
  it "dá ao arquivo a extensão do formato" do
    stub_request(:get, url).to_return(status: 200, body: png, headers: { "Content-Type" => "image/png" })

    described_class.perform_now(image.id)

    expect(image.reload.file.filename.extension).to eq("png")
  end

  it "não baixa de novo o que já está hospedado" do
    stub_request(:get, url).to_return(status: 200, body: png, headers: { "Content-Type" => "image/png" })
    described_class.perform_now(image.id)

    described_class.perform_now(image.id)

    expect(a_request(:get, url)).to have_been_made.once
  end

  it "ignora imagem que já não existe" do
    expect { described_class.perform_now(SecureRandom.uuid) }.not_to raise_error
  end

  describe "falhas: a imagem só continua externa, sem erro" do
    def expect_stays_external
      expect { described_class.perform_now(image.id) }.not_to raise_error

      image.reload
      expect(image).not_to be_hosted
      expect(image.public_url).to eq(url)
    end

    it "link quebrado" do
      stub_request(:get, url).to_return(status: 404)

      expect_stays_external
    end

    it "servidor que não responde" do
      stub_request(:get, url).to_timeout

      expect_stays_external
    end

    it "formato que não aceitamos" do
      stub_request(:get, url).to_return(status: 200, body: "<html></html>", headers: { "Content-Type" => "text/html" })

      expect_stays_external
    end

    # Vale o conteúdo: quem controla o servidor escolhe o cabeçalho que quiser.
    it "conteúdo que não é o que o cabeçalho diz" do
      stub_request(:get, url).to_return(status: 200, body: "%PDF-1.4 não é foto", headers: { "Content-Type" => "image/png" })

      expect_stays_external
    end

    it "arquivo acima do teto" do
      stub_const("Products::Image::MAX_BYTES", 10)
      stub_request(:get, url).to_return(status: 200, body: png, headers: { "Content-Type" => "image/png" })

      expect_stays_external
    end

    it "endereço interno (SSRF)" do
      allow(Products::RemoteImage).to receive(:resolve).with("cdn.exemplo.com.br").and_return([ "169.254.169.254" ])

      expect_stays_external
      expect(a_request(:any, /.*/)).not_to have_been_made
    end
  end
end
