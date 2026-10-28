require "rails_helper"

RSpec.describe References::ImportAccount do
  around { |example| with_instagram_env { example.run } }
  before { InstagramGraph::Throttle.clear! }

  let(:account) { create(:reference_import_account, username: "padoca.exemplo") }
  let(:posts) do
    [
      ig_media("100", likes: 300, comments: 30),
      ig_media("200", type: "CAROUSEL_ALBUM", media_url: nil, likes: 90, comments: 10, children: [ ig_child("201"), ig_child("202") ]),
      ig_media("300", type: "VIDEO", product: "REELS", media_url: nil, thumbnail_url: "https://scontent.cdninstagram.com/300-capa.jpg", likes: 120),
      ig_media("400", likes: 40),
      ig_media("500", likes: 999, days_ago: 2)
    ]
  end

  def import(responses)
    transport, @calls = ig_transport(responses)
    described_class.new(account, client: InstagramGraph::Client.new(transport: transport)).call
  end

  it "guarda os candidatos do melhor para o pior, com a mediana da conta" do
    import("padoca.exemplo" => ig_discovery("padoca.exemplo", posts))
    account.reload

    # Elegíveis (7+ dias), curtidas + comentários: 330, 100, 130, 50 → mediana 115.
    expect(account).to have_attributes(status: "done", name: "Padoca Exemplo", followers_count: 12_000,
      fetched_count: 5, eligible_count: 4, baseline_median: 115)
    expect(account.candidates.map(&:ig_media_id)).to eq(%w[100 300 200 400])
    expect(account.candidates.first).to have_attributes(relative_engagement: 2.87, partial: false, media_type: "IMAGE")
    expect(account.candidates.first).to be_highlight
  end

  it "mostra a foto, a primeira lâmina ou a capa do vídeo como prévia" do
    import("padoca.exemplo" => ig_discovery("padoca.exemplo", posts))

    previews = account.reload.candidates.to_h { |c| [ c.ig_media_id, c.preview_url ] }
    expect(previews).to include("100" => "https://scontent.cdninstagram.com/100.jpg", "200" => "https://scontent.cdninstagram.com/201.jpg",
      "300" => "https://scontent.cdninstagram.com/300-capa.jpg")
    expect(account.candidates.find_by(ig_media_id: "300")).to have_attributes(partial: true, product_type: "REELS")
    expect(account.candidates.find_by(ig_media_id: "200").children_count).to eq(2)
  end

  it "nunca guarda a legenda" do
    import("padoca.exemplo" => ig_discovery("padoca.exemplo", posts))

    stored = [ account.reload.attributes, *account.candidates.map(&:attributes), account.reference_import.attributes ].to_json
    expect(stored).not_to include("três passos")
  end

  it "marca o post que já virou card" do
    card = create(:reference_card, source: { "url" => "https://www.instagram.com/p/100/", "igMediaId" => "100" })
    import("padoca.exemplo" => ig_discovery("padoca.exemplo", posts))

    expect(account.reload.candidates.find_by(ig_media_id: "100")).to have_attributes(status: "carded", reference_card_id: card.id)
  end

  it "conta pessoal, privada ou inexistente: erro na conta, o lote segue" do
    import("padoca.exemplo" => ig_error(110, message: "Invalid user id"))

    expect(account.reload).to have_attributes(status: "error", error_code: "accountUnavailable")
    expect(account).not_to be_retryable
  end

  it "limite de taxa: segura as outras contas até a hora de tentar de novo" do
    usage = JSON.generate("1" => [ { "type" => "instagram", "estimated_time_to_regain_access" => 30 } ])
    import("padoca.exemplo" => ig_error(80002, headers: { "x-business-use-case-usage" => usage }))

    expect(account.reload).to have_attributes(status: "error", error_code: "rateLimited")
    expect(account.retry_at).to be_within(1.minute).of(30.minutes.from_now)
    expect(account).to be_retryable

    other = create(:reference_import_account, reference_import: account.reference_import, username: "outra")
    transport, calls = ig_transport(default: ig_discovery("outra", []))
    described_class.new(other, client: InstagramGraph::Client.new(transport: transport)).call
    expect(calls).to be_empty
    expect(other.reload.error_code).to eq("rateLimited")
  end

  it "token vencido: erro na conta, sem tentar de novo sozinho" do
    import("padoca.exemplo" => ig_error(190))

    expect(account.reload).to have_attributes(error_code: "tokenInvalid")
    expect(account).not_to be_retryable
  end
end
