require "rails_helper"

RSpec.describe ProductImportChannel, type: :channel do
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
    stub_connection current_account: owner
    other = create(:organization)

    subscribe(organization_id: other.id)

    expect(subscription).to have_stream_from(own_stream)
    expect(subscription).not_to have_stream_from(described_class.organization_stream(other.id, described_class::STREAM))
  end

  it "recusa quem não tem o recurso catalog" do
    role = create(:access_role, organization: organization, permissions: AccessRole::KEYS.index_with("none"))
    stub_connection current_account: create(:account, organization: organization, role: "member", access_role: role)

    subscribe

    expect(subscription).to be_rejected
  end

  it "aceita membro com o recurso catalog" do
    role = create(:access_role, :member, organization: organization)
    stub_connection current_account: create(:account, organization: organization, role: "member", access_role: role)

    subscribe

    expect(subscription).to be_confirmed
  end

  it "para de ouvir ao sair" do
    stub_connection current_account: owner
    subscribe

    unsubscribe

    expect(subscription).not_to have_streams
  end

  describe ".broadcast_event" do
    it "publica na stream da organização, no formato do contrato" do
      expect { described_class.broadcast_event(organization.id, "progress", { importId: "x", processed: 1 }) }
        .to have_broadcasted_to(own_stream).with(action: "progress", data: { importId: "x", processed: 1 })
    end
  end
end
