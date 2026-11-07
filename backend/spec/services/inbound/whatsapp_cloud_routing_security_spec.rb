require "rails_helper"

# O webhook de aplicativo da Meta é um só, e o `entry.id` diz de qual WABA é o evento. Só que `wabaId` é
# escrito por quem cria o conector, e a ativação que falha deixa o conector lá. Quem cadastrasse o WABA de
# outra organização antes dela recebia as mensagens dela. O estado não serve de prova: `pause` e depois
# `activate` levam qualquer conector a `active`, sem falar com a Meta.
RSpec.describe "Roteamento do webhook da WABA entre organizações" do
  include InboundHelpers

  let(:waba_id) { 102_030_405_060_708 }
  let(:url_connector) { create(:connector_whatsapp_cloud, organization: create(:organization), status: :active) }
  let(:victim_organization) { create(:organization) }
  let(:attacker_organization) { create(:organization) }

  def message_for(entry_id)
    webhook_payload(
      entry: [ {
        id: entry_id.to_s,
        changes: [ {
          value: {
            metadata: { phone_number_id: "555" },
            contacts: [ { wa_id: "5531971810932", profile: { name: "Cliente" } } ],
            messages: [ { id: "WAMID-1", from: "5531971810932", type: "text", text: { body: "meu pedido" } } ]
          }
        } ]
      } ]
    )
  end

  before { allow(Flows::InboundDispatcher).to receive(:call) }

  def receive_at_shared_url(entry_id)
    Inbound::WhatsappCloudEvents.new(message_for(entry_id), connector: url_connector).call
  end

  # O cadastro de quem ataca vem primeiro: é o que `.take` devolveria.
  it "conector que a Meta não confirmou não recebe as mensagens de um WABA" do
    attacker = create(:connector_whatsapp_cloud, organization: attacker_organization, waba_id: waba_id, status: :failed, waba_verified_at: nil)
    victim = create(:connector_whatsapp_cloud, organization: victim_organization, waba_id: waba_id, status: :active)

    receive_at_shared_url(waba_id)

    expect(Chat.where(connector_id: attacker.id).exists?).to be(false)
    expect(Chat.where(connector_id: victim.id).exists?).to be(true)
  end

  it "pausar e reativar o próprio conector não faz dele o dono do WABA" do
    attacker = create(:connector_whatsapp_cloud, organization: attacker_organization, waba_id: waba_id, status: :failed, waba_verified_at: nil)
    victim = create(:connector_whatsapp_cloud, organization: victim_organization, waba_id: waba_id, status: :active)

    attacker.update!(status: :paused)
    attacker.update!(status: :active)
    receive_at_shared_url(waba_id)

    expect(Chat.where(connector_id: attacker.id).exists?).to be(false)
    expect(Chat.where(connector_id: victim.id).exists?).to be(true)
  end

  it "o mesmo com business_id" do
    attacker = create(:connector_whatsapp_cloud, organization: attacker_organization, waba_id: nil, business_id: waba_id, status: :failed, waba_verified_at: nil)
    victim = create(:connector_whatsapp_cloud, organization: victim_organization, waba_id: nil, business_id: waba_id, status: :active)

    receive_at_shared_url(waba_id)

    expect(Chat.where(connector_id: attacker.id).exists?).to be(false)
    expect(Chat.where(connector_id: victim.id).exists?).to be(true)
  end

  # Quem tem um WABA de verdade e se declara dono do business de outro.
  it "business_id declarado por quem provou outro WABA não vale" do
    attacker = create(:connector_whatsapp_cloud, organization: attacker_organization, waba_id: 999, business_id: waba_id, status: :active)
    victim = create(:connector_whatsapp_cloud, organization: victim_organization, waba_id: nil, business_id: waba_id, status: :active)

    receive_at_shared_url(waba_id)

    expect(Chat.where(connector_id: attacker.id).exists?).to be(false)
    expect(Chat.where(connector_id: victim.id).exists?).to be(true)
  end

  it "o canal fechado ou pausado continua sendo o dono do WABA" do
    create(:connector_whatsapp_cloud, organization: attacker_organization, waba_id: waba_id, status: :failed, waba_verified_at: nil)
    victim = create(:connector_whatsapp_cloud, organization: victim_organization, waba_id: waba_id, status: :closed)

    events = Inbound::WhatsappCloudEvents.new(message_for(waba_id), connector: url_connector)
    events.call

    expect(events.send(:connector)).to eq(victim)
  end
end
