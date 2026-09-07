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

  before { Rails.cache.clear }

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
