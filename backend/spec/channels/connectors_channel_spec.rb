require "rails_helper"

RSpec.describe ConnectorsChannel, type: :channel do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:connector) { create(:connector_whatsapp_web, :zapi, organization: organization, status: :pending) }
  let(:qr_url) { "https://api.z-api.io/instances/INST123/token/TOKABC/qr-code/image" }

  before { stub_connection current_account: account }

  def listen(target = connector)
    subscribe(connectorId: target.id.to_s)
  end

  def json_reply(payload)
    { status: 200, body: payload.to_json, headers: { "Content-Type" => "application/json" } }
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
      foreign = create(:connector_whatsapp_web, :zapi, organization: create(:organization))

      listen(foreign)

      expect(subscription).to be_rejected
    end

    describe "QR code em cache" do
      it "entrega o que já está em cache a quem chega" do
        Rails.cache.write("qrcode.base64.#{connector.id}", "BASE64QR")

        listen

        expect(transmissions.last).to eq("status" => "qr_updated", "base64" => "BASE64QR", "pairCode" => nil)
      end

      it "sem QR em cache, não transmite nada" do
        listen

        expect(transmissions).to be_empty
      end

      it "não vaza o QR de outra organização" do
        foreign = create(:connector_whatsapp_web, :zapi, organization: create(:organization))
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

  describe "#generate_qr_code" do
    it "busca na Z-API e transmite o QR" do
      fetch = stub_request(:get, qr_url).to_return(json_reply({ value: "data:image/png;base64,QR" }))
      listen

      expect { perform :generate_qr_code }.to have_broadcasted_to(connector.stream_name).with(
        "status" => "qr_updated", "base64" => "data:image/png;base64,QR"
      )
      expect(fetch).to have_been_requested
    end

    it "não busca com o conector já conectado" do
      connector.set(status_cd: "active")
      listen

      perform :generate_qr_code

      expect(a_request(:get, qr_url)).not_to have_been_made
    end

    it "não transmite sem QR na resposta" do
      stub_request(:get, qr_url).to_return(json_reply({ value: "" }))
      listen

      expect { perform :generate_qr_code }.not_to have_broadcasted_to(connector.stream_name)
    end

    it "avisa a tela quando a Z-API recusa" do
      stub_request(:get, qr_url).to_return(status: 400, body: "instância inválida")
      listen

      expect { perform :generate_qr_code }.to have_broadcasted_to(connector.stream_name).with(
        "status" => "qr_error", "error" => "Z-API request failed (HTTP 400)"
      )
    end

    it "avisa a tela com a rede fora" do
      stub_request(:get, qr_url).to_timeout
      listen

      expect { perform :generate_qr_code }.to have_broadcasted_to(connector.stream_name).with(
        a_hash_including("status" => "qr_error", "error" => a_string_including("execution expired"))
      )
    end

    context "com a Evolution, que não gera QR por aqui" do
      let(:connector) { create(:connector_whatsapp_web, organization: organization, status: :pending) }

      it "não faz nada" do
        listen

        expect { perform :generate_qr_code }.not_to have_broadcasted_to(connector.stream_name)
      end
    end

    context "com a WABA" do
      let(:connector) { create(:connector_whatsapp_cloud, organization: organization, status: :pending) }

      it "não faz nada" do
        listen

        expect { perform :generate_qr_code }.not_to have_broadcasted_to(connector.stream_name)
      end
    end

    context "com a instância Z-API avulsa" do
      let(:connector) { create(:connector_zapi, organization: organization, status: :pending) }
      let(:qr_url) { "https://api.z-api.io/instances/ZINST/token/ZTOKEN/qr-code/image" }

      it "busca e transmite o QR" do
        stub_request(:get, qr_url).to_return(json_reply({ value: "QR-AVULSA" }))
        listen

        expect { perform :generate_qr_code }.to have_broadcasted_to(connector.stream_name).with("status" => "qr_updated", "base64" => "QR-AVULSA")
      end

      it "avisa a tela quando a Z-API recusa" do
        stub_request(:get, qr_url).to_return(status: 400, body: "instância inválida")
        listen

        expect { perform :generate_qr_code }.to have_broadcasted_to(connector.stream_name).with(a_hash_including("status" => "qr_error"))
      end
    end

    it "o conector vem do id da assinatura, e não do que a mensagem manda" do
      foreign = create(:connector_whatsapp_web, :zapi, organization: create(:organization), status: :pending, zapi_instance_id: "FORA", zapi_token: "FORA")
      stub_request(:get, qr_url).to_return(json_reply({ value: "QR" }))
      listen

      perform :generate_qr_code, "connectorId" => foreign.id.to_s

      expect(a_request(:get, %r{instances/FORA})).not_to have_been_made
      expect(a_request(:get, qr_url)).to have_been_made
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
