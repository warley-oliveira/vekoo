require "rails_helper"

RSpec.describe InstagramTokenRefreshJob do
  let(:organization) { create(:organization) }
  let(:refresh_url) { "#{MetaApiClient::INSTAGRAM_GRAPH_URL}/refresh_access_token" }

  def stub_refresh(token, reply)
    stub_request(:get, refresh_url)
      .with(query: { "grant_type" => "ig_refresh_token", "access_token" => token })
      .to_return(reply.merge(headers: { "Content-Type" => "application/json" }))
  end

  def renewed(token = "ig-novo", expires_in: 5_184_000)
    { status: 200, body: { access_token: token, expires_in: expires_in }.to_json }
  end

  def connector(**attributes)
    create(:connector_instagram, organization: organization, **attributes)
  end

  it "renova o token que vence dentro da folga e grava a nova validade" do
    expiring = connector(instagram_user_access_token: "ig-velho", instagram_token_expires_at: 3.days.from_now)
    stub_refresh("ig-velho", renewed)

    described_class.perform_now

    expiring.reload
    expect(expiring.instagram_user_access_token).to eq("ig-novo")
    expect(expiring.instagram_token_expires_at).to be_within(5.seconds).of(60.days.from_now)
  end

  it "renova o conector que nunca gravou a validade" do
    unknown = connector(instagram_user_access_token: "ig-velho", instagram_token_expires_at: nil)
    stub_refresh("ig-velho", renewed)

    described_class.perform_now

    expect(unknown.reload.instagram_user_access_token).to eq("ig-novo")
  end

  it "não renova o que ainda tem folga" do
    connector(instagram_user_access_token: "ig-folgado", instagram_token_expires_at: 30.days.from_now)

    described_class.perform_now

    expect(a_request(:get, refresh_url).with(query: hash_including({}))).not_to have_been_made
  end

  it "não renova conector que não está ativo" do
    connector(status: :inactive, instagram_user_access_token: "ig-parado", instagram_token_expires_at: 1.day.from_now)

    described_class.perform_now

    expect(a_request(:get, refresh_url).with(query: hash_including({}))).not_to have_been_made
  end

  it "não renova conector ligado pelo login do Facebook, cujo token é o da página" do
    connector(auth_provider: "facebook_login", page_access_token: "page-token", instagram_token_expires_at: 1.day.from_now)

    described_class.perform_now

    expect(a_request(:get, refresh_url).with(query: hash_including({}))).not_to have_been_made
  end

  it "uma recusa da Meta não impede de renovar os outros" do
    refused = connector(instagram_user_access_token: "ig-recusado", instagram_token_expires_at: 1.day.from_now)
    accepted = connector(instagram_user_access_token: "ig-velho", instagram_token_expires_at: 1.day.from_now)
    stub_refresh("ig-recusado", status: 400, body: { error: { message: "Token inválido" } }.to_json)
    stub_refresh("ig-velho", renewed)

    described_class.perform_now

    expect(refused.reload.instagram_user_access_token).to eq("ig-recusado")
    expect(accepted.reload.instagram_user_access_token).to eq("ig-novo")
  end

  it "a Meta fora do ar não impede de renovar os outros" do
    down = connector(instagram_user_access_token: "ig-fora", instagram_token_expires_at: 1.day.from_now)
    accepted = connector(instagram_user_access_token: "ig-velho", instagram_token_expires_at: 1.day.from_now)
    stub_request(:get, refresh_url).with(query: hash_including("access_token" => "ig-fora")).to_timeout
    stub_refresh("ig-velho", renewed)

    expect { described_class.perform_now }.not_to raise_error

    expect(down.reload.instagram_user_access_token).to eq("ig-fora")
    expect(accepted.reload.instagram_user_access_token).to eq("ig-novo")
  end

  it "resume o que fez no log" do
    connector(instagram_user_access_token: "ig-velho", instagram_token_expires_at: 1.day.from_now)
    stub_refresh("ig-velho", renewed)
    allow(Rails.logger).to receive(:info)

    described_class.perform_now

    expect(Rails.logger).to have_received(:info).with(/Done: 1 refreshed, 0 failed/)
  end

  it "está agendado todo dia em config/schedule" do
    schedule = YAML.load_file(Rails.root.join("config/schedule/connectors.yml"))

    expect(schedule["instagram_token_refresh"]).to include("class" => described_class.name, "enabled" => true, "queue" => "default")
  end
end
