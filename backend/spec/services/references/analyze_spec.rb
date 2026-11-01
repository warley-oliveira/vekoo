require "rails_helper"

# A análise de ponta a ponta, sem rede: o `Ai::Chat` é um dublê que devolve o
# JSON que a spec manda, e o embedding também.
RSpec.describe References::Analyze do
  let(:card) do
    build(:reference_card, niche: "food_beverage", size: "local",
      analysis: { "metrics" => { "baselineMedian" => 300 } }).tap do |card|
      card.originals.attach(io: file_fixture("foto.png").open, filename: "lamina-1.png", content_type: "image/png")
      card.originals.attach(io: file_fixture("logo.jpg").open, filename: "lamina-2.jpg", content_type: "image/jpeg")
      card.thumbnail.attach(io: StringIO.new(References::Images.thumbnail(file_fixture("foto.png").binread)), filename: "miniatura.jpg", content_type: "image/jpeg")
      card.save!
    end
  end

  let(:analysis) { attributes_for(:reference_card, :analyzed)[:analysis].merge("metrics" => { "likes" => 450, "comments" => 30, "baselineMedian" => nil, "relativeEngagement" => nil, "collectedAt" => nil }) }
  let(:payload) do
    {
      "analysis" => analysis,
      "classification" => {
        "niche" => "pet", "archetypes" => %w[natural_artisanal popular_warm], "objective" => "behind_the_scenes",
        "format" => "carousel", "suggestedLayoutId" => "carousel-cover"
      },
      "visibleText" => "Do forno para a sua mesa em três passos simples e honestos. Venha provar hoje."
    }
  end

  def chat_answering(text, model: "claude-opus-5-5")
    instance_double(Ai::Chat).tap do |chat|
      allow(chat).to receive(:answer).and_return(
        Ai::Chat::Answer.new(text: text, usage: { input: 4_000, output: 1_500, cacheRead: 0, cacheWrite: 0 }, model: model)
      )
    end
  end

  let(:embedder) { instance_double(Ai::Embeddings, embed: Array.new(768) { |i| i.zero? ? 1.0 : 0.0 }) }
  let(:embed) { References::Embed.new(client: embedder) }

  before { allow(Ai::Embeddings).to receive(:available?).and_return(true) }

  def analyze(chat)
    described_class.new(card, chat: chat, embed: embed).call
  end

  it "grava a análise, encaixa na taxonomia, apaga o original e vai para revisão" do
    analyze(chat_answering(JSON.generate(payload)))
    card.reload

    expect(card).to have_attributes(status: "in_review", analysis_status: "done", analysis_model: "claude-opus-5-5")
    # O nicho que a curadoria disse vale sobre o do modelo; o resto vem dele.
    expect(card).to have_attributes(niche: "food_beverage", size: "local", archetypes: %w[natural_artisanal popular_warm],
      objective: "behind_the_scenes", format: "carousel", suggested_layout_id: "carousel-cover", hook_type: "curiosity")
    # Curtidas do print, mediana da curadoria: (450 + 30) / 300.
    expect(card.relative_engagement).to eq(1.6)
    expect(card.analysis_cost_micro_usd).to be > 0
    expect(card.originals).not_to be_attached
    expect(card.thumbnail).to be_attached
    expect(card.embedding.first).to eq(1.0)
    expect(card.embedded_at).to be_present
    expect(card.copy_shingles).not_to be_empty
    expect(card.analysis.to_json).not_to include("três passos")
  end

  it "post importado: curtidas e comentários do Meta valem sobre o que o modelo leu" do
    card.update!(analysis: { "metrics" => { "likes" => 900, "comments" => 60, "baselineMedian" => 300 } })
    unread = analysis.merge("metrics" => { "likes" => nil, "comments" => nil, "baselineMedian" => nil, "relativeEngagement" => nil, "collectedAt" => nil })
    analyze(chat_answering(JSON.generate(payload.merge("analysis" => unread))))

    expect(card.reload.analysis["metrics"]).to include("likes" => 900, "comments" => 60)
    expect(card.relative_engagement).to eq(3.2)
  end

  it "manda as imagens em ordem, o schema como saída estruturada e o fallback de recusa" do
    chat = chat_answering(JSON.generate(payload))
    analyze(chat)

    expect(chat).to have_received(:answer) { |system:, messages:, model:, effort:, schema:, fallbacks:, **|
      content = messages.first[:content]
      expect(content.first(2).map { |block| block[:type] }).to eq(%w[image image])
      expect(content.first[:source]).to include(type: "base64", media_type: "image/jpeg")
      expect(content.last[:text]).to include("2 imagens", "food_beverage")
      expect(system.first[:text]).to include("Nunca copie o texto do post", "Nunca nomeie a origem")
      expect(model).to eq("claude-opus-5-5")
      expect(effort).to eq("high")
      expect(fallbacks).to eq(:default)
      expect(schema["required"]).to eq(%w[analysis classification visibleText])
      expect(JSON.generate(schema)).not_to match(/"(minLength|maxLength|minimum|maxItems)"/)
    }
  end

  it "não aceita layout sugerido que não sai no formato do card" do
    payload["classification"]["suggestedLayoutId"] = "text-only-solid"
    payload["classification"]["format"] = "reels"
    analyze(chat_answering(JSON.generate(payload)))

    expect(card.reload).to have_attributes(format: "reels", suggested_layout_id: nil)
  end

  it "marca a frase do post que voltou para a análise — e ela não publica" do
    payload["analysis"]["copy"]["function"] = "Repete o convite: do forno para a sua mesa em três passos simples."
    analyze(chat_answering(JSON.generate(payload)))
    card.reload

    expect(card.findings).to include({ "code" => "copied", "path" => "copy.function" })
    card.status = "published"
    expect(card).not_to be_valid
    expect(card.errors.details[:"analysis.copy.function"]).to include(error: :copied, term: nil)
  end

  it "sem Vertex, segue sem vetor e avisa na revisão" do
    allow(Ai::Embeddings).to receive(:available?).and_return(false)
    analyze(chat_answering(JSON.generate(payload)))

    expect(card.reload.embedding).to be_nil
    expect(card.findings).to include({ "code" => "noEmbedding" })
    expect(card.blocking_findings).to be_empty
  end

  {
    "resposta que não é o JSON pedido" => [ -> { chat_answering("não sei") }, "invalidOutput" ],
    "recusa do modelo (depois do fallback)" => [ -> { instance_double(Ai::Chat).tap { |c| allow(c).to receive(:answer).and_raise(Ai::Chat::Failed, "refusal") } }, "refused" ],
    "falha de rede" => [ -> { instance_double(Ai::Chat).tap { |c| allow(c).to receive(:answer).and_raise(Ai::Chat::Failed, "APIConnectionError") } }, "failed" ],
    "sem chave" => [ -> { instance_double(Ai::Chat).tap { |c| allow(c).to receive(:answer).and_raise(Ai::Chat::MissingKey) } }, "noKey" ]
  }.each do |situation, (chat, code)|
    it "#{situation}: falha limpa e guarda os originais para tentar de novo" do
      analyze(instance_exec(&chat))
      card.reload

      expect(card).to have_attributes(status: "draft", analysis_status: "failed", analysis_error: { "code" => code })
      expect(card.originals).to be_attached
    end
  end

  it "com fallback, conta e registra pelo modelo que atendeu, não pelo pedido" do
    allow(Rails.logger).to receive(:warn)
    allow(Rails.logger).to receive(:info)
    usage = { input: 4_000, output: 1_500, cacheRead: 0, cacheWrite: 0 }

    analyze(chat_answering(JSON.generate(payload), model: "claude-opus-5"))

    expect(card.reload.analysis_model).to eq("claude-opus-5")
    expect(card.analysis_cost_micro_usd).to eq(Agent::Pricing.micro_usd("claude-opus-5", usage))
    expect(card.analysis_cost_micro_usd).not_to eq(Agent::Pricing.micro_usd("claude-opus-5-5", usage))
    expect(Rails.logger).to have_received(:warn).with(/claude-opus-5-5 recusou; atendeu claude-opus-5/)
    expect(Rails.logger).to have_received(:info).with(/analisada por claude-opus-5 —/)
  end

  it "registra o custo mesmo quando a resposta veio torta" do
    analyze(chat_answering("{}"))

    expect(card.reload.analysis_cost_micro_usd).to be > 0
  end
end
