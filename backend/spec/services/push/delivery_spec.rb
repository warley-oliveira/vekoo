require "rails_helper"

# Contra a gem de verdade: chaves VAPID e de assinatura geradas aqui, cifragem real, e a
# rede fechada pelo WebMock. É o que garante que o payload sai como o serviço de push espera.
RSpec.describe Push::Delivery do
  include ActiveJob::TestHelper
  include ActiveSupport::Testing::TimeHelpers

  let(:endpoint) { "https://fcm.googleapis.com/fcm/send/assinatura-de-teste" }
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, role: "member") }

  # Chaves de um navegador de verdade: curva P-256 e 16 bytes de segredo.
  let(:browser_key) { OpenSSL::PKey::EC.generate("prime256v1") }
  let(:p256dh) { WebPush.encode64(browser_key.public_key.to_bn.to_s(2)) }
  let(:auth) { WebPush.encode64(Random.urandom(16)) }
  let(:device) { create(:push_device, account: account, endpoint: endpoint, p256dh_key: p256dh, auth_key: auth) }

  let(:vapid) { WebPush.generate_key }
  let(:payload) { { "title" => "Novo agendamento", "body" => "Com Ana, às 14h" } }

  def configure_vapid
    ENV["VAPID_PUBLIC_KEY"] = vapid.public_key
    ENV["VAPID_PRIVATE_KEY"] = vapid.private_key
    ENV["VAPID_SUBJECT"] = "mailto:contato@exemplo.com.br"
  end

  around do |example|
    keys = %w[VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_SUBJECT]
    previous = keys.index_with { |key| ENV[key] }
    keys.each { |key| ENV.delete(key) }
    example.run
    previous.each { |key, value| ENV[key] = value }
  end

  describe ".configured?" do
    it "exige as três variáveis" do
      expect(described_class).not_to be_configured

      ENV["VAPID_PUBLIC_KEY"] = "publica"
      ENV["VAPID_PRIVATE_KEY"] = "privada"
      expect(described_class).not_to be_configured

      ENV["VAPID_SUBJECT"] = "mailto:contato@exemplo.com.br"
      expect(described_class).to be_configured
    end

    it "trata variável vazia como ausente" do
      ENV["VAPID_PUBLIC_KEY"] = ""
      ENV["VAPID_PRIVATE_KEY"] = "privada"
      ENV["VAPID_SUBJECT"] = "mailto:contato@exemplo.com.br"

      expect(described_class).not_to be_configured
      expect(described_class.public_key).to be_nil
    end
  end

  describe ".send_notification" do
    context "sem VAPID" do
      it "loga e não falha, e nada entra na fila" do
        device
        allow(Rails.logger).to receive(:warn)

        result = nil
        expect {
          result = described_class.send_notification(account, "Oi", "Tudo bem?")
        }.not_to have_enqueued_job(Push::DeliveryJob)

        expect(result).to eq(success: false, error: "notConfigured")
        expect(Rails.logger).to have_received(:warn).with(/VAPID/)
      end
    end

    context "com VAPID" do
      before { configure_vapid }

      it "enfileira um job por dispositivo, na fila padrão" do
        device
        other = create(:push_device, account: account)

        result = nil
        expect {
          result = described_class.send_notification(account, "Oi", "Tudo bem?")
        }.to have_enqueued_job(Push::DeliveryJob).on_queue("default").exactly(2).times

        expect(result).to eq(success: true, enqueued: 2)
        ids = enqueued_jobs.map { |job| ActiveJob::Arguments.deserialize(job["arguments"]).first }
        expect(ids).to contain_exactly(device.id, other.id)
      end

      it "aceita o e-mail, que é como o código reciclado da origem chama" do
        device

        expect {
          described_class.send_notification(" #{account.email.upcase} ", "Oi", "Tudo bem?")
        }.to have_enqueued_job(Push::DeliveryJob).once
      end

      it "só alcança os dispositivos daquela pessoa" do
        create(:push_device, account: create(:account, organization: organization, role: "member"))

        expect(described_class.send_notification(account, "Oi", "Tudo bem?"))
          .to eq(success: false, error: "noDevices")
      end

      it "responde noDevices para e-mail que não existe" do
        expect(described_class.send_notification("ninguem@exemplo.com.br", "Oi", "Tudo bem?"))
          .to eq(success: false, error: "noDevices")
      end

      it "não enfileira para quem foi revogado, mas mantém a assinatura" do
        device
        account.revoke!

        expect {
          expect(described_class.send_notification(account, "Oi", "Tudo bem?"))
            .to eq(success: false, error: "noDevices")
        }.not_to have_enqueued_job(Push::DeliveryJob)

        expect(PushDevice.exists?(device.id)).to be(true)
      end

      it "monta o payload no formato que o sw-push.js lê" do
        device

        freeze_time do
          described_class.send_notification(
            account, "Novo agendamento", "Com Ana, às 14h",
            url: "/calendar",
            tag: "agenda",
            actions: [ { action: "open_calendar", title: "Abrir agenda" } ],
            data: { bookingId: "42" }
          )

          _device_id, sent = ActiveJob::Arguments.deserialize(enqueued_jobs.last["arguments"])
          expect(sent).to eq(
            "title" => "Novo agendamento",
            "body" => "Com Ana, às 14h",
            "tag" => "agenda",
            "data" => { "url" => "/calendar", "timestamp" => Time.current.to_i, "bookingId" => "42" },
            "actions" => [ { "action" => "open_calendar", "title" => "Abrir agenda" } ],
            "requireInteraction" => false,
            "silent" => false,
            "vibrate" => [ 200, 100, 200 ]
          )
        end
      end

      # Sem ícone no payload, vale o padrão do service worker: quem sabe quais arquivos o
      # front publica é o front.
      it "só manda ícone quando alguém pediu" do
        device

        described_class.send_notification(account, "Oi", "Tudo bem?", icon: "/icone.png")

        _device_id, sent = ActiveJob::Arguments.deserialize(enqueued_jobs.last["arguments"])
        expect(sent).to include("icon" => "/icone.png")
        expect(sent).not_to have_key("badge")
      end

      it "corta o corpo para caber no limite do serviço de push" do
        device

        described_class.send_notification(account, "Oi", "x" * 2000)

        _device_id, sent = ActiveJob::Arguments.deserialize(enqueued_jobs.last["arguments"])
        expect(sent["body"].length).to eq(described_class::BODY_LIMIT)
      end
    end
  end

  describe ".deliver" do
    before { configure_vapid }

    it "entrega cifrado e assinado com VAPID" do
      stub = stub_request(:post, endpoint).to_return(status: 201)

      result = described_class.deliver(device, payload)

      expect(result).to include(success: true, response_code: "201")
      expect(stub.with { |request|
        request.headers["Authorization"].to_s.start_with?("vapid t=") &&
          request.headers["Content-Encoding"] == "aes128gcm" &&
          !request.body.include?("Novo agendamento")
      }).to have_been_requested
    end

    it "remove a assinatura expirada (410)" do
      stub_request(:post, endpoint).to_return(status: 410)

      result = described_class.deliver(device, payload)

      expect(result).to eq(success: false, error: "expired")
      expect(PushDevice.exists?(device.id)).to be(false)
    end

    it "remove a assinatura que não existe mais (404)" do
      stub_request(:post, endpoint).to_return(status: 404)

      result = described_class.deliver(device, payload)

      expect(result).to eq(success: false, error: "expired")
      expect(PushDevice.exists?(device.id)).to be(false)
    end

    # 401/403: as chaves VAPID mudaram. Apagar perderia assinaturas que voltam a valer
    # quando a configuração for corrigida.
    it "mantém a assinatura quando o serviço recusa a credencial" do
      stub_request(:post, endpoint).to_return(status: 403)

      result = described_class.deliver(device, payload)

      expect(result).to eq(success: false, error: "unauthorized")
      expect(PushDevice.exists?(device.id)).to be(true)
    end

    it "não tenta de novo o que daria o mesmo erro (413)" do
      stub_request(:post, endpoint).to_return(status: 413)

      expect(described_class.deliver(device, payload)).to eq(success: false, error: "payloadTooLarge")
      expect(PushDevice.exists?(device.id)).to be(true)
    end

    it "deixa subir o erro passageiro, para o job tentar de novo" do
      stub_request(:post, endpoint).to_return(status: 503)

      expect { described_class.deliver(device, payload) }.to raise_error(WebPush::PushServiceError)
      expect(PushDevice.exists?(device.id)).to be(true)
    end

    it "não entrega a quem foi revogado entre enfileirar e rodar" do
      stub = stub_request(:post, endpoint)
      device
      account.revoke!

      expect(described_class.deliver(device, payload)).to eq(success: false, error: "revoked")
      expect(stub).not_to have_been_requested
    end

    it "sem VAPID, loga e não falha" do
      ENV.delete("VAPID_PRIVATE_KEY")
      stub = stub_request(:post, endpoint)

      expect(described_class.deliver(device, payload)).to eq(success: false, error: "notConfigured")
      expect(stub).not_to have_been_requested
    end
  end
end
