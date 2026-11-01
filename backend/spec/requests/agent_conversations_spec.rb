require "rails_helper"

# A conversa de criação, de ponta a ponta. Nada aqui toca a rede: `Ai::Chat` é
# a costura, e o duplo devolve o JSON que o modelo devolveria — o que permite
# testar crédito, estorno, correção automática e as peças que nascem sem
# chave de API e sem gastar dinheiro.
RSpec.describe "Conversa de criação", type: :request do
  include ActiveJob::TestHelper

  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }
  let(:brand) { create(:brand_core, :published, organization: organization) }

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

  def reply(*variations, question: nil)
    JSON.generate({ "question" => question, "variations" => variations })
  end

  # Um `Ai::Chat` que responde o que mandarmos, um texto por chamada. Devolve
  # a lista do que **recebeu**: é assim que as specs conferem o prompt.
  def fake_chat(*texts, raises: nil, usage: { input: 6_000, output: 1_200, cacheRead: 0, cacheWrite: 5_000 })
    calls = []
    queue = texts.dup
    chat = instance_double(Ai::Chat)
    allow(chat).to receive(:answer) do |**params|
      raise raises if raises

      calls << params
      Ai::Chat::Answer.new(text: queue.shift || texts.last, usage: usage, model: "claude-opus-5")
    end
    allow(Ai::Chat).to receive(:new).and_return(chat)
    calls
  end

  # Só o turno do agente: renderizar de verdade é assunto de `engines_spec`.
  def think!
    perform_enqueued_jobs(only: AgentTurnJob)
  end

  def start(prompt: "post da promoção de quarta", **extra)
    post "/brands/#{brand.id}/conversations",
      params: { turn: { prompt: prompt, **extra } }, headers: headers
  end

  describe "POST /brands/:id/conversations" do
    it "abre a conversa, guarda o pedido e põe o turno para pensar" do
      fake_chat(reply(statement))

      expect { start }.to change { organization.agent_conversations.count }.by(1)

      expect(response).to have_http_status(:created)
      expect(json["title"]).to eq("post da promoção de quarta")
      expect(json["turns"].first).to include("status" => "thinking", "kind" => "create")
    end

    it "reserva o crédito na hora, para 'sem saldo' ser um status HTTP de verdade" do
      fake_chat(reply(statement))

      expect { start }.to change { organization.reload.credits_used }
        .by(CatalogSerializer::AI_COSTS[:agent])
    end

    it "recusa sem saldo, antes de criar qualquer coisa" do
      organization.update!(credits_used: organization.credits_total)

      expect { start }.not_to change { organization.agent_conversations.count }

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("noCredits")
    end

    it "recusa enquanto a marca não estiver publicada" do
      brand.update!(status: "draft", published_document: nil, published_at: nil, current_version: 0)

      start

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("brandNotPublished")
    end

    it "recusa pedido em branco" do
      start(prompt: "   ")

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "field")).to eq("prompt")
    end
  end

  describe "o turno pensando" do
    it "vira peças na fila, uma por variação, já ligadas ao turno" do
      fake_chat(reply(statement, statement("title" => "Outra"), statement("title" => "Mais uma")))
      start

      expect { think! }.to change { brand.pieces.count }.by(3)

      turn = AgentTurn.last
      expect(turn.status).to eq("answered")
      expect(turn.variations.map { |v| v["pieceId"] }).to all(be_present)
      expect(brand.pieces.pluck(:agent_turn_id).uniq).to eq([ turn.id ])
    end

    it "cada peça nasce em rascunho, com o documento como primeira versão" do
      fake_chat(reply(statement))
      start
      think!

      piece = brand.pieces.last
      expect(piece).to have_attributes(status: "draft", format: "feed_portrait", engine_id: nil)
      expect(piece.versions.map(&:source)).to eq([ "generation" ])
      expect(piece.versions.first.summary).to eq("post da promoção de quarta")
      expect(piece.document.dig("slides", 0, "layoutId")).to eq("text-only-solid")
      expect(piece.document.dig("slides", 0, "blocks").map { |b| b["slot"] }).to eq(%w[title body logo])
      expect(piece.document["caption"]["hashtags"]).to eq([ "#paodefermentacaonatural" ])
    end

    it "registra tokens, custo e modelo — é a base do teto de OPEX" do
      fake_chat(reply(statement))
      start
      think!

      turn = AgentTurn.last
      expect(turn.model).to eq("claude-opus-5")
      expect(turn.usage).to include("input" => 6_000, "output" => 1_200)
      expect(turn.cost_micro_usd).to eq(
        Agent::Pricing.micro_usd("claude-opus-5", input: 6_000, output: 1_200, cacheRead: 0, cacheWrite: 5_000)
      )
    end

    it "manda o catálogo e a ficha da marca em blocos cacheados, e só o pedido na mensagem" do
      calls = fake_chat(reply(statement))
      start
      think!

      params = calls.first
      blocks = params[:system]
      expect(blocks.length).to eq(3)
      # Regras primeiro, catálogo e marca com ponto de cache: é a ordem que
      # faz a leitura de cache valer no turno seguinte.
      expect(blocks[1][:text]).to include("Biblioteca de layouts").and include("text-only-solid")
      expect(blocks[1][:cache_control]).to eq({ type: "ephemeral" })
      expect(blocks[2][:text]).to include("Pão da Vila").and include("Pão de fermentação natural")
      expect(blocks[2][:cache_control]).to eq({ type: "ephemeral" })
      expect(params[:messages].last[:content]).to include("post da promoção de quarta")
    end

    it "leva os produtos e as palavras banidas da marca — é o que impede o agente de inventar" do
      calls = fake_chat(reply(statement))
      brand.update!(published_document: brand.published_document.deep_merge(
        "voice" => { "bannedWords" => [ { "id" => "b1", "text" => "artesanal de verdade" } ] }
      ))
      start
      think!

      brief = calls.first[:system][2][:text]
      expect(brief).to include("R$ 18").and include("artesanal de verdade")
    end
  end

  describe "quando falta um fato" do
    it "guarda a pergunta e estorna o crédito — perguntar não é entregar" do
      fake_chat(reply(question: "Qual é o preço da promoção de quarta?"))
      start

      expect { think! }.not_to change { brand.pieces.count }

      expect(organization.reload.credits_used).to eq(0)
      turn = AgentTurn.last
      expect(turn.status).to eq("question")
      expect(turn.question).to include("preço")
    end
  end

  describe "quando o plano não passa na validação" do
    it "tenta corrigir uma vez, com o erro no contexto" do
      calls = fake_chat(reply(statement("slides" => [ { "layout" => "layout-inventado", "content" => { "title" => "Oi" } } ])), reply(statement))
      start
      think!

      expect(calls.length).to eq(2)
      expect(calls.last[:messages].last[:content]).to include("layout-inventado")
      expect(AgentTurn.last.status).to eq("answered")
      expect(brand.pieces.count).to eq(1)
    end

    it "desiste na segunda e estorna, em vez de queimar crédito tentando" do
      calls = fake_chat(reply(statement("slides" => [ { "layout" => "layout-inventado", "content" => { "title" => "Oi" } } ])))
      start
      think!

      expect(calls.length).to eq(2)
      expect(organization.reload.credits_used).to eq(0)
      expect(AgentTurn.last).to be_failed
      expect(AgentTurn.last.error["code"]).to eq("agentInvalidPlan")
    end

    it "estorna quando o modelo falha de vez" do
      fake_chat(raises: Ai::Chat::Failed.new("overloaded"))
      start
      think!

      expect(organization.reload.credits_used).to eq(0)
      expect(AgentTurn.last.error["code"]).to eq("failed")
    end
  end

  describe "POST /brands/:id/conversations/:id/turns" do
    let(:conversation) do
      fake_chat(reply(statement))
      start
      think!
      AgentConversation.last
    end

    it "ajusta a peça escolhida e custa menos que o pedido inicial" do
      piece = conversation.turns.last.variations.first["pieceId"]
      fake_chat(reply(statement("slides" => [ { "layout" => "text-only-solid", "content" => { "title" => "Mais curto.", "body" => "R$ 18" } } ])))

      expect {
        post "/brands/#{brand.id}/conversations/#{conversation.id}/turns",
          params: { turn: { kind: "adjust", prompt: "encurta a frase", basePieceId: piece } },
          headers: headers
      }.to change { organization.reload.credits_used }.by(CatalogSerializer::AI_COSTS[:agentAdjust])

      expect(response).to have_http_status(:accepted)
      think!
      expect(conversation.turns.last.variations.length).to eq(1)
    end

    it "leva a peça de origem no contexto do ajuste, para o agente não recomeçar" do
      piece = conversation.turns.last.variations.first["pieceId"]
      calls = fake_chat(reply(statement))

      post "/brands/#{brand.id}/conversations/#{conversation.id}/turns",
        params: { turn: { kind: "adjust", prompt: "deixa o fundo mais escuro", basePieceId: piece } },
        headers: headers
      think!

      sent = calls.first[:messages].last[:content]
      expect(sent).to include("deixa o fundo mais escuro").and include("Pão de verdade")
      # O histórico veio junto: pedido anterior + o que o agente respondeu.
      expect(calls.first[:messages].length).to be >= 3
    end

    it "recusa ajuste sobre peça que não existe" do
      fake_chat(reply(statement))

      post "/brands/#{brand.id}/conversations/#{conversation.id}/turns",
        params: { turn: { kind: "adjust", prompt: "muda", basePieceId: SecureRandom.uuid } },
        headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("basePieceId")
    end

    it "recusa um segundo turno enquanto o primeiro ainda pensa" do
      fake_chat(reply(statement))
      start
      other = AgentConversation.last

      post "/brands/#{brand.id}/conversations/#{other.id}/turns",
        params: { turn: { prompt: "outro pedido" } }, headers: headers

      expect(response).to have_http_status(:conflict)
      expect(json.dig("error", "code")).to eq("busy")
    end
  end

  describe "anexo de foto" do
    it "aceita ativo da marca, descreve antes de pensar e o passa ao agente com a descrição" do
      photo = create(:brand_asset, :photo, brand_core: brand, organization: organization)
      described = JSON.generate("description" => "Pão de fermentação natural na bancada, luz da janela.", "shows" => %w[product_photo])
      calls = fake_chat(described, reply(statement))

      start(attachments: [ photo.id ])
      think!

      expect(response).to have_http_status(:created)
      expect(calls.first[:model]).to eq(DescribeBrandAsset.model)
      agent = calls.last
      expect(agent[:messages].last[:content]).to include(photo.id)
      expect(agent[:system][2][:text]).to include("Pão de fermentação natural na bancada").and include("product_photo")
    end

    it "foto já descrita não chama o modelo de novo" do
      photo = create(:brand_asset, :photo, brand_core: brand, organization: organization, description: "Vitrine de pães.", shows: %w[product_photo])
      calls = fake_chat(reply(statement))

      start(attachments: [ photo.id ])
      think!

      expect(calls.length).to eq(1)
      expect(calls.first[:system][2][:text]).to include("Vitrine de pães.")
    end

    it "recusa foto que não é da marca" do
      fake_chat(reply(statement))

      start(attachments: [ SecureRandom.uuid ])

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("attachments")
    end
  end

  describe "o teto de custo do mês" do
    it "corta antes de chamar o modelo quando a organização já estourou" do
      allow(ENV).to receive(:fetch).and_call_original
      allow(ENV).to receive(:fetch).with("AGENT_MONTHLY_COST_CENTS_CAP", "0").and_return("10")
      create(:agent_turn, organization: organization, cost_micro_usd: 2_000_000) # US$ 2,00

      expect { start }.not_to change { organization.reload.credits_used }

      expect(response).to have_http_status(:service_unavailable)
      expect(json.dig("error", "code")).to eq("costCapReached")
    end
  end

  describe "a lista e a faxina" do
    it "lista as conversas da marca, da mais recente para a mais antiga" do
      fake_chat(reply(statement))
      start
      start(prompt: "story do dia dos pais")

      get "/brands/#{brand.id}/conversations", headers: headers

      expect(json["conversations"].map { |c| c["title"] })
        .to eq([ "story do dia dos pais", "post da promoção de quarta" ])
      expect(json["retentionDays"]).to eq(30)
    end

    it "apagar a conversa não apaga as peças — a conversa é andaime, a peça é obra" do
      fake_chat(reply(statement))
      start
      think!
      conversation = AgentConversation.last

      expect { delete "/brands/#{brand.id}/conversations/#{conversation.id}", headers: headers }
        .not_to change { brand.pieces.count }

      expect(brand.pieces.first.agent_turn_id).to be_nil
    end

    it "a faxina leva as conversas paradas há mais de 30 dias" do
      fake_chat(reply(statement))
      start
      AgentConversation.last.update!(last_turn_at: 31.days.ago)

      expect { PurgeAgentConversationsJob.perform_now }
        .to change { AgentConversation.count }.by(-1)
    end
  end
end
