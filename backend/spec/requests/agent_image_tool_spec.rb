require "rails_helper"

# A foto como ferramenta do agente: no meio do pedido ele chama
# `generate_image`, recebe o id (e a foto, para conferir) e compõe com ela —
# ou entrega só as fotos, quando foi isso que a pessoa pediu. Sem rede: o
# modelo e o gerador são dublês.
RSpec.describe "Agente de criação com a ferramenta de foto", type: :request do
  include ActiveJob::TestHelper

  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }
  let(:brand) { create(:brand_core, :published, organization: organization) }
  let(:png) { Vips::Image.black(40, 50).new_from_image([ 200, 120, 60 ]).copy(interpretation: :srgb).write_to_buffer(".png") }
  let(:agent_cost) { CatalogSerializer::AI_COSTS[:agent] }
  let(:image_cost) { CatalogSerializer::AI_COSTS[:image] }

  before { allow(Ai::GeminiImage).to receive(:available?).and_return(true) }

  def fake_gemini(*answers)
    queue = answers.dup
    lock = Mutex.new
    client = instance_double(Ai::GeminiImage)
    allow(client).to receive(:generate) do
      answer = lock.synchronize { queue.shift || answers.last }
      raise Ai::GeminiImage::Blocked, "safety" if answer == :blocked

      Ai::GeminiImage::Result.new(image: Ai::GeminiImage::Image.new(data: png, mime_type: "image/png"), usage: {}, model: "gemini-3.1-flash-image")
    end
    allow(Ai::GeminiImage).to receive(:new).and_return(client)
  end

  def tool_call(id: "toolu_1", **input)
    input = { prompt: "pão de queijo saindo do forno, luz da manhã", caption: "pão de queijo saindo do forno", aspectRatio: "4:5", count: 1 }.merge(input)
    { id: id, name: "generate_image", input: input.deep_stringify_keys }
  end

  # Cada resposta é ou uma lista de pedidos de ferramenta ou o texto final.
  # Um bloco `lambda` vira texto na hora — é como a spec usa o id da foto que
  # acabou de sair.
  def fake_chat(*answers)
    calls = []
    queue = answers.dup
    chat = instance_double(Ai::Chat)
    allow(chat).to receive(:answer) do |**params|
      calls << params.deep_dup
      answer = queue.shift
      answer = answer.call if answer.respond_to?(:call)
      usage = { input: 6_000, output: 800, cacheRead: 0, cacheWrite: 0 }
      if answer.is_a?(Array)
        content = answer.map { |use| { type: "tool_use", id: use[:id], name: use[:name], input: use[:input] } }
        Ai::Chat::Answer.new(text: "", usage: usage, model: "claude-opus-5", content: content, tool_uses: answer, stop_reason: :tool_use)
      else
        Ai::Chat::Answer.new(text: answer, usage: usage, model: "claude-opus-5", content: [ { type: "text", text: answer } ], stop_reason: :end_turn)
      end
    end
    allow(Ai::Chat).to receive(:new).and_return(chat)
    calls
  end

  def photo_piece(asset_id)
    JSON.generate(
      "question" => nil,
      "variations" => [ {
        "format" => "feed_portrait", "title" => "Pão de queijo",
        "slides" => [ { "layout" => "hero-image-title-bottom", "content" => { "image" => asset_id, "title" => "Saiu agora." } } ],
        "caption" => { "text" => "Fornada das 7h.", "hashtags" => [ "#paodequeijo" ] },
        "why" => "foto cheia, título curto"
      } ]
    )
  end

  def ask(prompt)
    post "/brands/#{brand.id}/conversations", params: { turn: { prompt: prompt } }, headers: headers
    perform_enqueued_jobs(only: AgentTurnJob)
    AgentTurn.order(:created_at).last
  end

  it "cria a foto no meio do pedido e compõe a peça com ela" do
    fake_gemini(:ok)
    calls = fake_chat([ tool_call ], -> { photo_piece(BrandAsset.where(generated: true, kind: "photo").last.id) })

    turn = ask("post do pão de queijo com uma foto saindo do forno")

    expect(turn.status).to eq("answered")
    asset_id = turn.generated_asset_ids.sole
    expect(turn.pieces.sole.document.dig("slides", 0, "blocks").find { |b| b["slot"] == "image" }["assetId"]).to eq(asset_id)
    expect(turn.plan["images"]).to eq([ { "assetId" => asset_id, "caption" => "pão de queijo saindo do forno" } ])
    expect(turn.steps.sole).to include("kind" => "image", "status" => "done", "aspectRatio" => "4:5", "assetIds" => [ asset_id ])

    # A geração fica ligada ao turno, com a origem do agente, e a foto é da marca.
    generation = ImageGeneration.sole
    expect(generation).to have_attributes(origin: "agent", agent_turn_id: turn.id, status: "done")
    expect(brand.assets.find(asset_id)).to have_attributes(kind: "photo", generated: true)

    # O pedido e a foto, cada um com o seu preço.
    expect(organization.reload.credits_used).to eq(agent_cost + image_cost)

    # A ferramenta foi oferecida; a resposta voltou com o pedido de ferramenta
    # como veio e o resultado trouxe o id e a própria foto.
    expect(calls.first[:tools].sole[:name]).to eq("generate_image")
    expect(calls.second[:messages][-2]).to include(role: "assistant")
    result = calls.second[:messages].last[:content].sole
    expect(result).to include(type: "tool_result", tool_use_id: "toolu_1")
    expect(result[:content].map { |block| block[:type] }).to eq(%w[text image])
    expect(JSON.parse(result[:content].first[:text])["fotos"]).to eq([ { "id" => asset_id } ])

    # O prefixo não muda entre as voltas, mesmo com a foto nova já na marca:
    # o pensamento da primeira volta é assinado contra ele.
    expect(calls.second[:system]).to eq(calls.first[:system])
  end

  it "entrega só as fotos quando foi isso que a pessoa pediu, e não cobra o pedido" do
    fake_gemini(:ok)
    fake_chat([ tool_call(count: 3, aspectRatio: "1:1") ], JSON.generate("question" => nil, "variations" => [], "onlyImages" => true))

    turn = ask("gera 3 fotos da vitrine da padaria de manhã")

    expect(turn).to have_attributes(status: "answered")
    expect(turn.only_images?).to be(true)
    expect(turn.pieces).to be_empty
    expect(turn.generated_asset_ids.length).to eq(3)
    expect(organization.reload.credits_used).to eq(3 * image_cost)

    get "/brands/#{brand.id}/conversations/#{turn.agent_conversation_id}", headers: headers
    served = json["turns"].sole
    expect(served["onlyImages"]).to be(true)
    expect(served["steps"].sole["assets"].length).to eq(3)
    expect(served["steps"].sole["assets"].first).to include("kind" => "photo", "url" => a_string_including("/rails/active_storage/"))
  end

  it "sem saldo para a foto, a ferramenta avisa o agente e ele segue sem ela" do
    organization.update!(credits_used: organization.credits_total - agent_cost)
    fake_gemini(:ok)
    calls = fake_chat([ tool_call ], JSON.generate("question" => nil, "variations" => [ {
      "format" => "feed_portrait", "title" => "Só texto",
      "slides" => [ { "layout" => "text-only-solid", "content" => { "title" => "Saiu agora." } } ],
      "caption" => { "text" => "Fornada das 7h.", "hashtags" => [ "#paodequeijo" ] }, "why" => "sem foto"
    } ]))

    turn = ask("post do pão de queijo com foto")

    expect(turn.status).to eq("answered")
    expect(turn.steps.sole).to include("status" => "failed", "error" => "noCredits")
    expect(ImageGeneration.count).to eq(0)
    expect(calls.second[:messages].last[:content].sole).to include(is_error: true)
  end

  it "a recusa do gerador vira passo com o motivo, e o crédito da foto volta" do
    fake_gemini(:blocked)
    fake_chat([ tool_call ], JSON.generate("question" => nil, "variations" => [], "onlyImages" => true))

    turn = ask("foto de qualquer coisa")

    expect(turn.steps.sole).to include("status" => "failed", "error" => "blocked")
    # `onlyImages` sem foto nenhuma não é entrega: o agente tenta corrigir e falha limpo.
    expect(turn.status).to eq("failed")
    expect(organization.reload.credits_used).to eq(0)
  end

  it "corta a terceira chamada da ferramenta no mesmo pedido" do
    fake_gemini(:ok)
    calls = fake_chat([ tool_call(id: "a") ], [ tool_call(id: "b") ], [ tool_call(id: "c") ],
      JSON.generate("question" => nil, "variations" => [], "onlyImages" => true))

    turn = ask("fotos, muitas fotos")

    expect(ImageGeneration.count).to eq(2)
    expect(turn.steps.length).to eq(2)
    expect(calls.fourth[:messages].last[:content].sole).to include(tool_use_id: "c", is_error: true)
  end

  it "sem gerador configurado, a ferramenta nem é oferecida" do
    allow(Ai::GeminiImage).to receive(:available?).and_return(false)
    calls = fake_chat(photo_piece(nil).sub("\"image\":null,", ""))

    ask("post do pão de queijo")

    expect(calls.first[:tools]).to be_nil
  end
end
