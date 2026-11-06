require "rails_helper"

RSpec.describe InstancesReloadJobs do
  let(:organization) { create(:organization) }

  def restart_url(connector)
    "http://evolution.test/instance/restart/#{connector.instance_name}"
  end

  def evolution(**attributes)
    create(:connector_whatsapp_web, organization: organization, **attributes)
  end

  it "recarrega as instâncias ativas" do
    first = evolution
    second = evolution
    restarts = [ first, second ].map { |connector| stub_request(:put, restart_url(connector)).to_return(status: 200, body: "{}") }

    described_class.perform_now

    expect(restarts).to all(have_been_requested)
  end

  it "não recarrega instância que não está ativa" do
    paused = evolution
    paused.set(status_cd: "paused")

    described_class.perform_now

    expect(a_request(:put, restart_url(paused))).not_to have_been_made
  end

  it "uma instância que falha não impede as outras" do
    broken = evolution
    healthy = evolution
    stub_request(:put, restart_url(broken)).to_return(status: 500, body: "fora do ar")
    restart = stub_request(:put, restart_url(healthy)).to_return(status: 200, body: "{}")

    expect { described_class.perform_now }.not_to raise_error

    expect(restart).to have_been_requested
  end

  it "uma instância fora da rede não impede as outras" do
    broken = evolution
    healthy = evolution
    stub_request(:put, restart_url(broken)).to_timeout
    restart = stub_request(:put, restart_url(healthy)).to_return(status: 200, body: "{}")

    described_class.perform_now

    expect(restart).to have_been_requested
  end

  it "só mexe em conector de WhatsApp Web" do
    create(:connector_whatsapp_cloud, organization: organization)

    expect { described_class.perform_now }.not_to raise_error
  end

  it "fica na fila low" do
    expect(described_class.new.queue_name).to eq("low")
  end

  it "fica desligado na agenda, como na origem" do
    schedule = YAML.load_file(Rails.root.join("config/schedule/connectors.yml"))

    expect(schedule["instances_reload"]).to include("class" => described_class.name, "enabled" => false)
  end
end
