require "rails_helper"

RSpec.describe InstagramGraph::TokenStatus do
  around { |example| with_instagram_env { example.run } }
  before { described_class.reset! }

  let(:now) { Time.zone.parse("2026-10-28 12:00") }

  def status(data)
    transport, @calls = ig_transport(debug_token: { "data" => data })
    described_class.call(client: InstagramGraph::Client.new(transport: transport), now: now)
  end

  def seconds(time) = time.to_i

  it "usuário do sistema: não vence" do
    result = status("is_valid" => true, "expires_at" => 0, "scopes" => %w[instagram_basic instagram_manage_insights pages_read_engagement])

    expect(result).to eq(state: "ok", missingScopes: [])
  end

  it "avisa a 14 dias do vencimento — do token ou do acesso aos dados" do
    expect(status("is_valid" => true, "expires_at" => seconds(now + 10.days))[:state]).to eq("expiring")
    described_class.reset!
    result = status("is_valid" => true, "expires_at" => seconds(now + 50.days), "data_access_expires_at" => seconds(now + 5.days))
    expect(result[:state]).to eq("expiring")
    expect(result[:dataAccessExpiresAt]).to eq(seconds(now + 5.days) * 1000)
  end

  it "vencido ou revogado é inválido" do
    expect(status("is_valid" => false)[:state]).to eq("invalid")
    described_class.reset!
    expect(status("is_valid" => true, "expires_at" => seconds(now - 1.day))[:state]).to eq("invalid")
  end

  it "aponta permissão que falta" do
    expect(status("is_valid" => true, "scopes" => %w[instagram_basic])[:missingScopes]).to eq(%w[instagram_manage_insights pages_read_engagement])
  end

  it "consulta o Meta no máximo uma vez por hora" do
    transport, calls = ig_transport(debug_token: { "data" => { "is_valid" => true } })
    client = InstagramGraph::Client.new(transport: transport)

    2.times { described_class.call(client: client, now: now) }
    expect(calls.length).to eq(1)
  end

  it "falha de rede não vira inválido" do
    transport, = ig_transport(debug_token: ig_error(1, status: 500))

    expect(described_class.call(client: InstagramGraph::Client.new(transport: transport), now: now)).to eq(state: "unknown")
  end

  it "sem configuração, nem consulta" do
    with_instagram_env("META_ACCESS_TOKEN" => nil) { expect(described_class.call[:state]).to eq("notConfigured") }
  end
end
