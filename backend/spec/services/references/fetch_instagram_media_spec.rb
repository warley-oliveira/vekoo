require "rails_helper"

# Na hora da análise: as imagens e a legenda buscadas de novo, a legenda só
# na memória. A análise em si é a da Fase 2, com o modelo dublado.
RSpec.describe References::FetchInstagramMedia do
  around { |example| with_instagram_env { example.run } }

  let(:caption) { "Do forno para a sua mesa em três passos simples e honestos. Marque quem precisa!" }
  let(:card) do
    create(:reference_card, format: "carousel", size: "local",
      source: { "url" => "https://www.instagram.com/p/200/", "channel" => "@padoca.exemplo", "bannedTerms" => [ "padoca.exemplo" ], "igMediaId" => "200" })
  end
  let(:png) { file_fixture("foto.png").binread }
  let(:fetch) { ->(url) { References::FetchImage::Result.new(data: png, content_type: "image/png", filename: File.basename(url)) } }

  def children(count, video_at: nil)
    (1..count).map { |n| ig_child("c#{n}", type: n == video_at ? "VIDEO" : "IMAGE") }
  end

  def media(**options) = InstagramGraph::Client::Media.new(**options)
  def child(id, type = "IMAGE") = InstagramGraph::Client::Child.new(id: id, media_type: type, media_url: "u-#{id}", thumbnail_url: "t-#{id}")

  describe ".image_urls" do
    it "carrossel com mais de 10 lâminas: as 9 primeiras e a última" do
      album = media(media_type: "CAROUSEL_ALBUM", children: (1..14).map { |n| child("c#{n}") })

      expect(described_class.image_urls(album)).to eq((1..9).map { |n| "u-c#{n}" } + [ "u-c14" ])
    end

    it "lâmina de vídeo entra pela capa; vídeo inteiro também" do
      album = media(media_type: "CAROUSEL_ALBUM", children: [ child("c1"), child("c2", "VIDEO") ])

      expect(described_class.image_urls(album)).to eq(%w[u-c1 t-c2])
      expect(described_class.image_urls(media(media_type: "VIDEO", thumbnail_url: "capa"))).to eq(%w[capa])
      expect(described_class.image_urls(media(media_type: "VIDEO", thumbnail_url: nil))).to eq([])
    end
  end

  def run(responses, analyze: nil)
    transport, @calls = ig_transport(responses)
    described_class.new(card, client: InstagramGraph::Client.new(transport: transport), fetch: fetch, analyze: analyze).call
  end

  it "anexa as imagens na ordem e manda a legenda para a análise" do
    received = nil
    post = ig_media("200", type: "CAROUSEL_ALBUM", media_url: nil, caption: caption, children: children(3))
    run({ "padoca.exemplo" => ig_discovery("padoca.exemplo", [ ig_media("100"), post ]) }, analyze: ->(c, text) { received = [ c.id, text ] })

    expect(card.reload.ordered_originals.map { |o| o.filename.to_s }).to eq(%w[lamina-1 lamina-2 lamina-3])
    expect(card.thumbnail).to be_attached
    expect(received).to eq([ card.id, caption ])
  end

  it "post que sumiu da conta: falha com motivo" do
    run({ "padoca.exemplo" => ig_discovery("padoca.exemplo", [ ig_media("999") ]) })

    expect(card.reload).to have_attributes(analysis_status: "failed", analysis_error: { "code" => "mediaGone" })
  end

  it "token vencido ou imagem que não baixa: falha com motivo, sem originais" do
    run({ "padoca.exemplo" => ig_error(190) })
    expect(card.reload.analysis_error).to eq("code" => "tokenInvalid")

    refused = ->(_url) { raise References::FetchImage::Refused, "urlFailed" }
    transport, = ig_transport("padoca.exemplo" => ig_discovery("padoca.exemplo", [ ig_media("200") ]))
    described_class.new(card, client: InstagramGraph::Client.new(transport: transport), fetch: refused).call
    expect(card.reload).to have_attributes(analysis_error: { "code" => "mediaUnavailable" })
    expect(card.originals).not_to be_attached
  end

  describe "vários cards da mesma conta" do
    let(:other) do
      create(:reference_card, format: "static", size: "local",
        source: { "url" => "https://www.instagram.com/p/100/", "channel" => "@padoca.exemplo", "bannedTerms" => [ "padoca.exemplo" ], "igMediaId" => "100" })
    end
    let(:pages) do
      ->(fields) {
        fields.include?(".after(") ? ig_discovery("padoca.exemplo", [ ig_media("50") ]) : ig_discovery("padoca.exemplo", [ ig_media("100"), ig_media("200") ], after: "QVFIUjEz")
      }
    end

    def run_all(cards, analyze:)
      transport, @calls = ig_transport("padoca.exemplo" => pages)
      described_class.new(cards, client: InstagramGraph::Client.new(transport: transport), fetch: fetch, analyze: analyze).call
    end

    it "uma leitura do Meta serve a todos, e para de paginar quando acha os posts" do
      received = []
      run_all([ card, other ], analyze: ->(c, text) { received << [ c.id, text ] })

      expect(@calls.length).to eq(1)
      expect(received.map(&:first)).to eq([ card.id, other.id ])
      expect(received.map(&:last)).to all(start_with("Legenda do post"))
      expect([ card.reload, other.reload ].map { |c| c.originals.attached? }).to eq([ true, true ])
    end

    it "um card que falha não derruba o outro" do
      analyzed = []
      boom = ->(c, _text) { c.id == card.id ? raise("legenda no meio do erro") : analyzed << c.id }
      log = StringIO.new
      allow(Rails).to receive(:logger).and_return(ActiveSupport::Logger.new(log))

      run_all([ card, other ], analyze: boom)

      expect(card.reload).to have_attributes(analysis_status: "failed", analysis_error: { "code" => "failed" })
      expect(analyzed).to eq([ other.id ])
      expect(log.string).to include("RuntimeError")
      expect(log.string).not_to include("legenda no meio do erro")
    end

    it "o Meta fora do ar falha todos os cards da conta, com o motivo" do
      transport, = ig_transport("padoca.exemplo" => ig_error(190))
      described_class.new([ card, other ], client: InstagramGraph::Client.new(transport: transport), fetch: fetch).call

      expect([ card.reload, other.reload ].map(&:analysis_error)).to all(eq("code" => "tokenInvalid"))
    end
  end

  describe "a legenda nunca é gravada" do
    let(:chat) do
      payload = {
        "analysis" => attributes_for(:reference_card, :analyzed)[:analysis],
        "classification" => { "niche" => "food_beverage", "archetypes" => %w[natural_artisanal], "objective" => "authority_education", "format" => "carousel", "suggestedLayoutId" => nil },
        "visibleText" => "3 PASSOS"
      }
      instance_double(Ai::Chat).tap do |double|
        allow(double).to receive(:answer).and_return(
          Ai::Chat::Answer.new(text: JSON.generate(payload), usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 }, model: "claude-opus-5-5")
        )
      end
    end

    it "vai ao modelo, entra na conferência de cópia e não fica em coluna, log nem fila" do
      allow(Ai::Embeddings).to receive(:available?).and_return(false)
      log = StringIO.new
      logger = ActiveSupport::Logger.new(log)
      allow(Rails).to receive(:logger).and_return(logger)
      post = ig_media("200", type: "CAROUSEL_ALBUM", media_url: nil, caption: caption, children: children(2))

      run({ "padoca.exemplo" => ig_discovery("padoca.exemplo", [ post ]) },
        analyze: ->(c, text) { References::Analyze.new(c, chat: chat, caption: text).call })

      expect(chat).to have_received(:answer) { |messages:, **| expect(messages.first[:content].last[:text]).to include(caption, "<<<LEGENDA") }
      card.reload
      expect(card.analysis_status).to eq("done")
      expect(card.copy_shingles).to include(*References::CopyGuard.shingles(caption))
      stored = [ card.attributes.except("copy_shingles", "embedding"), *ReferenceCandidate.all.map(&:attributes) ].to_json
      expect(stored).not_to include("três passos")
      expect(log.string).not_to include("três passos")
      expect(ActiveJob::Base.queue_adapter.enqueued_jobs.to_json).not_to include("três passos")
    end
  end
end
