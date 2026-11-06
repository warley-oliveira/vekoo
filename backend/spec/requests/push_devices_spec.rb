require "rails_helper"

RSpec.describe "Dispositivos de push", type: :request do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, role: "member") }
  let(:colleague) { create(:account, organization: organization, role: "member") }
  let(:stranger) { create(:account, organization: create(:organization)) }
  let(:headers) { auth_headers(account) }

  let(:subscription) do
    {
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      expirationTime: nil,
      keys: { p256dh: "chave-publica", auth: "segredo" }
    }
  end

  # As chaves de verdade só são lidas ao assinar a requisição: aqui basta estarem presentes.
  def with_vapid(&)
    keys = WebPush.generate_key
    env = {
      "VAPID_PUBLIC_KEY" => keys.public_key,
      "VAPID_PRIVATE_KEY" => keys.private_key,
      "VAPID_SUBJECT" => "mailto:contato@exemplo.com.br"
    }
    previous = env.keys.index_with { |key| ENV[key] }
    env.each { |key, value| ENV[key] = value }
    yield keys
  ensure
    previous.each { |key, value| ENV[key] = value }
  end

  around do |example|
    keys = %w[VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT]
    previous = keys.index_with { |key| ENV[key] }
    keys.each { |key| ENV.delete(key) }
    example.run
    previous.each { |key, value| ENV[key] = value }
  end

  it "exige sessão em todas as rotas" do
    get "/push-devices"
    expect(response).to have_http_status(:unauthorized)

    post "/push-devices", params: { subscription: subscription }, as: :json
    expect(response).to have_http_status(:unauthorized)

    get "/push-devices/vapid-public-key"
    expect(response).to have_http_status(:unauthorized)

    post "/push-devices/test"
    expect(response).to have_http_status(:unauthorized)

    delete "/push-devices"
    expect(response).to have_http_status(:unauthorized)

    delete "/push-devices/#{SecureRandom.uuid}"
    expect(response).to have_http_status(:unauthorized)
  end

  describe "GET /push-devices" do
    it "lista só os dispositivos de quem pergunta, sem as chaves" do
      mine = create(:push_device, account: account)
      create(:push_device, account: colleague)

      get "/push-devices", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["pushDevices"].map { |d| d["id"] }).to eq([ mine.id ])
      expect(json["pushDevices"].first.keys).to contain_exactly("id", "endpoint", "userAgent", "createdAt")
      expect(json["meta"]).to include("total" => 1)
    end
  end

  describe "POST /push-devices" do
    it "guarda a assinatura que o navegador entrega" do
      post "/push-devices",
        params: { subscription: subscription },
        headers: headers.merge("User-Agent" => "Chrome de teste"), as: :json

      expect(response).to have_http_status(:created)
      device = account.push_devices.sole
      expect(device).to have_attributes(
        endpoint: subscription[:endpoint],
        p256dh_key: "chave-publica",
        auth_key: "segredo",
        user_agent: "Chrome de teste",
        organization_id: organization.id
      )
      expect(json).to include("id" => device.id, "endpoint" => subscription[:endpoint], "userAgent" => "Chrome de teste")
    end

    it "não duplica quando o mesmo navegador assina de novo, e atualiza as chaves" do
      device = create(:push_device, account: account, endpoint: subscription[:endpoint], p256dh_key: "antiga")

      expect {
        post "/push-devices", params: { subscription: subscription }, headers: headers, as: :json
      }.not_to change(PushDevice, :count)

      expect(response).to have_http_status(:created)
      expect(device.reload.p256dh_key).to eq("chave-publica")
    end

    it "passa a assinatura para quem entrou agora no mesmo navegador" do
      device = create(:push_device, account: colleague, endpoint: subscription[:endpoint])

      post "/push-devices", params: { subscription: subscription }, headers: headers, as: :json

      expect(device.reload.account).to eq(account)
    end

    it "passa a assinatura também entre organizações" do
      device = create(:push_device, account: stranger, endpoint: subscription[:endpoint])

      post "/push-devices", params: { subscription: subscription }, headers: headers, as: :json

      expect(device.reload).to have_attributes(account_id: account.id, organization_id: organization.id)
    end

    it "responde 400 sem a assinatura" do
      post "/push-devices", params: { outra: "coisa" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "field")).to eq("subscription")
    end

    it "responde 400 se a assinatura não for um objeto" do
      post "/push-devices", params: { subscription: "texto" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
    end

    it "responde 422 sem as chaves" do
      post "/push-devices", params: { subscription: { endpoint: subscription[:endpoint] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "details").keys).to contain_exactly("p256dhKey", "authKey")
    end

    it "responde 422 sem o endpoint" do
      post "/push-devices", params: { subscription: { keys: subscription[:keys] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("endpoint")
    end

    # O servidor dá POST nesse endereço: não pode virar uma forma de alcançar a rede interna.
    [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://localhost/assinatura",
      "https://127.0.0.1/assinatura",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/assinatura",
      "https://redis.internal/assinatura",
      "https://servidor/assinatura",
      "isto não é uma url"
    ].each do |endpoint|
      it "recusa o endpoint #{endpoint}" do
        expect {
          post "/push-devices",
            params: { subscription: subscription.merge(endpoint: endpoint) },
            headers: headers, as: :json
        }.not_to change(PushDevice, :count)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "field")).to eq("endpoint")
      end
    end
  end

  describe "DELETE /push-devices/:id" do
    it "remove o dispositivo" do
      device = create(:push_device, account: account)

      delete "/push-devices/#{device.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(PushDevice.exists?(device.id)).to be(false)
    end

    it "responde 404 para dispositivo de um colega" do
      device = create(:push_device, account: colleague)

      delete "/push-devices/#{device.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(PushDevice.exists?(device.id)).to be(true)
    end

    it "responde 404 para dispositivo de outra organização" do
      device = create(:push_device, account: stranger)

      delete "/push-devices/#{device.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(PushDevice.exists?(device.id)).to be(true)
    end
  end

  describe "DELETE /push-devices" do
    it "com endpoint, remove só aquela assinatura" do
      device = create(:push_device, account: account)
      other = create(:push_device, account: account)

      delete "/push-devices", params: { endpoint: device.endpoint }, headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(PushDevice.exists?(device.id)).to be(false)
      expect(PushDevice.exists?(other.id)).to be(true)
    end

    it "sem endpoint, remove todas as da pessoa e nenhuma de outra" do
      create_list(:push_device, 2, account: account)
      foreign = create(:push_device, account: colleague)

      delete "/push-devices", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(account.push_devices).to be_empty
      expect(PushDevice.exists?(foreign.id)).to be(true)
    end

    it "não remove a assinatura de outra pessoa pelo endpoint" do
      foreign = create(:push_device, account: colleague)

      delete "/push-devices", params: { endpoint: foreign.endpoint }, headers: headers, as: :json

      expect(PushDevice.exists?(foreign.id)).to be(true)
    end
  end

  describe "GET /push-devices/vapid-public-key" do
    it "entrega a chave pública" do
      with_vapid do |keys|
        get "/push-devices/vapid-public-key", headers: headers

        expect(response).to have_http_status(:ok)
        expect(json).to eq("publicKey" => keys.public_key)
      end
    end

    it "responde null sem configuração: a tela esconde a opção" do
      get "/push-devices/vapid-public-key", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to eq("publicKey" => nil)
    end
  end

  describe "POST /push-devices/test" do
    it "enfileira uma entrega por dispositivo, com o texto no idioma da requisição" do
      devices = create_list(:push_device, 2, account: account)

      with_vapid do
        expect {
          post "/push-devices/test", headers: headers.merge("Accept-Language" => "en")
        }.to have_enqueued_job(Push::DeliveryJob).exactly(2).times

        expect(response).to have_http_status(:accepted)
        expect(json).to eq("enqueued" => 2)

        job = enqueued_jobs.find { |candidate| candidate["job_class"] == "Push::DeliveryJob" }
        device_id, payload = ActiveJob::Arguments.deserialize(job["arguments"])
        expect(devices.map(&:id)).to include(device_id)
        expect(payload).to include("title" => "Test notification", "tag" => "test")
      end
    end

    it "aceita título, corpo e url próprios" do
      create(:push_device, account: account)

      with_vapid do
        post "/push-devices/test", params: { title: "Oi", body: "Tudo bem?", url: "/chat" }, headers: headers, as: :json

        job = enqueued_jobs.find { |candidate| candidate["job_class"] == "Push::DeliveryJob" }
        _device_id, payload = ActiveJob::Arguments.deserialize(job["arguments"])
        expect(payload).to include("title" => "Oi", "body" => "Tudo bem?")
        expect(payload["data"]).to include("url" => "/chat")
      end
    end

    it "responde 422 se a pessoa não tem dispositivo" do
      create(:push_device, account: colleague)

      with_vapid do
        post "/push-devices/test", headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("noPushDevices")
      end
    end

    it "responde 422 sem VAPID, e nada entra na fila" do
      create(:push_device, account: account)
      headers

      expect {
        post "/push-devices/test", headers: headers
      }.not_to have_enqueued_job(Push::DeliveryJob)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("pushNotConfigured")
    end
  end
end
