require "rails_helper"

# A geração nunca toca a rede aqui: `Ai::Chat` é a costura, e o duplo devolve
# pedaços pré-gravados. Isso é o que permite testar crédito, estorno e o
# protocolo do fluxo sem chave de API e sem gastar dinheiro.
RSpec.describe "Geração por IA", type: :request do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }

  # Um `Ai::Chat` que escreve o que mandarmos, em pedaços.
  def fake_chat(pieces: [ "Comece ", "hoje **mesmo**." ], raises: nil)
    instance_double(Ai::Chat).tap do |chat|
      allow(chat).to receive(:stream_text) do |**, &block|
        raise raises if raises

        pieces.each { |piece| block.call(piece) }
      end
    end
  end

  def use_chat(chat)
    allow(Ai::Chat).to receive(:new).and_return(chat)
  end

  # `event: x\ndata: {...}` → [[:x, {...}], ...]
  def events_from(body)
    body.scan(/event: (\w+)\ndata: (.+)\n\n/).map { |name, data| [ name.to_sym, JSON.parse(data) ] }
  end

  describe "POST /ai/rewrite" do
    it "manda o texto em pedaços e fecha com o acumulado" do
      use_chat(fake_chat)

      post "/ai/rewrite", params: { text: "comeca hoje", intent: "fix" }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("text/event-stream")

      events = events_from(response.body)
      expect(events.map(&:first)).to eq(%i[start delta delta done])
      # Cada `delta` traz o texto **inteiro** até ali, não o incremento: o
      # editor substitui o bloco de uma vez.
      expect(events.select { |name, _| name == :delta }.map { |_, d| d["text"] })
        .to eq([ "Comece ", "Comece hoje **mesmo**." ])
      expect(events.last[1]["text"]).to eq("Comece hoje **mesmo**.")
    end

    it "cobra o crédito uma vez só" do
      use_chat(fake_chat)

      expect {
        post "/ai/rewrite", params: { text: "oi", intent: "fix" }, headers: headers
      }.to change { organization.reload.credits_used }.by(1)
    end

    it "abre o fluxo já dizendo o saldo, para a tela não ter que perguntar" do
      use_chat(fake_chat)

      post "/ai/rewrite", params: { text: "oi", intent: "fix" }, headers: headers

      _, payload = events_from(response.body).first
      expect(payload["credits"]).to include("total" => 50, "used" => 1, "left" => 49)
    end

    it "estorna quando o modelo falha e nada foi entregue" do
      use_chat(fake_chat(raises: Ai::Chat::Failed.new("overloaded")))

      expect {
        post "/ai/rewrite", params: { text: "oi", intent: "fix" }, headers: headers
      }.not_to change { organization.reload.credits_used }

      events = events_from(response.body)
      expect(events.last).to eq([ :error, { "error" => { "code" => "failed", "message" => I18n.t("ai.failed") } } ])
    end

    it "estorna quando não há chave de API, em vez de estourar" do
      use_chat(fake_chat(raises: Ai::Chat::MissingKey.new))

      expect {
        post "/ai/rewrite", params: { text: "oi", intent: "fix" }, headers: headers
      }.not_to change { organization.reload.credits_used }

      expect(events_from(response.body).last.first).to eq(:error)
    end

    it "recusa sem saldo antes de abrir o fluxo, com status de verdade" do
      organization.update!(credits_used: 50)
      use_chat(fake_chat)

      post "/ai/rewrite", params: { text: "oi", intent: "fix" }, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("noCredits")
      expect(response.media_type).to eq("application/json")
    end

    it "recusa uma segunda geração enquanto a primeira não terminou" do
      Rails.cache.write("ai:running:#{organization.id}", true)
      use_chat(fake_chat)

      expect {
        post "/ai/rewrite", params: { text: "oi", intent: "fix" }, headers: headers
      }.not_to change { organization.reload.credits_used }

      expect(response).to have_http_status(:conflict)
      expect(json.dig("error", "code")).to eq("busy")
    end

    it "libera a vez depois de terminar" do
      use_chat(fake_chat)

      post "/ai/rewrite", params: { text: "oi", intent: "fix" }, headers: headers
      post "/ai/rewrite", params: { text: "oi", intent: "fix" }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(organization.reload.credits_used).to eq(2)
    end

    it "exige sessão" do
      post "/ai/rewrite", params: { text: "oi", intent: "fix" }

      expect(response).to have_http_status(:unauthorized)
    end

    it "recusa requisição sem texto" do
      use_chat(fake_chat)

      post "/ai/rewrite", params: { intent: "fix" }, headers: headers

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
    end
  end

  describe "POST /ai/carousel" do
    # Um roteiro plausível, quebrado em pedaços como o modelo escreveria — é
    # assim que o scanner incremental é exercitado de verdade.
    def roteiro(cards: 4)
      itens = [ %({"kicker":"NUTRIÇÃO","title":"5 trocas simples","footer":"@carol"}) ]
      (cards - 1).times do |i|
        itens << %({"title":"Card #{i + 2}","body":"Texto com **negrito**.","bullets":["um","dois"]})
      end
      # Cerca de markdown de propósito: o modelo costuma embrulhar JSON.
      pieces = [ "```json\n[" ]
      itens.each_with_index do |item, i|
        pieces << (i.zero? ? item : ",#{item}")
      end
      pieces << "]\n```"
      pieces
    end

    it "manda um evento por card, assim que cada um fecha" do
      use_chat(fake_chat(pieces: roteiro(cards: 5)))

      post "/ai/carousel", params: { prompt: "comer melhor", cardCount: 5 }, headers: headers

      events = events_from(response.body)
      expect(events.map(&:first)).to eq(%i[start card card card card card done])
      expect(events.last[1]["cards"]).to eq(5)
    end

    it "produz cards que o editor abre: id, layout, align e blocos conhecidos" do
      use_chat(fake_chat(pieces: roteiro))

      post "/ai/carousel", params: { prompt: "comer melhor" }, headers: headers

      cards = events_from(response.body).select { |name, _| name == :card }.map(&:last)

      # A capa é o card que a biblioteca desenha na grade.
      capa = cards.first
      expect(capa["layout"]).to eq("image-full")
      expect(capa["align"]).to eq("bottom")
      expect(capa["image"].dig("source", "kind")).to eq("art")

      cards.each do |card|
        expect(card["id"]).to be_present
        expect(card["blocks"]).to all(include("id", "type"))
        expect(card["blocks"].map { |b| b["type"] })
          .to all(be_in(%w[text list stat quote divider button image]))
      end

      # Ids únicos: repetido quebraria as chaves de animação e o desfazer.
      todos = cards.flat_map { |c| c["blocks"].map { |b| b["id"] } } + cards.map { |c| c["id"] }
      expect(todos.uniq.length).to eq(todos.length)
    end

    it "transforma **negrito** em marcas, e não em asteriscos na tela" do
      use_chat(fake_chat(pieces: roteiro))

      post "/ai/carousel", params: { prompt: "x" }, headers: headers

      conteudo = events_from(response.body).select { |name, _| name == :card }.map(&:last)[1]
      corpo = conteudo["blocks"].find { |b| b["role"] == "body" }
      expect(corpo["spans"]).to include({ "text" => "negrito", "bold" => true })
    end

    it "monta um documento que o modelo Carousel aceita" do
      use_chat(fake_chat(pieces: roteiro(cards: 6)))

      post "/ai/carousel", params: { prompt: "x" }, headers: headers

      cards = events_from(response.body).select { |name, _| name == :card }.map(&:last)
      carousel = build(:carousel, organization: organization, cards: cards)

      expect(carousel).to be_valid
    end

    it "cobra os 5 créditos do carrossel" do
      use_chat(fake_chat(pieces: roteiro))

      expect {
        post "/ai/carousel", params: { prompt: "x" }, headers: headers
      }.to change { organization.reload.credits_used }.by(5)
    end

    it "pula item malformado sem derrubar a geração" do
      quebrado = [ "[", %({"kicker":"A","title":"Capa"}), ",{isso nao e json}",
                   %(,{"title":"B","body":"ok"}), %(,{"title":"C","body":"ok"}), "]" ]
      use_chat(fake_chat(pieces: quebrado))

      post "/ai/carousel", params: { prompt: "x" }, headers: headers

      expect(events_from(response.body).count { |name, _| name == :card }).to eq(3)
      expect(events_from(response.body).last.first).to eq(:done)
    end

    it "estorna quando sai pouca coisa aproveitável" do
      use_chat(fake_chat(pieces: [ "[", %({"title":"Só uma capa"}), "]" ]))

      expect {
        post "/ai/carousel", params: { prompt: "x" }, headers: headers
      }.not_to change { organization.reload.credits_used }

      expect(events_from(response.body).last.first).to eq(:error)
    end

    it "cobra quando o modelo falha no meio, porque os cards já foram entregues" do
      chat = instance_double(Ai::Chat)
      allow(chat).to receive(:stream_text) do |**, &block|
        block.call("[" + %({"kicker":"A","title":"Capa"}))
        block.call(%(,{"title":"B","body":"ok"}))
        block.call(%(,{"title":"C","body":"ok"}))
        block.call(%(,{"title":"D","body":"ok"}))
        raise Ai::Chat::Failed, "caiu no meio"
      end
      use_chat(chat)

      expect {
        post "/ai/carousel", params: { prompt: "x" }, headers: headers
      }.to change { organization.reload.credits_used }.by(5)

      events = events_from(response.body)
      expect(events.count { |name, _| name == :card }).to eq(4)
      expect(events.last.first).to eq(:error)
    end

    it "não deixa pedir um carrossel gigante" do
      chat = fake_chat(pieces: roteiro)
      use_chat(chat)

      post "/ai/carousel", params: { prompt: "x", cardCount: 500 }, headers: headers

      expect(chat).to have_received(:stream_text) do |prompt:, **|
        expect(prompt).to include("10 cards")
      end
    end

    it "recusa sem saldo" do
      organization.update!(credits_used: 48)
      use_chat(fake_chat(pieces: roteiro))

      post "/ai/carousel", params: { prompt: "x" }, headers: headers

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "code")).to eq("noCredits")
    end
  end

  describe "POST /ai/caption" do
    it "escreve a legenda em fluxo e cobra 1 crédito" do
      use_chat(fake_chat(pieces: [ "Arraste ", "para o lado." ]))

      expect {
        post "/ai/caption",
          params: { title: "5 trocas", cardText: "comer melhor" },
          headers: headers
      }.to change { organization.reload.credits_used }.by(1)

      expect(events_from(response.body).last[1]["text"]).to eq("Arraste para o lado.")
    end
  end

  describe "POST /ai/card-image" do
    def fake_complete(answer)
      instance_double(Ai::Chat).tap { |c| allow(c).to receive(:complete).and_return(answer) }
    end

    before do
      LibraryImage.create!(key: "amanhecer", base: "oklch(0.88 0.09 70)", position: 0, layers: [])
    end

    it "devolve arte quando o modelo escolhe arte" do
      use_chat(fake_complete(%({"kind":"art","style":"waves","tint":"ink"})))

      post "/ai/card-image", params: { hint: "café da manhã" }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["source"]).to include("kind" => "art", "style" => "waves", "tint" => "ink")
      expect(json["source"]["seed"]).to be_a(Integer)
      expect(json["credits"]).to include("used" => 2)
    end

    it "devolve peça da biblioteca quando o id existe" do
      use_chat(fake_complete(%(Escolhi esta: {"kind":"library","id":"amanhecer"})))

      post "/ai/card-image", params: { hint: "amanhecer" }, headers: headers

      expect(json["source"]).to eq({ "kind" => "library", "id" => "amanhecer" })
    end

    it "cai no padrão quando o modelo inventa um estilo" do
      use_chat(fake_complete(%({"kind":"art","style":"holograma","tint":"neon"})))

      post "/ai/card-image", params: { hint: "x" }, headers: headers

      expect(json["source"]).to include("style" => "blob", "tint" => "accent")
    end

    it "cai no padrão quando o modelo inventa um id de biblioteca" do
      use_chat(fake_complete(%({"kind":"library","id":"nao-existe"})))

      post "/ai/card-image", params: { hint: "x" }, headers: headers

      expect(json["source"]).to include("kind" => "art")
    end

    it "cai no padrão quando a resposta nem é JSON" do
      use_chat(fake_complete("não sei escolher"))

      post "/ai/card-image", params: { hint: "x" }, headers: headers

      expect(json["source"]).to include("kind" => "art")
    end

    it "cobra 2 créditos" do
      use_chat(fake_complete(%({"kind":"art","style":"dots"})))

      expect {
        post "/ai/card-image", params: { hint: "x" }, headers: headers
      }.to change { organization.reload.credits_used }.by(2)
    end

    it "estorna e responde limpo quando o modelo falha" do
      chat = instance_double(Ai::Chat)
      allow(chat).to receive(:complete).and_raise(Ai::Chat::Failed, "overloaded")
      use_chat(chat)

      expect {
        post "/ai/card-image", params: { hint: "x" }, headers: headers
      }.not_to change { organization.reload.credits_used }

      expect(response).to have_http_status(:service_unavailable)
      expect(json.dig("error", "code")).to eq("failed")
    end
  end

  describe "instruções do modelo" do
    it "leva a voz do produto e o pedido, separados" do
      chat = fake_chat
      use_chat(chat)

      post "/ai/rewrite", params: { text: "texto original", intent: "shorten" }, headers: headers

      expect(chat).to have_received(:stream_text) do |system:, prompt:, **|
        # O bloco estável (que carrega o cache) é a voz; o volátil é o pedido.
        expect(system).to include("português do Brasil")
        expect(prompt).to include("mais curto")
        expect(prompt).to include("texto original")
      end
    end
  end
end
