require "rails_helper"

RSpec.describe Media::AssetUrl do
  let(:key) { "ozd53ipr4djgjwggz1mfkq0dxsl0" }

  around do |example|
    saved = ENV.values_at("BACKEND_URL", "MEDIA_PROXY_ALLOWED_HOSTS")
    ENV["BACKEND_URL"] = "https://api.vekoo.test"
    ENV["MEDIA_PROXY_ALLOWED_HOSTS"] = nil
    example.run
  ensure
    ENV["BACKEND_URL"], ENV["MEDIA_PROXY_ALLOWED_HOSTS"] = saved
  end

  describe ".parse" do
    it "aceita a URL completa" do
      expect(described_class.parse("https://api.vekoo.test/#{key}").host).to eq("api.vekoo.test")
    end

    it "expande a key nua para a URL do backend" do
      expect(described_class.parse(key).to_s).to eq("https://api.vekoo.test/#{key}")
    end

    it "expande o caminho da rota proxy, que é o que fica guardado nas mensagens" do
      uri = described_class.parse("/rails/active_storage/blobs/proxy/abc/foto.jpg")

      expect(uri.to_s).to eq("https://api.vekoo.test/rails/active_storage/blobs/proxy/abc/foto.jpg")
    end

    it "ignora espaços em volta" do
      expect(described_class.parse("  https://api.vekoo.test/x  ").path).to eq("/x")
    end

    it "recusa URL malformada" do
      expect(described_class.parse("not a url")).to be_nil
    end

    it "recusa esquema que não é http" do
      expect(described_class.parse("file:///etc/passwd")).to be_nil
    end

    it "recusa URL sem host" do
      expect(described_class.parse("http:///caminho")).to be_nil
    end

    it "recusa referência em branco" do
      expect(described_class.parse("  ")).to be_nil
      expect(described_class.parse(nil)).to be_nil
    end
  end

  describe ".allowed?" do
    it "aceita o próprio backend" do
      expect(described_class.allowed?(URI.parse("https://api.vekoo.test/x"))).to be(true)
    end

    it "não diferencia maiúsculas no host" do
      expect(described_class.allowed?(URI.parse("https://API.Vekoo.test/x"))).to be(true)
    end

    it "recusa um host qualquer, para não virar proxy aberto" do
      expect(described_class.allowed?(URI.parse("http://169.254.169.254/latest/meta-data/"))).to be(false)
    end

    it "recusa subdomínio do backend que não está na lista" do
      expect(described_class.allowed?(URI.parse("https://mal.api.vekoo.test/x"))).to be(false)
    end

    it "aceita os hosts extras do ambiente" do
      ENV["MEDIA_PROXY_ALLOWED_HOSTS"] = "cdn.exemplo.com, Bucket.Exemplo.com,"

      expect(described_class.allowed?(URI.parse("https://cdn.exemplo.com/x"))).to be(true)
      expect(described_class.allowed?(URI.parse("https://bucket.exemplo.com/x"))).to be(true)
      expect(described_class.allowed_hosts).to eq(%w[api.vekoo.test cdn.exemplo.com bucket.exemplo.com])
    end
  end

  describe ".key_from" do
    it "devolve o último segmento do caminho" do
      expect(described_class.key_from(URI.parse("https://api.vekoo.test/pasta/#{key}"))).to eq(key)
    end

    it "devolve nil sem caminho" do
      expect(described_class.key_from(URI.parse("https://api.vekoo.test"))).to be_nil
    end
  end

  describe ".blob_from" do
    let(:blob) { ActiveStorage::Blob.create_and_upload!(io: StringIO.new("fake"), filename: "foto.jpg", content_type: "image/jpeg") }

    it "resolve o blob da rota proxy" do
      uri = described_class.parse(Media::Storage.path_for(blob))

      expect(described_class.blob_from(uri)).to eq(blob)
    end

    it "resolve o blob da rota de redirecionamento" do
      uri = URI.parse("https://api.vekoo.test/rails/active_storage/blobs/redirect/#{blob.signed_id}/foto.jpg")

      expect(described_class.blob_from(uri)).to eq(blob)
    end

    it "devolve nil com assinatura adulterada" do
      uri = URI.parse("https://api.vekoo.test/rails/active_storage/blobs/proxy/adulterada/foto.jpg")

      expect(described_class.blob_from(uri)).to be_nil
    end

    it "devolve nil para URL que não é da rota do Active Storage" do
      expect(described_class.blob_from(URI.parse("https://api.vekoo.test/#{key}"))).to be_nil
    end
  end
end
