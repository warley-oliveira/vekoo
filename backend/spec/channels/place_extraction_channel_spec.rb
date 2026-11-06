require "rails_helper"

RSpec.describe PlaceExtractionChannel, type: :channel do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:own_stream) { described_class.organization_stream(organization.id, described_class::STREAM) }

  it "assina a stream da própria organização" do
    stub_connection current_account: owner

    subscribe

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_from(own_stream)
  end

  # O parâmetro não muda a stream: um id trocado nunca alcança outra organização.
  it "ignora qualquer organização pedida no parâmetro" do
    other = create(:organization)
    stub_connection current_account: owner

    subscribe(organization_id: other.id)

    expect(subscription).to have_stream_from(own_stream)
    expect(subscription).not_to have_stream_from(described_class.organization_stream(other.id, described_class::STREAM))
  end

  it "recusa quem não tem a permissão de campanhas" do
    role = create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS)
    stub_connection current_account: create(:account, organization: organization, role: "member", access_role: role)

    subscribe

    expect(subscription).to be_rejected
  end

  it "para de ouvir ao sair" do
    stub_connection current_account: owner
    subscribe

    unsubscribe

    expect(subscription).not_to have_streams
  end

  describe "os eventos" do
    let(:extraction) { create(:outreach_place_extraction, :completed, organization: organization) }

    it "`status_update`, em camelCase" do
      expect { described_class.broadcast_status(extraction) }.to have_broadcasted_to(own_stream).with(
        action: "status_update",
        data: hash_including(id: extraction.id.to_s, status: "completed", searchQuery: "padaria", location: "Curitiba, PR", resultsCount: 1, durationSeconds: 60.0)
      )
    end

    it "`extraction_completed`" do
      expect { described_class.broadcast_completed(extraction) }.to have_broadcasted_to(own_stream).with(
        hash_including(action: "extraction_completed", data: hash_including(id: extraction.id.to_s))
      )
    end

    it "um soluço no Redis não derruba a extração" do
      allow(ActionCable.server).to receive(:broadcast).and_raise(Redis::CannotConnectError)

      expect { described_class.broadcast_status(extraction) }.not_to raise_error
    end
  end
end
