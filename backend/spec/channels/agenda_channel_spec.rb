require "rails_helper"

RSpec.describe AgendaChannel, type: :channel do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }

  before { stub_connection(current_account: account) }

  it "assina a stream da organização" do
    subscribe

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_from("org:#{organization.id}:agenda")
  end

  it "recusa quem não tem o recurso calendar" do
    role = create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS)
    stub_connection(current_account: create(:account, organization: organization, role: "member", access_role: role))

    subscribe

    expect(subscription).to be_rejected
  end

  it "um soluço no Redis não derruba quem transmite" do
    allow(ActionCable.server).to receive(:broadcast).and_raise(RedisClient::CannotConnectError)

    expect { described_class.broadcast_event(organization.id, { action: "create" }) }.not_to raise_error
  end

  it "transmite o agendamento inteiro, na stream de quem é dono" do
    calendar = create(:agenda_calendar, organization: organization)
    booking = create(:agenda_booking, calendar: calendar, skip_professional_notifications: true)

    expect { described_class.broadcast_booking(booking, :update) }
      .to have_broadcasted_to("org:#{organization.id}:agenda")
      .with(hash_including(action: "update", type: "booking", event: hash_including(id: booking.id.to_s, start: booking.start.to_i * 1000)))
  end
end
