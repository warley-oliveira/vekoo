require "rails_helper"

RSpec.describe Hooks::SignatureVerifier do
  let(:hook) { create(:hook) }
  let!(:secret) { hook.rotate_signing_secret! }
  let(:now) { Time.zone.parse("2026-11-06 12:00:00") }
  let(:timestamp) { now.to_i }
  let(:body) { '{"a":1, "b": 2}' }

  def verify(timestamp: self.timestamp, signature: described_class.signature_for(secret, timestamp, body), raw_body: body)
    described_class.new(hook, timestamp: timestamp, signature: signature, raw_body: raw_body, now: now).call
  end

  it "aceita a assinatura certa, e hex maiúsculo também" do
    expect(verify).to be_valid
    expect(verify(signature: described_class.signature_for(secret, timestamp, body).upcase.sub("SHA256", "sha256"))).to be_valid
  end

  it "recusa quando o corpo mudou um byte" do
    result = verify(raw_body: '{"a":1,"b":2}')

    expect(result).not_to be_valid
    expect(result.code).to eq(:invalidSignature)
  end

  it "recusa o timestamp trocado, porque ele entra no HMAC" do
    expect(verify(signature: described_class.signature_for(secret, timestamp - 10, body)).code).to eq(:invalidSignature)
  end

  it "recusa a requisição antiga e a do futuro, além da tolerância" do
    old = timestamp - described_class::TOLERANCE.to_i - 1
    future = timestamp + described_class::TOLERANCE.to_i + 1

    expect(verify(timestamp: old).code).to eq(:expiredTimestamp)
    expect(verify(timestamp: future).code).to eq(:expiredTimestamp)
  end

  it "aceita dentro da tolerância" do
    expect(verify(timestamp: timestamp - described_class::TOLERANCE.to_i)).to be_valid
  end

  it "diz o que faltou" do
    expect(verify(signature: nil).code).to eq(:missingSignature)
    expect(verify(timestamp: nil, signature: "sha256=#{'a' * 64}").code).to eq(:missingTimestamp)
    expect(verify(signature: "abc").code).to eq(:malformedSignature)
    expect(verify(timestamp: "ontem", signature: "sha256=#{'a' * 64}").code).to eq(:invalidTimestamp)
  end

  it "sem segredo configurado, recusa" do
    hook.update!(signing_secret_ciphertext: nil)

    expect(verify.code).to eq(:missingSecret)
  end

  it "assina com a chave certa, e a chave anterior para de valer na renovação" do
    old = secret
    hook.rotate_signing_secret!

    expect(verify(signature: described_class.signature_for(old, timestamp, body))).not_to be_valid
  end
end
