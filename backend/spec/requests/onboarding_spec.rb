require "rails_helper"

# O onboarding por conversa, de ponta a ponta: a pessoa responde, o job lê a
# resposta e o brandcore vai sendo montado por baixo.
#
# Nada aqui toca a rede. Sem chave de API, a leitura cai na versão sem modelo
# e o "cria pra mim" nas propostas curadas — exatamente o comportamento de
# produção quando o modelo não responde. Onde o teste precisa do modelo, um
# dublê de `Ai::Chat` devolve o JSON que a spec manda.
RSpec.describe "Onboarding por conversa", type: :request do
  include ActiveJob::TestHelper

  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }
  let(:brand) { organization.brand_cores.create! }
  let(:base) { "/brands/#{brand.id}/onboarding" }

  def start
    post "#{base}/start", headers: headers, as: :json
  end

  def show
    get base, headers: headers, as: :json
    json
  end

  # Manda uma fala e deixa o job responder, como o Sidekiq faria.
  def message(kind, **attributes)
    post "#{base}/messages", params: { message: { kind: kind, **attributes } }, headers: headers, as: :json
    status = response.status
    perform_enqueued_jobs(only: AgentTurnJob)
    status
  end

  def answer(text) = message("answer", text: text)

  def last_turn = show["turns"].last

  def reply = last_turn["reply"]

  def reply_types = reply.map { |item| item["type"] }

  def statuses = reply.select { |item| item["type"] == "status" }.map { |item| item["topic"] }

  def model_answers(*payloads)
    chat = instance_double(Ai::Chat)
    answers = payloads.map { |payload|
      Ai::Chat::Answer.new(text: JSON.generate(payload),
        usage: { input: 900, output: 200, cacheRead: 0, cacheWrite: 0 }, model: "claude-opus-5")
    }
    allow(chat).to receive(:answer).and_return(*answers)
    allow(Ai::Chat).to receive(:new).and_return(chat)
  end

  # Leva a conversa até `topic` com a marca de exemplo já preenchida — o que
  # interessa ao teste é o tema, não as perguntas anteriores.
  def reach(topic)
    brand.update!(document: build(:brand_core, :complete).document)
    previous = BrandCore::Onboarding::TOPICS.take_while { |t| t != topic }
    brand.track_onboarding(close: previous)
    brand.save!
    start
  end

  describe "abrir a conversa" do
    it "sem conversa ainda, a tela mostra a intro" do
      expect(show).to include("conversationId" => nil, "turns" => [])
      expect(json["state"]).to include("topic" => "brand", "position" => 1, "total" => 8)
    end

    it "começar é idempotente: duas abas caem na mesma conversa" do
      start
      expect(response).to have_http_status(:created)
      first = json["conversationId"]

      start
      expect(response).to have_http_status(:ok)
      expect(json["conversationId"]).to eq(first)
      expect(brand.agent_conversations.onboarding.count).to eq(1)
    end

    it "não aparece na lista de conversas de criação de peças" do
      start

      get "/brands/#{brand.id}/conversations", headers: headers, as: :json
      expect(json["conversations"]).to be_empty
    end
  end

  describe "cada resposta vira campo do brandcore" do
    before { start }

    it "grava no rascunho, confirma e faz a próxima pergunta" do
      model_answers({ "fields" => {
        "name" => "Padaria do João", "concept" => "Pão de fermentação natural, assado às 6h.",
        "segment" => "Padaria de bairro", "segmentCode" => "restaurant"
      } })

      expect(answer("Padaria do João. Pão de fermentação natural, assado às 6h.")).to eq(202)

      expect(last_turn["status"]).to eq("answered")
      expect(reply).to eq([
        { "type" => "status", "topic" => "brand" },
        { "type" => "question", "topic" => "audience" }
      ])
      brand.reload
      expect(brand.full_document.dig("identity", "name")).to eq("Padaria do João")
      expect(brand.onboarding_segment).to eq("restaurant")
      # Rascunho: nada publicado até a pessoa publicar.
      expect(brand).not_to be_published
      expect(json["state"]).to include("topic" => "audience", "position" => 2)
    end

    it "marca: o ramo sai do que ela vende, e vaga de novo depois do seguimento não prende no tema" do
      model_answers(
        { "fields" => { "name" => "Vinix", "concept" => "Vinis" }, "vague" => true,
          "followUp" => "Que tipo de vinil? Novos, usados, raros?" },
        { "fields" => { "concept" => "Vinis raros com potencial de valorização" }, "vague" => true }
      )

      answer("Vinix uma marca de vinis")
      expect(reply_types).to eq([ "followUp" ])

      answer("vinis raros com potencial de valorização")
      expect(statuses).to eq([ "brand" ])
      expect(reply.last).to eq("type" => "question", "topic" => "audience")
      expect(brand.reload.full_document.dig("identity", "segment")).to eq("Vinis")
    end

    it "não gasta crédito — só conta o custo no turno" do
      model_answers({ "fields" => { "name" => "Padaria do João", "concept" => "Pão.", "segment" => "Padaria" } })

      expect { answer("Padaria do João, pão") }.not_to change { organization.reload.credits_used }
      turn = brand.onboarding_conversation.turns.last
      expect(turn.credits_charged).to eq(0)
      expect(turn.cost_micro_usd).to be > 0
    end

    it "um turno pensando de cada vez" do
      brand.onboarding_conversation.turns.create!(
        organization: organization, kind: "answer", prompt: "x", status: "thinking"
      )

      post "#{base}/messages", params: { message: { kind: "answer", text: "y" } }, headers: headers, as: :json
      expect(response).to have_http_status(:conflict)
    end

    it "recusa resposta vazia e tipo de fala que não existe" do
      expect(message("answer", text: "  ")).to eq(400)
      expect(message("gritar")).to eq(422)
    end
  end

  describe "resposta vaga" do
    before { reach("audience") }

    it "o agente pergunta de volta sobre o que ela disse — uma vez só por tema" do
      model_answers(
        { "fields" => { "audience" => "todo mundo" }, "vague" => true,
          "followUp" => "Quem compra mais? Vizinho do bairro, quem passa indo pro trabalho, encomenda de festa?" },
        { "fields" => { "audience" => "todo mundo, qualquer um" }, "vague" => true, "followUp" => "De novo?" }
      )

      answer("todo mundo")
      expect(reply).to eq([ {
        "type" => "followUp",
        "text" => "Quem compra mais? Vizinho do bairro, quem passa indo pro trabalho, encomenda de festa?"
      } ])
      expect(json["state"]["topic"]).to eq("audience")

      # Segunda vaga: segue em frente com o que ela disse.
      answer("qualquer um")
      expect(statuses).to eq([ "audience" ])
      expect(reply.last).to eq("type" => "question", "topic" => "differential")
    end

    it "sem o texto do modelo, usa o seguimento genérico" do
      model_answers({ "fields" => {}, "vague" => true, "followUp" => nil })

      answer("sei lá")
      expect(reply).to eq([ { "type" => "text", "code" => "followUpGeneric" } ])
    end

    it "tema obrigatório não fecha vazio: depois do seguimento, a pergunta volta" do
      brand.track_onboarding(close: %w[audience differential voice banned offers logo])
      brand.assign_section("palette", "colors" => [])
      brand.save!
      model_answers({ "fields" => {}, "vague" => true }, { "fields" => {}, "vague" => true })

      answer("bonitas")
      answer("umas cores legais")

      expect(reply).to eq([ { "type" => "question", "topic" => "palette" } ])
      expect(json["state"]["topic"]).to eq("palette")
    end
  end

  describe "sair e voltar" do
    it "a conversa e o rascunho persistem; reabrir retoma no tema onde parou" do
      start
      model_answers(
        { "fields" => { "name" => "Padaria do João", "concept" => "Pão.", "segment" => "Padaria" } },
        { "fields" => { "audience" => "Quem mora no bairro." } }
      )
      answer("Padaria do João, pão")
      answer("Quem mora no bairro.")

      # Outra sessão, outro dia.
      thread = show
      expect(thread["turns"].map { |t| t["text"] }).to eq([ "Padaria do João, pão", "Quem mora no bairro." ])
      expect(thread["state"]).to include("topic" => "differential", "position" => 3,
        "closed" => %w[brand audience])
      expect(brand.reload.full_document.dig("identity", "audience")).to eq("Quem mora no bairro.")
    end

    it "marca que parou no meio do onboarding de telas retoma a conversa sem repetir o que já respondeu" do
      brand.update!(document: build(:brand_core, :complete).document,
        progress: { "onboarding" => { "step" => "fonts", "answered" => %w[name what handle colors], "skipped" => [ "logo" ] } })

      thread = show

      expect(response).to have_http_status(:ok)
      expect(thread["state"]["closed"]).to eq(%w[brand logo palette])
      expect(thread["state"]["topic"]).to eq("audience")
    end

    it "marca já publicada abre normalmente e conta como concluída" do
      published = create(:brand_core, :published, organization: organization)

      get "/brands/#{published.id}/onboarding", headers: headers, as: :json
      expect(response).to have_http_status(:ok)
      expect(json["state"]["done"]).to be(true)

      get "/brands/#{published.id}", headers: headers, as: :json
      expect(json["document"]["identity"]["name"]).to eq("Pão da Vila")
    end
  end

  describe "o chip \"não sei — cria pra mim\"" do
    it "tom de voz: três propostas, a escolha vira fala e grava" do
      reach("voice")

      message("suggest")
      expect(reply.first).to eq("type" => "text", "code" => "suggest.voice")
      options = reply.find { |item| item["type"] == "options" }
      expect(options["items"].length).to eq(3)

      suggest_turn = last_turn["id"]
      message("choose", turnId: suggest_turn, index: 1)

      chosen = options["items"][1]
      expect(last_turn["choice"]).to include("kind" => "voice", "index" => 1)
      expect(reply).to eq([
        { "type" => "confirm", "topic" => "voice" },
        { "type" => "question", "topic" => "banned" }
      ])
      voice = brand.reload.full_document["voice"]
      expect(voice["essence"]).to eq(chosen["essence"])
      expect(voice["tones"]).to eq(chosen["tones"])
    end

    it "paleta e fonte: dois seletores em sequência, e o logotipo pedido sai em três opções no resumo" do
      reach("logo")
      brand.assign_section("palette", "colors" => [])
      brand.assign_section("typography", "display" => {}, "utility" => {})
      brand.save!

      message("suggest")
      expect(reply).to include({ "type" => "text", "code" => "wordmarkNoted" }, { "type" => "status", "topic" => "logoNoted" })
      expect(brand.reload).to be_wants_wordmark

      message("suggest")
      palettes = last_turn["id"]
      message("choose", turnId: palettes, index: 0)
      expect(reply.first).to eq("type" => "confirm", "topic" => "palette")
      expect(reply).to include({ "type" => "text", "code" => "suggest.fonts" })

      fonts = last_turn["id"]
      message("choose", turnId: fonts, index: 2)
      expect(reply_types).to eq(%w[confirm text options summary])
      options = reply.find { |item| item["type"] == "options" }
      expect(options).to include("kind" => "wordmark")
      expect(options["items"].map { |item| item["style"] }).to eq(%w[asWritten spacedCaps boldLower])

      brand.reload
      expect(BrandCore::Onboarding.satisfied?("palette", brand.full_document)).to be(true)
      expect(BrandCore::Onboarding.satisfied?("fonts", brand.full_document)).to be(true)
      # Três logos, claro + escuro cada; a primeira já é a principal.
      expect(brand.assets.where(kind: "logo", generated: true).count).to eq(6)
      expect(brand.primary_logo.id).to eq(options["items"].first["logoId"])
      expect(json["state"]).to include("topic" => "summary", "readyToFinish" => true)

      # Escolher outra troca a principal e diz que a logo ficou nos ativos.
      message("choose", turnId: last_turn["id"], index: 1)
      expect(reply).to eq([
        { "type" => "confirm", "topic" => "logo" },
        { "type" => "status", "topic" => "logoSaved" },
        { "type" => "summary" }
      ])
      expect(brand.reload.primary_logo.id).to eq(options["items"].second["logoId"])
      expect(brand.logos.count).to eq(3)
    end

    it "\"não sei\" escrito vale o mesmo que o chip" do
      reach("palette")
      model_answers({ "fields" => {}, "wantsSuggestion" => true })

      answer("não faço ideia, escolhe você")
      expect(reply.map { |item| item["type"] }).to eq(%w[text options])
    end

    it "só existe nos temas de tom, logo, paleta e fonte" do
      reach("audience")

      expect(message("suggest")).to eq(422)
    end

    it "recusa escolher uma proposta que não existe" do
      reach("voice")
      message("suggest")

      expect(message("choose", turnId: last_turn["id"], index: 7)).to eq(422)
    end
  end

  describe "logo" do
    before { reach("logo") }

    it "a logo enviada é recebida e a conversa segue para cores e fonte" do
      post "/brands/#{brand.id}/assets",
        params: { file: fixture_file_upload("logo-transparente.png", "image/png"), kind: "logo", variant: "light" },
        headers: headers
      asset = json["id"]

      message("logo", assetId: asset)
      expect(reply).to eq([
        { "type" => "status", "topic" => "logoUploaded" },
        { "type" => "status", "topic" => "logoSaved" },
        { "type" => "question", "topic" => "palette" }
      ])
      expect(brand.reload.full_document.dig("assets", "primaryLogoId")).to eq(json["turns"].last && BrandAsset.find(asset).logo_id)
    end

    it "avisa quando a logo tem fundo chapado" do
      post "/brands/#{brand.id}/assets",
        params: { file: fixture_file_upload("logo-opaco.png", "image/png"), kind: "logo", variant: "light" },
        headers: headers

      message("logo", assetId: json["id"])
      expect(reply).to include({ "type" => "text", "code" => "logoOpaque" })
    end
  end

  describe "cores e fonte numa resposta só" do
    before do
      reach("palette")
      brand.assign_section("palette", "colors" => [])
      brand.assign_section("typography", "display" => {}, "utility" => {})
      brand.save!
    end

    it "fecha os dois temas e chega ao resumo" do
      model_answers({ "fields" => { "colors" => [ "#1b2a4a", "#c9a227" ], "displayFont" => "Fraunces", "utilityFont" => "Inter" } })

      answer("azul-marinho e dourado, Fraunces nos títulos e Inter no texto")
      expect(statuses).to eq(%w[palette fonts])
      expect(reply.last).to eq("type" => "summary")
    end

    it "fonte fora do catálogo: avisa e deixa a fonte aberta para o \"cria pra mim\"" do
      model_answers({ "fields" => { "colors" => [ "#1b2a4a" ], "displayFont" => "Gotham" } })

      answer("azul-marinho, fonte Gotham")
      expect(reply).to eq([
        { "type" => "status", "topic" => "palette" },
        { "type" => "text", "code" => "fontMissing", "params" => { "font" => "Gotham" } }
      ])
      expect(json["state"]["topic"]).to eq("fonts")
      expect(brand.reload.onboarding_wanted_font).to eq("Gotham")
    end
  end

  describe "o motor fora do ar" do
    before { reach("audience") }

    it "a resposta fica salva e tentar de novo reprocessa a mesma fala" do
      chat = instance_double(Ai::Chat)
      allow(chat).to receive(:answer).and_raise(Ai::Chat::Failed, "APIConnectionError")
      allow(Ai::Chat).to receive(:new).and_return(chat)

      answer("Quem mora no bairro.")
      expect(last_turn).to include("status" => "failed", "error" => "modelDown", "text" => "Quem mora no bairro.")
      expect(json["state"]["topic"]).to eq("audience")

      model_answers({ "fields" => { "audience" => "Quem mora no bairro." } })
      post "#{base}/retry", params: { turnId: last_turn["id"] }, headers: headers, as: :json
      expect(response).to have_http_status(:accepted)
      perform_enqueued_jobs(only: AgentTurnJob)

      expect(last_turn["status"]).to eq("answered")
      expect(statuses).to eq([ "audience" ])
      expect(show["turns"].length).to eq(1)
    end

    it "teto de custo batido: a conversa segue sem o modelo" do
      allow(Agent::Budget).to receive(:check!).and_raise(Agent::Budget::CapReached)

      answer("Quem mora no bairro.")
      expect(last_turn["status"]).to eq("answered")
      expect(brand.reload.full_document.dig("identity", "audience")).to eq("Quem mora no bairro.")
    end
  end

  describe "← voltar" do
    def back
      post "#{base}/back", headers: headers, as: :json
    end

    it "reabre o tema anterior, guarda o que foi gravado e deixa a pergunta no fio" do
      reach("voice")
      back

      expect(response).to have_http_status(:ok)
      expect(json["state"]).to include("topic" => "differential", "position" => 3)
      expect(json["turns"].last).to include("kind" => "back", "status" => "answered", "topic" => "voice",
        "reply" => [ { "type" => "question", "topic" => "differential" } ])
      expect(brand.reload.onboarding_closed).to eq(%w[brand audience])
      expect(brand.full_document.dig("identity", "positioning")).to be_present
    end

    it "a resposta nova fecha o tema reaberto e a conversa segue de onde estava" do
      reach("voice")
      back
      answer("A única do bairro que entrega quentinho às 6h.")

      expect(statuses).to eq([ "differential" ])
      expect(reply.last).to eq("type" => "question", "topic" => "voice")
    end

    it "do resumo, volta para cores e fonte — uma pergunta, dois temas" do
      reach("summary")
      back

      expect(json["state"]).to include("topic" => "palette", "position" => 8)
      expect(brand.reload.onboarding_closed).not_to include("palette", "fonts")
    end

    it "da primeira pergunta não há para onde voltar" do
      start
      back

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("topic")
    end

    it "não volta enquanto o agente lê a resposta" do
      reach("voice")
      post "#{base}/messages", params: { message: { kind: "answer", text: "Fala de vizinho." } }, headers: headers, as: :json
      back

      expect(response).to have_http_status(:conflict)
      clear_enqueued_jobs
    end
  end

  describe "resumo, ajuste e publicação" do
    before { reach(BrandCore::Onboarding::SUMMARY) }

    it "ajustar depois do resumo grava no campo certo, confirma e mostra o resumo de novo" do
      model_answers({ "fields" => { "name" => "Padaria da Vila" } })

      answer("o nome é Padaria da Vila")
      expect(reply).to eq([ { "type" => "status", "topic" => "brand" }, { "type" => "summary" } ])
      expect(brand.reload.full_document.dig("identity", "name")).to eq("Padaria da Vila")
    end

    it "pedido de ajuste sem o que ajustar: o agente pergunta o tema e o valor" do
      model_answers({ "fields" => {} })

      answer("quero mudar uma coisa")
      expect(reply).to eq([ { "type" => "text", "code" => "adjustAsk" } ])
    end

    it "publicar cria a versão 1 pelo fluxo de sempre e libera o agente" do
      expect { post "#{base}/finish", headers: headers, as: :json }
        .to change { brand.reload.current_version }.from(0).to(1)

      expect(response).to have_http_status(:ok)
      expect(brand.reload).to be_published
      expect(brand.onboarding_done?).to be(true)
      expect(brand.generation_contract[:ready]).to be(true)
    end

    it "preenche a voz que ficou sem resposta, para o mínimo de publicação fechar" do
      brand.assign_section("voice", brand.full_document["voice"].merge("essence" => "", "tones" => []))
      brand.save!

      post "#{base}/finish", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      voice = brand.reload.full_document["voice"]
      expect(voice["essence"]).to be_present
      expect(voice["tones"]).not_to be_empty
    end
  end

  it "recusa publicar antes do mínimo, dizendo o que falta" do
    start
    post "#{base}/finish", headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_entity)
    expect(json.dig("error", "code")).to eq("brandIncomplete")
  end

  describe "o logotipo" do
    it "desenha as duas versões com a fonte e as cores já escolhidas" do
      reach(BrandCore::Onboarding::SUMMARY)

      post "#{base}/wordmark", headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["assets"].map { |a| a["variant"] }).to match_array(%w[light dark])
    end

    it "não desenha sem nome, e explica" do
      post "#{base}/wordmark", headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("name")
    end
  end

  describe "a telemetria do funil" do
    it "conta quem respondeu, precisou de seguimento e pediu ajuda em cada tema" do
      reach("audience")
      model_answers({ "fields" => {}, "vague" => true, "followUp" => "Quem compra mais?" })
      answer("todo mundo")
      brand.reload.track_onboarding(close: %w[audience differential])
      brand.save!
      message("suggest")

      funnel = OnboardingEvent.funnel.index_by { |row| row["step"] }
      expect(funnel["audience"]["followedUp"]).to eq(1)
      expect(funnel["voice"]["suggested"]).to eq(1)
    end

    it "sobrevive à marca ser apagada — o custo do mês não pode sumir com ela" do
      reach("audience")
      answer("Quem mora no bairro.")

      expect { brand.destroy! }.not_to change { OnboardingEvent.count }
      expect(OnboardingEvent.ordered.last.brand_core_id).to be_nil
    end
  end
  describe "a logo com símbolo" do
    it "o resumo sai com o logotipo e avisa que as logos com símbolo vêm; escolher uma traz o símbolo como glifo" do
      allow(Logos::Concepts).to receive(:available?).and_return(true)
      reach("logo")
      brand.assign_section("palette", "colors" => [])
      brand.assign_section("typography", "display" => {}, "utility" => {})
      brand.save!

      message("suggest")
      message("suggest")
      message("choose", turnId: last_turn["id"], index: 0)
      expect {
        message("choose", turnId: last_turn["id"], index: 2)
      }.to have_enqueued_job(LogoConceptsJob)

      options = reply.find { |item| item["type"] == "options" }
      expect(options).to include("kind" => "wordmark", "pending" => Logos::Concepts::DIRECTIONS.size)
      expect(options["items"].size).to eq(3)

      # O job (com o gerador de mentira) acrescenta uma logo com símbolo.
      svg = %(<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10"><path d="M0 0H10V10H0Z" fill="#3B2A1A"/></svg>)
      concept_logo = SecureRandom.uuid
      create(:brand_asset, brand_core: brand.reload, kind: "logo", variant: "light", logo_id: concept_logo, generated: true,
        meta: { "origin" => "onboarding", "symbolSvg" => svg,
                "concept" => { "id" => "c", "direction" => "monogram", "arrangement" => "stacked", "idea" => "A letra" } })
      allow(Logos::Concepts).to receive(:new) { |_brand, on_concept:, **|
        double(call: (on_concept.call("monogram", [ concept_logo ]) || Logos::Concepts::Result.new(logo_ids: [ concept_logo ], failed: [], cost_micro_usd: 0)))
      }
      perform_enqueued_jobs(only: LogoConceptsJob)

      summary_turn = last_turn
      options = reply.find { |item| item["type"] == "options" }
      expect(options).to include("pending" => 0, "failed" => 0)
      expect(options["items"].last).to include("logoId" => concept_logo, "concept" => include("direction" => "monogram"))

      message("choose", turnId: summary_turn["id"], index: 3)
      expect(brand.reload.primary_logo.id).to eq(concept_logo)
      expect(brand.assets.where(kind: "glyph").pluck(:variant)).to match_array(%w[light dark])
    end
  end
end

# As marcas que nasceram antes do onboarding existir.
RSpec.describe "Onboarding e marcas antigas", type: :request do
  it "trata marca já publicada como cadastro concluído, sem migração de dados" do
    brand = create(:brand_core, :published)

    expect(brand.onboarding_done?).to be(true)
    expect(brand.onboarding_pending?).to be(false)
  end

  it "marca em rascunho que já usou o formulário de edição não volta ao onboarding" do
    brand = create(:brand_core)
    brand.track_progress(visited: [ "identity" ], last_step: "identity")
    brand.save!

    expect(brand.onboarding_pending?).to be(false)
  end

  it "salvar uma etapa do wizard não apaga o progresso da conversa" do
    account = create(:account)
    brand = account.organization.brand_cores.create!
    brand.track_onboarding(close: %w[brand audience])
    brand.save!

    patch "/brands/#{brand.id}",
      params: { brand: { document: { identity: { name: "Outro nome" } }, progress: { lastStep: "identity" } } },
      headers: auth_headers(account), as: :json

    expect(brand.reload.onboarding_closed).to eq(%w[brand audience])
    expect(brand.last_step).to eq("identity")
  end
end
