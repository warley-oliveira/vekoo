require "rails_helper"

# Os padrões do banco de referências na conversa de criação (Fase 3, passo 3).
# A busca em si é assunto de `retriever_spec`; aqui ela devolve cards prontos
# e o que se confere é o caminho até o agente e de volta: onde os padrões
# entram no prompt (sem quebrar o cache), o que a peça e o turno guardam, e
# que a tela do assinante nunca vê o banco.
RSpec.describe "Padrões de referência na conversa de criação", type: :request do
  include ActiveJob::TestHelper

  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }
  let(:brand) { create(:brand_core, :published, organization: organization) }

  let(:cards) do
    [
      create(:reference_card, :published, source: { "url" => "https://www.instagram.com/p/AAA/", "channel" => "@conta_origem_um" }),
      create(:reference_card, :published, objective: "direct_sale", source: { "url" => "https://www.instagram.com/p/BBB/", "channel" => "@conta_origem_dois" })
        .tap { |card| card.update_columns(hook_type: "promise", requires: %w[promotion]) }
    ]
  end
  let(:mode) { "on" }

  def search_result(found = cards, cost: 400)
    References::Retriever::Result.new(
      picks: found.map { |card| References::Retriever::Pick.new(card: card, points: {}, total: 0, cosine: nil, missing: []) },
      intent: References::Intent::Result.new(objective: nil, format: nil, brings: [], cost_micro_usd: cost),
      niche: "food_beverage", archetypes: {}, has: {}, similarity: false, candidates: found.size
    )
  end

  before do
    allow(References::Retriever).to receive(:mode).and_return(mode)
    allow(References::Retriever).to receive(:call).and_return(search_result)
  end

  def statement(overrides = {})
    {
      "format" => "feed_portrait",
      "title" => "Pão de verdade",
      "slides" => [ {
        "layout" => "text-only-solid",
        "background" => { "colorToken" => "primary" },
        "content" => { "title" => "Pão de verdade\nleva tempo.", "body" => "R$ 18" }
      } ],
      "caption" => { "text" => "Fermentação natural, todo dia às 6h.", "hashtags" => [ "#paodefermentacaonatural" ] },
      "why" => "fundo escuro, frase seca"
    }.merge(overrides)
  end

  def reply(*variations)
    JSON.generate({ "question" => nil, "variations" => variations })
  end

  def fake_chat(*texts)
    calls = []
    queue = texts.dup
    chat = instance_double(Ai::Chat)
    allow(chat).to receive(:answer) do |**params|
      calls << params
      Ai::Chat::Answer.new(text: queue.shift || texts.last, usage: { input: 6_000, output: 1_200, cacheRead: 0, cacheWrite: 5_000 }, model: "claude-opus-5")
    end
    allow(Ai::Chat).to receive(:new).and_return(chat)
    calls
  end

  def think! = perform_enqueued_jobs(only: AgentTurnJob)

  def start(prompt: "post da promoção de quarta")
    post "/brands/#{brand.id}/conversations", params: { turn: { prompt: prompt } }, headers: headers
  end

  def follow(conversation, **turn)
    post "/brands/#{brand.id}/conversations/#{conversation.id}/turns", params: { turn: turn }, headers: headers
  end

  it "manda os padrões antes do pedido, na mesma mensagem, e o ponto de cache fica no pedido" do
    calls = fake_chat(reply(statement))
    start
    think!

    params = calls.first
    expect(params[:system].first[:text]).to include("## Padrões de referência", "`referenceIds`")
    expect(params[:system].length).to eq(3)

    patterns, request = params[:messages].last[:content]
    expect(patterns[:text]).to include("# Padrões de referência", "## R1", "## R2", "A capa mostra o resultado", "O post exige: uma oferta concreta")
    expect(patterns).not_to have_key(:cache_control)
    expect(request[:text]).to include("post da promoção de quarta")
    expect(request[:cache_control]).to eq({ type: "ephemeral" })
  end

  it "o bloco dos padrões nunca leva a fonte, o @, as métricas, o nicho ou o porte" do
    calls = fake_chat(reply(statement))
    start
    think!

    text = calls.first[:messages].last[:content].first[:text]
    expect(text).not_to include("conta_origem", "instagram.com", "AAA", "840", "300", "food_beverage", "local")
  end

  it "a peça guarda os padrões que seguiu, o turno guarda os oferecidos — e a tela não vê nenhum dos dois" do
    fake_chat(reply(statement("referenceIds" => %w[R2 R9]), statement("title" => "Outra", "referenceIds" => [])))
    start
    think!

    turn = AgentTurn.last
    pieces = turn.pieces.order(:created_at)
    expect(pieces.map(&:reference_ids)).to eq([ [ cards.second.id ], [] ])
    expect(turn.offered_reference_ids).to eq(cards.map(&:id))

    get "/brands/#{brand.id}/conversations/#{turn.agent_conversation_id}", headers: headers
    expect(response).to have_http_status(:ok)
    cards.each { |card| expect(response.body).not_to include(card.id) }
    expect(response.body).not_to include("referenceIds")

    get "/brands/#{brand.id}/pieces/#{pieces.first.id}", headers: headers
    expect(response).to have_http_status(:ok)
    expect(response.body).not_to include(cards.second.id)
  end

  it "soma o custo da leitura do pedido no custo do turno — é a base do teto de OPEX" do
    fake_chat(reply(statement))
    start
    think!

    expected = Agent::Pricing.micro_usd("claude-opus-5", { input: 6_000, output: 1_200, cacheRead: 0, cacheWrite: 5_000 }) + 400
    expect(AgentTurn.last.cost_micro_usd).to eq(expected)
  end

  it "o histórico não leva os padrões de turnos anteriores" do
    fake_chat(reply(statement))
    start
    think!
    conversation = AgentConversation.last

    calls = fake_chat(reply(statement))
    follow(conversation, kind: "create", prompt: "agora um story do pão de queijo")
    think!

    messages = calls.first[:messages]
    expect(messages.first[:content]).to be_a(String).and include("post da promoção de quarta")
    expect(messages.first[:content]).not_to include("Padrões de referência")
    expect(messages.last[:content].first[:text]).to include("# Padrões de referência")
  end

  it "busca que falha não derruba o turno: a peça sai sem padrão" do
    allow(References::Retriever).to receive(:call).and_raise(StandardError, "vertex fora")
    calls = fake_chat(reply(statement))
    start
    think!

    expect(AgentTurn.last).to have_attributes(status: "answered", offered_reference_ids: [])
    expect(calls.first[:messages].last[:content]).to be_a(String)
  end

  describe "no ajuste e no mais variações" do
    let(:conversation) do
      fake_chat(reply(statement("referenceIds" => %w[R1])))
      start
      think!
      AgentConversation.last
    end
    let(:piece_id) { conversation.turns.last.variations.first["pieceId"] }

    it "o ajuste não busca: a peça já tem forma" do
      piece_id
      fake_chat(reply(statement))
      expect(References::Retriever).to have_received(:call).once

      follow(conversation, kind: "adjust", prompt: "encurta a frase", basePieceId: piece_id)
      think!

      expect(References::Retriever).to have_received(:call).once
    end

    it "o mais variações busca de novo pelo pedido original, sem os padrões que a peça já seguiu" do
      piece_id
      fake_chat(reply(statement))

      follow(conversation, kind: "vary", basePieceId: piece_id)
      think!

      expect(References::Retriever).to have_received(:call)
        .with(brand, "post da promoção de quarta", exclude_ids: [ cards.first.id ])
    end
  end

  context "no modo sombra" do
    let(:mode) { "shadow" }

    it "guarda o que ofereceria e não manda nada ao agente" do
      calls = fake_chat(reply(statement("referenceIds" => %w[R1])))
      start
      think!

      expect(calls.first[:messages].last[:content]).to be_a(String)
      expect(AgentTurn.last.offered_reference_ids).to eq(cards.map(&:id))
      expect(Piece.last.reference_ids).to eq([])
    end
  end

  context "desligado" do
    let(:mode) { "off" }

    it "nem busca" do
      fake_chat(reply(statement))
      start
      think!

      expect(References::Retriever).not_to have_received(:call)
      expect(AgentTurn.last.offered_reference_ids).to eq([])
    end
  end
end
