require "rails_helper"

RSpec.describe Proxy do
  let(:organization) { create(:organization) }

  def build_proxy(url, **attributes)
    described_class.new(url: url, organization_id: organization.id, **attributes)
  end

  describe "validação da URL" do
    [ "http://proxy.exemplo.com:3128", "https://usuario:senha@proxy.exemplo.com", "socks5://proxy.exemplo.com:1080" ].each do |url|
      it "aceita #{url}" do
        expect(build_proxy(url)).to be_valid
      end
    end

    [ nil, "", "não é url", "proxy.exemplo.com" ].each do |url|
      it "recusa #{url.inspect}" do
        proxy = build_proxy(url)

        expect(proxy).not_to be_valid
        expect(proxy.errors[:url]).to be_present
      end
    end
  end

  describe "conector" do
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }

    it "é opcional: o proxy pode ficar livre, à espera de um canal" do
      expect(build_proxy("http://p.exemplo.com")).to be_valid
    end

    it "aceita qualquer tipo de conector" do
      proxy = build_proxy("http://p.exemplo.com", connector: connector).tap(&:save!)

      expect(described_class.find(proxy.id).connector).to eq(connector)
      expect(Connector::Base.find(connector.id).proxy).to eq(proxy)
    end
  end

  it "guarda a organização como texto, como todo campo Mongoid que aponta para o Postgres" do
    expect(build_proxy("http://p.exemplo.com").tap(&:save!).reload.organization_id).to eq(organization.id)
  end
end
