require "rails_helper"

RSpec.describe PushDevice do
  let(:account) { create(:account, role: "member") }

  it "é da pessoa, e não do vínculo: vale em todas as organizações dela" do
    device = create(:push_device, account: account)

    expect(device.user).to eq(account.user)
  end

  it "exige endpoint e as duas chaves" do
    device = build(:push_device, account: account, endpoint: "", p256dh_key: "", auth_key: "")

    expect(device).not_to be_valid
    expect(device.errors.attribute_names).to include(:endpoint, :p256dh_key, :auth_key)
  end

  it "não aceita o mesmo endpoint duas vezes" do
    existing = create(:push_device, account: account)

    expect(build(:push_device, account: account, endpoint: existing.endpoint)).not_to be_valid
  end

  it "limita o tamanho do endpoint" do
    expect(build(:push_device, account: account, endpoint: "https://push.exemplo.com.br/#{'a' * 2048}")).not_to be_valid
  end

  describe "endpoint" do
    %w[
      https://fcm.googleapis.com/fcm/send/abc
      https://updates.push.services.mozilla.com/wpush/v2/abc
      https://web.push.apple.com/abc
      https://wns2-par02p.notify.windows.com/w/?token=abc
    ].each do |endpoint|
      it "aceita o serviço de push #{endpoint}" do
        expect(build(:push_device, account: account, endpoint: endpoint)).to be_valid
      end
    end

    # O servidor dá POST nesse endereço: não pode virar acesso à rede interna.
    %w[
      http://fcm.googleapis.com/fcm/send/abc
      ftp://fcm.googleapis.com/abc
      https://localhost/abc
      https://app.localhost/abc
      https://10.0.0.5/abc
      https://192.168.0.1/abc
      https://169.254.169.254/latest/meta-data
      https://[::1]/abc
      https://[fd00::1]/abc
      https://redis.internal/abc
      https://impressora.local/abc
      https://servidor/abc
      não-é-url
    ].each do |endpoint|
      it "recusa #{endpoint}" do
        device = build(:push_device, account: account, endpoint: endpoint)

        expect(device).not_to be_valid
        expect(device.errors.attribute_names).to eq([ :endpoint ])
      end
    end
  end

  describe ".register!" do
    let(:attributes) { { endpoint: "https://fcm.googleapis.com/fcm/send/abc", p256dh_key: "p", auth_key: "a", user_agent: "Chrome" } }

    it "cria a assinatura" do
      device = described_class.register!(user: account.user, **attributes)

      expect(device).to be_persisted
      expect(device).to have_attributes(user: account.user, p256dh_key: "p", auth_key: "a", user_agent: "Chrome")
    end

    it "atualiza a assinatura do mesmo navegador, sem duplicar" do
      device = described_class.register!(user: account.user, **attributes)

      expect {
        described_class.register!(user: account.user, **attributes, p256dh_key: "nova")
      }.not_to change(described_class, :count)

      expect(device.reload.p256dh_key).to eq("nova")
    end

    it "troca o dono quando outra pessoa entra no mesmo navegador" do
      device = described_class.register!(user: account.user, **attributes)
      other = create(:account, role: "member")

      described_class.register!(user: other.user, **attributes)

      expect(device.reload).to have_attributes(user_id: other.user_id)
    end

    it "levanta o erro de validação" do
      expect {
        described_class.register!(user: account.user, **attributes, auth_key: "")
      }.to raise_error(ActiveRecord::RecordInvalid)
    end
  end
end
