require "rails_helper"

RSpec.describe Push::DeliveryJob do
  include ActiveJob::TestHelper

  let(:endpoint) { "https://fcm.googleapis.com/fcm/send/assinatura-do-job" }
  let(:browser_key) { OpenSSL::PKey::EC.generate("prime256v1") }
  let(:device) do
    create(
      :push_device,
      account: create(:account, role: "member"),
      endpoint: endpoint,
      p256dh_key: WebPush.encode64(browser_key.public_key.to_bn.to_s(2)),
      auth_key: WebPush.encode64(Random.urandom(16))
    )
  end
  let(:payload) { { "title" => "Oi", "body" => "Tudo bem?" } }

  around do |example|
    keys = %w[VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT]
    previous = keys.index_with { |key| ENV[key] }
    vapid = WebPush.generate_key
    ENV["VAPID_PUBLIC_KEY"] = vapid.public_key
    ENV["VAPID_PRIVATE_KEY"] = vapid.private_key
    ENV["VAPID_SUBJECT"] = "mailto:contato@exemplo.com.br"
    example.run
    previous.each { |key, value| ENV[key] = value }
  end

  it "entrega" do
    stub = stub_request(:post, endpoint).to_return(status: 201)

    described_class.perform_now(device.id, payload)

    expect(stub).to have_been_requested
  end

  it "não faz nada se o dispositivo sumiu entre enfileirar e rodar" do
    expect { described_class.perform_now(SecureRandom.uuid, payload) }.not_to raise_error
  end

  { "429" => 429, "500" => 500 }.each do |name, status|
    it "agenda nova tentativa em caso de #{name}" do
      stub_request(:post, endpoint).to_return(status: status)

      expect { described_class.perform_now(device.id, payload) }
        .to have_enqueued_job(described_class).with(device.id, payload)
    end
  end

  it "agenda nova tentativa quando o tempo se esgota" do
    stub_request(:post, endpoint).to_timeout

    expect { described_class.perform_now(device.id, payload) }
      .to have_enqueued_job(described_class).with(device.id, payload)
  end

  it "não agenda nova tentativa quando a assinatura expirou" do
    stub_request(:post, endpoint).to_return(status: 410)

    expect { described_class.perform_now(device.id, payload) }.not_to have_enqueued_job(described_class)
    expect(PushDevice.exists?(device.id)).to be(false)
  end

  it "desiste sem erro depois da última tentativa: push perdido não vai para a fila de mortos" do
    stub_request(:post, endpoint).to_return(status: 500)
    allow(Rails.logger).to receive(:warn)

    job = described_class.new(device.id, payload)
    job.exception_executions = { described_class::TRANSIENT_ERRORS.to_s => 4 }

    expect { job.perform_now }.not_to raise_error
    expect(Rails.logger).to have_received(:warn).with(/desisti/)
  end
end
