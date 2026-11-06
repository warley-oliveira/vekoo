require "rails_helper"

RSpec.describe PublicMediaUrl do
  subject(:host) { Class.new { include PublicMediaUrl }.new }

  def public_url(url)
    host.send(:public_media_url, url)
  end

  describe "#public_media_url" do
    [
      "https://scontent.whatsapp.net/v/t61/banner.jpg?ccb=1-7&oh=01_Q5Aa5",
      "https://mmg.whatsapp.net/v/banner.jpg",
      "https://whatsapp.net/banner.jpg",
      "https://scontent.xx.fbcdn.net/v/t1/banner.jpg",
      "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=123",
      "https://SCONTENT.WHATSAPP.NET/banner.jpg"
    ].each do |url|
      it "recusa o CDN da Meta: #{url}" do
        expect(public_url(url)).to be_nil
      end
    end

    [
      "https://arquivos.vekoo.app/banner.jpg",
      "https://notwhatsapp.net/banner.jpg",
      "https://whatsapp.net.exemplo.com/banner.jpg",
      "https://exemplo.com/whatsapp.net/banner.jpg",
      "/rails/active_storage/blobs/proxy/abc/banner.jpg"
    ].each do |url|
      it "aceita o que não é da Meta: #{url}" do
        expect(public_url(url)).to eq(url)
      end
    end

    it "decodifica o & escapado que a Meta manda" do
      expect(public_url('https://arquivos.vekoo.app/abc?a=1\\u0026b=2')).to eq("https://arquivos.vekoo.app/abc?a=1&b=2")
    end

    it "decodifica antes de avaliar o host" do
      expect(public_url('https://scontent.whatsapp.net/abc?a=1\\u0026b=2')).to be_nil
    end

    it "devolve nil para vazio" do
      expect(public_url(nil)).to be_nil
      expect(public_url("")).to be_nil
    end

    it "mantém o que nem dá para abrir como URL: o provedor é quem vai recusar" do
      expect(public_url("https://exemplo.com/com espaço.jpg")).to eq("https://exemplo.com/com espaço.jpg")
    end

    it "não fica exposto como método público de quem inclui" do
      expect(host).not_to respond_to(:public_media_url)
    end
  end

  it "é usado por WhatsappTemplate na escolha da mídia do cabeçalho" do
    expect(WhatsappTemplate.include?(described_class)).to be(true)
  end
end
