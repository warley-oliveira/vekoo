require "rails_helper"

# A leitura de uma resposta do onboarding: o JSON que o modelo devolve vira
# campo do brandcore — e só os campos que o tema da pergunta pode tocar.
# Nada aqui toca a rede: o `Ai::Chat` é um dublê que devolve o texto que a
# spec manda.
RSpec.describe Onboarding::Interpret do
  let(:brand) { create(:brand_core) }

  def chat_saying(text)
    instance_double(Ai::Chat).tap do |chat|
      allow(chat).to receive(:answer).and_return(
        Ai::Chat::Answer.new(text: text, usage: { input: 800, output: 120, cacheRead: 0, cacheWrite: 0 },
          model: "claude-opus-5")
      )
    end
  end

  def interpret(topic, payload, text: "resposta", follow_up_available: true)
    raw = payload.is_a?(String) ? payload : JSON.generate(payload)
    described_class.call(brand, topic: topic, text: text, follow_up_available: follow_up_available,
      chat: chat_saying(raw))
  end

  # Lê e grava, como o `Onboarding::Run` faz.
  def apply(topic, payload, **options)
    result = interpret(topic, payload, **options)
    outcome = Onboarding::Fields.apply(brand, result.fields, topic: topic)
    [ result, outcome, brand.full_document ]
  end

  describe "campo certo para cada tema" do
    it "marca: nome, o que vende, ramo e o código do ramo" do
      result, outcome, document = apply("brand", { "fields" => {
        "name" => "Padaria do João", "concept" => "Pão de fermentação natural, assado às 6h.",
        "segment" => "Padaria de bairro", "segmentCode" => "restaurant"
      } })

      expect(document["identity"]).to include(
        "name" => "Padaria do João", "concept" => "Pão de fermentação natural, assado às 6h.",
        "segment" => "Padaria de bairro"
      )
      expect(result.fields["segmentCode"]).to eq("restaurant")
      expect(outcome.touched).to eq([ "brand" ])
    end

    it "público vai para identity.audience; diferencial para positioning" do
      brand.assign_section("identity", brand.full_document["identity"].merge("name" => "Padaria do João"))
      apply("audience", { "fields" => { "audience" => "Quem mora no bairro e compra pão todo dia." } })
      apply("differential", { "fields" => { "positioning" => "Fermentação de 36 horas, sem aditivo." } })

      identity = brand.full_document["identity"]
      expect(identity["audience"]).to eq("Quem mora no bairro e compra pão todo dia.")
      expect(identity["positioning"]).to eq("Fermentação de 36 horas, sem aditivo.")
    end

    it "tom de voz: guarda o exemplo literal e infere essência e tons, descartando tom que não existe" do
      _, outcome, document = apply("voice", { "fields" => {
        "example" => "Saiu do forno agora. Corre.",
        "essence" => "Fala como quem está no balcão: curto e quente.",
        "tones" => %w[warm direct sarcastic]
      } })

      voice = document["voice"]
      expect(voice["examples"].map { |e| e["text"] }).to eq([ "Saiu do forno agora. Corre." ])
      expect(voice["essence"]).to eq("Fala como quem está no balcão: curto e quente.")
      expect(voice["tones"]).to eq(%w[warm direct])
      expect(outcome.touched).to eq([ "voice" ])
    end

    it "lista negra: palavras banidas e a observação de tom contam como o tema dela" do
      _, outcome, document = apply("banned", { "fields" => {
        "bannedWords" => [ "imperdível", "gourmet", "imperdível" ],
        "toneNote" => "Nada de política nem de promoção gritada."
      } })

      expect(document["voice"]["bannedWords"].map { |w| w["text"] }).to eq(%w[imperdível gourmet])
      expect(document["voice"]["toneNote"]).to eq("Nada de política nem de promoção gritada.")
      expect(outcome.touched).to eq([ "banned" ])
    end

    it "oferta: preço como ela escreveu, item sem nome some" do
      _, outcome, document = apply("offers", { "fields" => { "offers" => [
        { "name" => "Pão de fermentação natural", "price" => "R$ 18", "validity" => "todo dia" },
        { "name" => "", "price" => "R$ 5" }
      ] } })

      items = document["offers"]["items"]
      expect(items.length).to eq(1)
      expect(items.first).to include("name" => "Pão de fermentação natural", "price" => "R$ 18", "validity" => "todo dia")
      expect(outcome.touched).to eq([ "offers" ])
    end

    it "paleta: as cores dela viram a paleta inteira, com papéis e contraste" do
      _, outcome, document = apply("palette", { "fields" => { "colors" => [ "#1B2A4A", "#C9A227" ] } })

      roles = document["palette"]["colors"].map { |c| c["role"] }
      expect(roles).to include("darkBackground", "lightBackground", "textOnDark", "textOnLight", "accent")
      expect(BrandCore::Onboarding.satisfied?("palette", document)).to be(true)
      expect(outcome.touched).to eq([ "palette" ])
    end

    it "fonte do catálogo entra mesmo escrita do jeito dela; uma fonte só vale para título e texto" do
      _, outcome, document = apply("fonts", { "fields" => { "displayFont" => "montserrat bold" } })

      expect(document.dig("typography", "display", "family")).to eq("Montserrat")
      expect(document.dig("typography", "utility", "family")).to eq("Montserrat")
      expect(outcome.touched).to eq([ "fonts" ])
    end

    it "qualquer fonte aberta do Google Fonts entra, não só a vitrine" do
      _, outcome, document = apply("fonts", { "fields" => { "displayFont" => "libre caslon text bold" } })

      expect(document.dig("typography", "display")).to include("family" => "Libre Caslon Text", "weights" => [ 700 ])
      expect(document.dig("typography", "utility", "family")).to eq("Libre Caslon Text")
      expect(outcome.touched).to eq([ "fonts" ])
    end

    it "nome exato vence a vitrine: Inter Tight não vira Inter" do
      _, _, document = apply("fonts", { "fields" => { "displayFont" => "Inter Tight" } })

      expect(document.dig("typography", "display", "family")).to eq("Inter Tight")
    end

    it "par com uma fonte fechada: a aberta entra no papel dela e a outra volta como a que falta" do
      _, outcome, document = apply("fonts", { "fields" => { "displayFont" => "Gotham", "utilityFont" => "Montserrat" } })

      expect(outcome.missing_font).to eq("Gotham")
      expect(outcome.kept_font).to eq("Montserrat")
      expect(outcome.touched).to be_empty
      expect(document.dig("typography", "utility", "family")).to eq("Montserrat")
      expect(document.dig("typography", "display", "family")).to eq("")
    end

    it "fonte fora do catálogo não entra: volta como a que falta" do
      _, outcome, document = apply("fonts", { "fields" => { "displayFont" => "Interstate" } })

      expect(outcome.missing_font).to eq("Interstate")
      expect(outcome.touched).to be_empty
      expect(document.dig("typography", "display", "family")).to eq("")
    end
  end

  describe "o que o modelo não pode fazer" do
    it "descarta campo de outro tema: a resposta sobre o público não reescreve o nome" do
      brand.assign_section("identity", brand.full_document["identity"].merge("name" => "Padaria do João"))

      result, = apply("audience", { "fields" => { "audience" => "Vizinhos.", "name" => "Outro Nome" } })

      expect(result.fields.keys).to eq([ "audience" ])
      expect(brand.full_document.dig("identity", "name")).to eq("Padaria do João")
    end

    it "aceita @ e endereço citados no meio de qualquer resposta" do
      brand.assign_section("identity", brand.full_document["identity"].merge("name" => "Padaria do João"))
      result, = apply("audience", { "fields" => { "audience" => "Vizinhos.", "instagram" => "@padariadojoao" } })

      expect(result.fields["instagram"]).to eq("padariadojoao")
      expect(brand.full_document.dig("identity", "instagram")).to eq("padariadojoao")
    end

    it "marca: o modelo não classificou o ramo, o que ela vende vira o ramo" do
      result, = apply("brand", { "fields" => { "name" => "Vinix", "concept" => "Vinis raros com potencial de valorização" } })
      expect(result.fields["segment"]).to eq("Vinis raros com potencial de valorização")

      # Nome e conceito já gravados, resposta sem campo novo: o ramo ainda sai.
      brand.assign_section("identity", brand.full_document["identity"].merge("segment" => ""))
      result = interpret("brand", { "fields" => {}, "vague" => true })
      expect(result.fields).to eq("segment" => "Vinis raros com potencial de valorização")
    end

    it "no ajuste depois do resumo, vale qualquer campo" do
      result, = apply("summary", { "fields" => { "name" => "Padaria da Vila", "colors" => [ "#112233" ] } })

      expect(result.fields.keys).to contain_exactly("name", "colors")
    end
  end

  describe "resposta vaga e seguimento" do
    it "traz o seguimento escrito pelo modelo quando ainda cabe um" do
      result = interpret("brand", { "fields" => { "segment" => "padaria" }, "vague" => true,
        "followUp" => "O que diferencia a sua? Tipo de pão, horário, bairro, preço?" })

      expect(result).to be_vague
      expect(result.follow_up).to eq("O que diferencia a sua? Tipo de pão, horário, bairro, preço?")
    end

    it "ignora o seguimento quando o tema já gastou o dele" do
      result = interpret("brand", { "fields" => {}, "vague" => true, "followUp" => "Mais detalhe?" },
        follow_up_available: false)

      expect(result.follow_up).to be_nil
    end

    it "entende pedido de proposta e resposta de quem não tem" do
      expect(interpret("palette", { "fields" => {}, "wantsSuggestion" => true })).to be_wants_suggestion
      expect(interpret("offers", { "fields" => {}, "skip" => true })).to be_skip
    end
  end

  describe "quando o modelo não colabora" do
    it "acha o JSON embrulhado em conversa e cerca de markdown" do
      result = interpret("audience", "Claro! Aqui está:\n```json\n{\"fields\":{\"audience\":\"Vizinhos.\"}}\n```")

      expect(result.source).to eq("ai")
      expect(result.fields).to eq("audience" => "Vizinhos.")
    end

    it "resposta torta: grava as palavras dela no campo principal do tema" do
      result = interpret("differential", "não sei responder isso em JSON", text: "Fermentação de 36 horas.")

      expect(result.source).to eq("plain")
      expect(result.fields).to eq("positioning" => "Fermentação de 36 horas.")
    end

    it "sem chave configurada lê sem o modelo, e a marca ainda sai inteira" do
      chat = instance_double(Ai::Chat)
      allow(chat).to receive(:answer).and_raise(Ai::Chat::MissingKey)

      result = described_class.call(brand, topic: "brand", text: "Padaria do João, pão de fermentação natural",
        follow_up_available: true, chat: chat)

      expect(result.source).to eq("plain")
      expect(result.fields).to include("name" => "Padaria do João", "concept" => "pão de fermentação natural")
    end

    it "falha do modelo sobe: a tela oferece tentar de novo com a resposta intacta" do
      chat = instance_double(Ai::Chat)
      allow(chat).to receive(:answer).and_raise(Ai::Chat::Failed, "APIConnectionError")

      expect {
        described_class.call(brand, topic: "brand", text: "x", follow_up_available: true, chat: chat)
      }.to raise_error(Ai::Chat::Failed)
    end

    it "registra o custo da leitura" do
      result = interpret("audience", { "fields" => { "audience" => "Vizinhos." } })

      expect(result.cost_micro_usd).to be > 0
      expect(result.model).to eq("claude-opus-5")
    end
  end
end
