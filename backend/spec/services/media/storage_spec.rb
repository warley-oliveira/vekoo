require "rails_helper"

RSpec.describe Media::Storage do
  around do |example|
    saved = ENV["BACKEND_URL"]
    ENV["BACKEND_URL"] = "https://api.vekoo.test/"
    example.run
  ensure
    ENV["BACKEND_URL"] = saved
  end

  describe ".store_io" do
    it "guarda o arquivo como blob do Active Storage" do
      blob = described_class.store_io(StringIO.new("bytes"), filename: "foto.jpg", content_type: "image/jpeg")

      expect(blob).to be_a(ActiveStorage::Blob)
      expect(blob).to have_attributes(filename: an_object_satisfying { |name| name.to_s == "foto.jpg" }, content_type: "image/jpeg", byte_size: 5)
      expect(blob.download).to eq("bytes")
    end

    it "sem nome, usa um genérico" do
      expect(described_class.store_io(StringIO.new("bytes"), filename: nil, content_type: "image/jpeg").filename.to_s).to eq("arquivo")
    end

    it "sem tipo, identifica pelo conteúdo" do
      png = "\x89PNG\r\n\x1A\n".b + ("\x00".b * 32)

      expect(described_class.store_io(StringIO.new(png), filename: "sem-extensao").content_type).to eq("image/png")
    end
  end

  describe ".store_file" do
    it "guarda a partir de um caminho" do
      path = Rails.root.join("tmp", "storage-spec-#{SecureRandom.hex(4)}.txt")
      File.binwrite(path, "conteúdo")

      blob = described_class.store_file(path, filename: "nota.txt", content_type: "text/plain")

      expect(blob.download.force_encoding("UTF-8")).to eq("conteúdo")
    ensure
      FileUtils.rm_f(path)
    end
  end

  describe ".path_for" do
    it "devolve o caminho da rota proxy, sem host" do
      blob = described_class.store_io(StringIO.new("bytes"), filename: "foto.jpg", content_type: "image/jpeg")

      path = described_class.path_for(blob)

      expect(path).to start_with("/rails/active_storage/blobs/proxy/")
      expect(path).to end_with("/foto.jpg")
    end
  end

  describe ".public_url" do
    it "prefixa o caminho com a URL do backend" do
      expect(described_class.public_url("/rails/active_storage/blobs/proxy/abc/foto.jpg")).to eq("https://api.vekoo.test/rails/active_storage/blobs/proxy/abc/foto.jpg")
    end

    it "aceita caminho sem a barra" do
      expect(described_class.public_url("foto.jpg")).to eq("https://api.vekoo.test/foto.jpg")
    end

    it "mantém a URL absoluta" do
      expect(described_class.public_url("https://cdn.exemplo.com/foto.jpg")).to eq("https://cdn.exemplo.com/foto.jpg")
      expect(described_class.public_url("HTTP://cdn.exemplo.com/foto.jpg")).to eq("HTTP://cdn.exemplo.com/foto.jpg")
    end

    it "devolve nil para nada" do
      expect(described_class.public_url(nil)).to be_nil
      expect(described_class.public_url("")).to be_nil
    end
  end

  describe ".backend_url" do
    it "tira a barra do fim" do
      expect(described_class.backend_url).to eq("https://api.vekoo.test")
    end

    it "sem BACKEND_URL, usa localhost com a porta do Rails" do
      ENV["BACKEND_URL"] = nil

      expect(described_class.backend_url).to start_with("http://localhost:")
    end
  end

  describe ".purge" do
    it "agenda a remoção do blob" do
      blob = described_class.store_io(StringIO.new("bytes"), filename: "foto.jpg", content_type: "image/jpeg")

      expect { described_class.purge(blob.id) }.to have_enqueued_job(ActiveStorage::PurgeJob).with(blob)
    end

    it "sem id, não faz nada" do
      expect { described_class.purge(nil) }.not_to have_enqueued_job(ActiveStorage::PurgeJob)
    end

    it "com id que não existe, não quebra" do
      expect { described_class.purge(SecureRandom.uuid) }.not_to have_enqueued_job(ActiveStorage::PurgeJob)
    end
  end
end
