require "rails_helper"

RSpec.describe Agenda::ProfessionalWhatsappNotifier do
  include ConnectorHelpers

  let(:organization) { create(:organization, name: "Clínica Vida") }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:calendar) { create(:agenda_calendar, organization: organization) }
  let(:professional) { create(:agenda_professional, calendar: calendar, name: "Dra. Ana", phone: "5531983794137") }
  let(:chat) { create(:chat, organization_id: organization.id, connector: connector, user_name: "Maria", external_id: "5531971810932") }
  let(:booking) do
    create(:agenda_booking, calendar: calendar, professional: professional, chat: chat, skip_professional_notifications: true,
           start: calendar.zone.local(2030, 1, 14, 22, 30), end: calendar.zone.local(2030, 1, 14, 23, 30))
  end

  def notify(template: "Oi {{profissional}}, {{nome}} às {{hora}}")
    described_class.new(booking, template: template, label: "Agenda: novo agendamento").call
  end

  before { allow_any_instance_of(Connector::WhatsappWeb).to receive(:send_text_message).and_return("EXT-1") }

  it "envia pelo canal da conversa, com as variáveis preenchidas no fuso do calendário" do
    message = notify

    expect(message.content).to eq("Oi Dra. Ana, Maria às 22:30")
    expect(message.sender_name).to eq("Clínica Vida [Agenda: novo agendamento]")
  end

  it "abre a conversa do profissional com a automação desligada" do
    notify

    created = Chat.where(connector_id: connector.id, external_id: "5531983794137").take
    expect(created).to have_attributes(user_name: "Dra. Ana", automation_enabled: false)
  end

  it "etiqueta a conversa como de profissional" do
    notify

    created = Chat.where(connector_id: connector.id, external_id: "5531983794137").take
    expect(created.chat_tags.map(&:name)).to eq([ "profissional" ])
  end

  it "reusa a conversa que já existe, cobrindo o 9º dígito, sem mexer na automação" do
    existing = create(:chat, organization_id: organization.id, connector: connector, external_id: "553183794137", automation_enabled: true)

    expect { notify }.to change { Chat.where(connector_id: connector.id, user_name: "Dra. Ana").count }.by(0)

    expect(existing.reload.automation_enabled).to be(true)
    expect(existing.chat_tag_ids).not_to be_empty
  end

  it "prefere o canal do calendário ao da conversa" do
    chosen = create(:connector_whatsapp_web, organization: organization)
    calendar.update!(professional_whatsapp_connector_id: chosen.id.to_s)

    notify

    expect(Chat.where(connector_id: chosen.id, external_id: "5531983794137")).to exist
  end

  it "não envia quando o único canal é a API oficial" do
    chat.update!(connector: create(:connector_whatsapp_cloud, organization: organization))

    expect(notify).to be_nil
    expect(Chat.where(external_id: "5531983794137")).not_to exist
  end

  it "não envia sem telefone utilizável" do
    professional.update!(phone: "319")

    expect(notify).to be_nil
  end

  it "não envia sem profissional" do
    booking.update!(professional_id: nil)

    expect(notify).to be_nil
  end

  it "não escreve na conversa do cliente quando o número é o mesmo" do
    professional.update!(phone: "5531971810932")

    expect(notify).to be_nil
    expect(ChatMessage::Base.unscoped.where(chat_id: chat.id)).not_to exist
  end

  it "não envia texto vazio" do
    expect(notify(template: "")).to be_nil
  end

  it "engole a falha do canal: a mensagem já ficou marcada na conversa" do
    allow_any_instance_of(Connector::WhatsappWeb).to receive(:send_text_message).and_raise("canal fora do ar")

    expect(notify).to be_nil

    created = Chat.where(connector_id: connector.id, external_id: "5531983794137").take
    message = ChatMessage::Base.unscoped.where(chat_id: created.id).take
    expect(message).to have_attributes(status: "failed", status_message: "canal fora do ar")
  end
end
