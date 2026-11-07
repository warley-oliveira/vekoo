require "rails_helper"

RSpec.describe ConnectorsChannel, type: :channel do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization, status: :pending) }

  before { stub_connection current_account: account }

  def listen(target = connector)
    subscribe(connectorId: target.id.to_s)
  end

  describe "#subscribed" do
    it "escuta a stream de conexão do conector" do
      listen

      expect(subscription).to be_confirmed
      expect(subscription).to have_stream_from("org:#{organization.id}:connector:#{connector.id}")
    end

    it "aceita o parâmetro em snake_case" do
      subscribe(connector_id: connector.id.to_s)

      expect(subscription).to be_confirmed
    end

    it "recusa sem id" do
      subscribe

      expect(subscription).to be_rejected
    end

    it "recusa conector que não existe" do
      subscribe(connectorId: BSON::ObjectId.new.to_s)

      expect(subscription).to be_rejected
    end

    it "recusa conector de outra organização" do
      foreign = create(:connector_whatsapp_web, organization: create(:organization))

      listen(foreign)

      expect(subscription).to be_rejected
    end

    describe "QR code em cache" do
      it "entrega o que já está em cache a quem chega" do
        Rails.cache.write("qrcode.base64.#{connector.id}", "BASE64QR")

        listen

        expect(transmissions.last).to eq("status" => "qr_updated", "base64" => "BASE64QR", "pairCode" => nil)
      end

      it "entrega junto o código de pareamento guardado, para quem assina depois do webhook" do
        Rails.cache.write("qrcode.base64.#{connector.id}", "BASE64QR")
        Rails.cache.write("pair_code.#{connector.id}", "WZYK8QTM")

        listen

        expect(transmissions.last).to eq("status" => "qr_updated", "base64" => "BASE64QR", "pairCode" => "WZYK8QTM")
      end

      it "sem QR em cache, não transmite nada" do
        listen

        expect(transmissions).to be_empty
      end

      it "não vaza o QR de outra organização" do
        foreign = create(:connector_whatsapp_web, organization: create(:organization))
        Rails.cache.write("qrcode.base64.#{foreign.id}", "BASE64QR-FORA")

        listen(foreign)

        expect(transmissions).to be_empty
      end

      it "entrega só a quem chegou, sem incomodar quem já está na tela" do
        Rails.cache.write("qrcode.base64.#{connector.id}", "BASE64QR")

        expect { listen }.not_to have_broadcasted_to(connector.stream_name)
      end
    end

    it "recebe o que o conector transmite" do
      listen

      expect { connector.broadcast_connection(status: "connected") }.to have_broadcasted_to(connector.stream_name).with("status" => "connected")
    end
  end

  describe "#unsubscribed e #unsubscribe" do
    it "para de escutar ao sair" do
      listen

      subscription.unsubscribe_from_channel

      expect(subscription).not_to have_stream_from(connector.stream_name)
    end

    it "a tela pode pedir para parar" do
      listen

      perform :unsubscribe

      expect(subscription).not_to have_stream_from(connector.stream_name)
    end
  end

  # Com o QR code qualquer um conecta o próprio WhatsApp neste canal.
  describe "sem permissão de configuração" do
    let(:member) do
      create(:account, organization: connector.organization, role: "member", access_role: create(:access_role, :member, organization: connector.organization))
    end

    it "recusa a assinatura" do
      stub_connection current_account: member

      subscribe connectorId: connector.id.to_s

      expect(subscription).to be_rejected
    end
  end
end
