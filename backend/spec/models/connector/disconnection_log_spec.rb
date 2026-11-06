require "rails_helper"

RSpec.describe Connector::DisconnectionLog do
  let(:organization) { create(:organization, name: "Loja da Ana") }
  let(:connector) do
    create(:connector_whatsapp_web, :zapi, organization: organization, instance_name: "IWA-1", profile_name: "Ana", number_id: "5531971810932")
  end

  def record(target = connector, payload: {})
    described_class.record!(connector: target, raw_error: "bloqueio", translated_reason: "Bloqueio do número", payload: payload)
  end

  describe ".record!" do
    it "tira um retrato do conector e da organização naquele momento" do
      log = record

      expect(log).to have_attributes(
        connector_id: connector.id.to_s,
        instance_name: "IWA-1",
        instance_id: "INST123",
        phone_number: "5531971810932",
        profile_name: "Ana",
        organization_id: organization.id,
        organization_name: "Loja da Ana",
        raw_error: "bloqueio",
        translated_reason: "Bloqueio do número"
      )
    end

    it "expira em um ano" do
      expect(record.expires_at).to be_within(1.minute).of(1.year.from_now)
    end

    it "guarda do payload só os campos de auditoria" do
      payload = { "type" => "DisconnectedCallback", "instanceId" => "I", "phone" => "553", "momment" => 123, "disconnected" => true, "error" => "x", "senha" => "segredo" }

      expect(record(payload: payload).payload_snapshot).to eq(payload.except("senha"))
    end

    it "fica no banco" do
      log = record

      expect(described_class.where(connector_id: connector.id.to_s).take).to eq(log)
    end

    it "funciona no conector de Z-API própria" do
      zapi = create(:connector_zapi, organization: organization, instance_id: "ZINST", phone_number: "553199999999", profile_name: "Padaria")

      expect(record(zapi)).to have_attributes(instance_id: "ZINST", phone_number: "553199999999", profile_name: "Padaria")
    end

    it "diz de que tipo é o conector" do
      expect(record.connector_type).to eq("whatsapp_web")
      expect(record(create(:connector_zapi, organization: organization)).connector_type).to eq("zapi")
    end

    it "cai no número de pareamento sem número conectado" do
      pairing = create(:connector_whatsapp_web, organization: organization, number_id: nil, phone_number_pairing: "5531888888888")

      expect(record(pairing).phone_number).to eq("5531888888888")
    end

    it "cai no id do conector sem id de instância" do
      evolution = create(:connector_whatsapp_web, organization: organization)

      expect(record(evolution).instance_id).to eq(evolution.id.to_s)
    end

    it "não derruba quem chamou se a gravação falhar: o aviso importa mais que o log" do
      allow(described_class).to receive(:create!).and_raise(Mongo::Error::SocketError, "fora do ar")

      expect { record }.not_to raise_error
    end
  end

  it "tem índice de expiração, que é o que apaga o histórico" do
    expiry = described_class.index_specifications.find { |spec| spec.key == { expires_at: 1 } }

    expect(expiry.options).to include(expire_after: 0)
  end
end
