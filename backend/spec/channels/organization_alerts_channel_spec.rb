require "rails_helper"

RSpec.describe OrganizationAlertsChannel, type: :channel do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, role: "member") }

  before { stub_connection current_account: account }

  it "assina a stream da organização da sessão" do
    subscribe

    expect(subscription).to be_confirmed
    expect(subscription).to have_stream_from("org:#{organization.id}:alerts")
  end

  it "ignora qualquer organização que venha no subscribe" do
    other = create(:organization)

    subscribe(organization_id: other.id, workspace_id: other.id)

    expect(subscription).not_to have_stream_from("org:#{other.id}:alerts")
    expect(subscription).to have_stream_from("org:#{organization.id}:alerts")
  end

  it "transmite os badges ao assinar, já sem alerta de outra organização" do
    create(:organization_alert, organization: organization, category: "connectors")
    create(:organization_alert, organization: create(:organization), category: "webhooks")

    subscribe

    expect(transmissions.last).to eq("badges" => { "connectors" => 1 })
  end

  it "transmite os badges novos quando um alerta nasce" do
    expect {
      OrganizationAlert.raise_alert!(
        organization, category: "webhooks", origin_type: "Hook", origin_id: "1", code: "webhook_delivery_failed"
      )
    }.to have_broadcasted_to("org:#{organization.id}:alerts").with(badges: { "webhooks" => 1 })
  end
end
