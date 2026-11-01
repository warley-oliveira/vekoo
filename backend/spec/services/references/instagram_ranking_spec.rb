require "rails_helper"

RSpec.describe References::InstagramRanking do
  let(:now) { Time.zone.parse("2026-10-28 12:00") }

  def media(id, likes:, comments: 0, days_ago: 10, type: "IMAGE", children: [])
    InstagramGraph::Client::Media.new(id: id, media_type: type, like_count: likes, comments_count: comments,
      posted_at: now - days_ago.days, children: children)
  end

  it "mede cada post contra a mediana da própria conta" do
    result = described_class.call([ media("a", likes: 90, comments: 10), media("b", likes: 200), media("c", likes: 50), media("d", likes: 400) ], now: now)

    # Mediana de 100, 200, 50, 400 = 150.
    expect(result.median).to eq(150.0)
    expect(result.candidates.map { |c| [ c.media.id, c.relative ] }).to eq([ [ "d", 2.67 ], [ "b", 1.33 ], [ "a", 0.67 ], [ "c", 0.33 ] ])
  end

  it "deixa post de menos de 7 dias fora da mediana e da lista" do
    result = described_class.call([ media("novo", likes: 5, days_ago: 3), media("a", likes: 100), media("b", likes: 300) ], now: now)

    expect(result.median).to eq(200.0)
    expect(result.eligible).to eq(2)
    expect(result.candidates.map { |c| c.media.id }).to eq(%w[b a])
  end

  it "curtida oculta: fora da mediana, na lista sem métrica, por último" do
    result = described_class.call([ media("oculto", likes: nil, comments: 4), media("a", likes: 100), media("b", likes: 300) ], now: now)

    expect(result.median).to eq(200.0)
    expect(result.candidates.last).to have_attributes(relative: nil, engagement: nil)
    expect(result.candidates.last.media.id).to eq("oculto")
  end

  it "marca vídeo e carrossel com vídeo como análise parcial" do
    video_child = InstagramGraph::Client::Child.new(id: "c2", media_type: "VIDEO")
    image_child = InstagramGraph::Client::Child.new(id: "c1", media_type: "IMAGE")
    result = described_class.call([
      media("reel", likes: 100, type: "VIDEO"), media("misto", likes: 100, type: "CAROUSEL_ALBUM", children: [ image_child, video_child ]),
      media("fotos", likes: 100, type: "CAROUSEL_ALBUM", children: [ image_child ])
    ], now: now)

    expect(result.candidates.to_h { |c| [ c.media.id, c.partial ] }).to eq("reel" => true, "misto" => true, "fotos" => false)
  end

  it "sem post medido, não inventa mediana" do
    result = described_class.call([ media("a", likes: nil) ], now: now)

    expect(result.median).to be_nil
    expect(result.candidates.sole.relative).to be_nil
  end
end
