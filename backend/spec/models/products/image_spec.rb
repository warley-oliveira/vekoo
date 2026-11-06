require "rails_helper"

RSpec.describe Products::Image do
  let(:item) { create(:product_item) }
  let(:png_path) { Rails.root.join("spec/fixtures/files/foto.png") }

  def hosted_image(content_type: "image/png")
    image = described_class.new(item: item)
    image.file.attach(io: File.open(png_path), filename: "foto.png", content_type: content_type)
    image.save!
    image
  end

  describe ".extension_for" do
    it "mapeia cada formato aceito" do
      expect(described_class::ALLOWED_CONTENT_TYPES.map { |type| described_class.extension_for(type) })
        .to eq(%w[jpg png webp gif])
    end

    it "ignora parâmetros de charset" do
      expect(described_class.extension_for("image/png; charset=binary")).to eq("png")
    end

    it "cai no padrão para tipo desconhecido, sem levantar" do
      expect(described_class.extension_for("application/octet-stream")).to eq("jpg")
      expect(described_class.extension_for(nil)).to eq("jpg")
    end
  end

  describe ".filename_for" do
    # A extensão é o que faz a entrega classificar o arquivo como imagem.
    it "gera nome com a extensão do formato" do
      expect(described_class.filename_for(item.id, "image/png")).to match(/\Aproduct-#{item.id}-\h{8}\.png\z/)
    end
  end

  describe "validações" do
    it "exige arquivo ou endereço de origem" do
      image = described_class.new(item: item)

      expect(image).not_to be_valid
      expect(image.errors[:source_url]).to be_present
    end

    it "só aceita origem http(s)" do
      expect(described_class.new(item: item, source_url: "javascript:alert(1)")).not_to be_valid
      expect(described_class.new(item: item, source_url: "https://cdn.exemplo.com.br/a.png")).to be_valid
    end

    # Vale o conteúdo, não o que o navegador declarou.
    it "recusa arquivo que não é imagem, mesmo declarado como imagem" do
      image = described_class.new(item: item)
      image.file.attach(io: StringIO.new("%PDF-1.4 não é foto"), filename: "x.pdf", content_type: "image/png")

      expect(image).not_to be_valid
      expect(image.errors[:file]).to be_present
    end

    it "recusa arquivo acima do teto" do
      stub_const("Products::Image::MAX_BYTES", 10)
      image = described_class.new(item: item)
      image.file.attach(io: File.open(png_path), filename: "foto.png", content_type: "image/png")

      expect(image).not_to be_valid
      expect(image.errors[:file]).to be_present
    end
  end

  describe "URLs" do
    context "hospedada" do
      let(:image) { hosted_image }

      it "aponta para a rota proxy, relativa e sem expirar" do
        expect(image).to be_hosted
        expect(image.public_url).to start_with("/rails/active_storage/blobs/proxy/")
        expect(image.public_url).not_to include("expires_in")
      end

      it "tem miniatura pela rota de variante" do
        expect(image.thumb_url).to start_with("/rails/active_storage/representations/proxy/")
      end

      it "entrega por URL absoluta, com a extensão no nome do arquivo" do
        url = image.delivery_url(host: "https://api.exemplo.com.br")

        expect(url).to start_with("https://api.exemplo.com.br/rails/active_storage/blobs/proxy/")
        expect(File.extname(URI.parse(url).path)).to eq(".png")
      end

      it "usa o host da aplicação quando ninguém informa" do
        expect(image.delivery_url).to match(%r{\Ahttp://localhost:\d+/})
      end
    end

    context "externa" do
      let(:image) { create(:product_image, item: item, source_url: "https://ex.com/a.png") }

      it "usa o endereço de origem em tudo" do
        expect(image).not_to be_hosted
        expect(image.public_url).to eq("https://ex.com/a.png")
        expect(image.thumb_url).to eq("https://ex.com/a.png")
        expect(image.delivery_url).to eq("https://ex.com/a.png")
      end
    end
  end

  describe ".ordered" do
    it "desempata pela ordem de envio, não pelo UUID" do
      first = create(:product_image, item: item, position: 1, created_at: 2.days.ago)
      second = create(:product_image, item: item, position: 1, created_at: 1.day.ago)
      cover = create(:product_image, item: item, position: 0)

      expect(item.images.reload).to eq([ cover, first, second ])
    end
  end

  describe ".external" do
    it "separa o que ainda não foi hospedado" do
      external = create(:product_image, item: item)
      hosted = hosted_image

      expect(described_class.external).to include(external)
      expect(described_class.external).not_to include(hosted)
    end
  end
end
