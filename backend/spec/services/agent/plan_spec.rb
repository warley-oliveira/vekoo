require "rails_helper"

# O plano é a fronteira entre "o que o modelo disse" e "o que os motores
# conseguem desenhar". Nada aqui toca a rede: entra texto, sai decisão
# validada — ou a lista de erros que volta ao modelo na segunda tentativa.
RSpec.describe Agent::Plan do
  let(:brand) { create(:brand_core, :published) }
  let(:tokens) { Engines::Tokens.new(brand) }

  def plan(raw, limit: described_class::MAX_VARIATIONS)
    described_class.call(raw, tokens: tokens, limit: limit)
  end

  def variation(overrides = {})
    {
      "engineId" => "statement",
      "format" => "post",
      "title" => "Pão de verdade",
      "values" => { "phrase" => "Pão de verdade\nleva tempo.", "price" => "R$ 18" },
      "why" => "fundo escuro, frase seca"
    }.merge(overrides)
  end

  def answer(*variations, question: nil)
    JSON.generate({ "question" => question, "variations" => variations })
  end

  it "aceita a resposta limpa e normaliza os valores pelo manifesto" do
    result = plan(answer(variation))

    expect(result).to be_ok
    expect(result.variations.length).to eq(1)
    expect(result.variations.first.engine_id).to eq("statement")
    expect(result.variations.first.values["phrase"]).to eq("Pão de verdade\nleva tempo.")
    expect(result.errors).to be_empty
  end

  it "acha o JSON mesmo embrulhado em cerca de markdown e conversa fiada" do
    raw = "Claro! Aqui está:\n```json\n#{answer(variation)}\n```\nEspero ter ajudado."

    expect(plan(raw)).to be_ok
  end

  it "trata a pergunta como resposta boa, e não como falha" do
    result = plan(answer(question: "Qual é o preço da promoção de quarta?"))

    expect(result).to be_question
    expect(result).to be_ok
    expect(result.variations).to be_empty
  end

  it "recusa motor que não existe, dizendo qual era" do
    result = plan(answer(variation("engineId" => "motor_inventado")))

    expect(result).not_to be_ok
    expect(result.errors.first).to include("motor_inventado")
  end

  it "recusa formato que o motor não declara" do
    result = plan(answer(variation("engineId" => "promo_box", "format" => "story",
      "values" => EngineExamples.values("promo_box"))))

    expect(result.errors.first).to include("story")
  end

  # O erro que mais aparece na prática: o modelo escreve bonito e passa do
  # limite de linhas. A mensagem precisa nomear o campo, senão a segunda
  # tentativa é chute.
  it "recusa campo fora do limite e nomeia o campo no erro" do
    result = plan(answer(variation("values" => {
      "phrase" => "Uma frase muito, muito, muito mais longa do que este motor comporta em duas linhas de dezesseis caracteres"
    })))

    expect(result).not_to be_ok
    expect(result.errors.first).to include("phrase")
  end

  it "recusa cor que não é da marca (o id de `choice` derivada é conferido)" do
    result = plan(answer(variation(
      "engineId" => "promo_box",
      "values" => EngineExamples.values("promo_box").merge("background" => "cor-de-outra-marca")
    )))

    expect(result.errors.first).to include("background")
  end

  it "mantém as variações boas e reporta só as ruins" do
    result = plan(answer(variation, variation("engineId" => "nao_existe")))

    expect(result.variations.length).to eq(1)
    expect(result.errors.length).to eq(1)
    expect(result).to be_ok
  end

  it "corta no limite pedido — o ajuste quer uma peça, não três" do
    result = plan(answer(variation, variation, variation), limit: 1)

    expect(result.variations.length).to eq(1)
  end

  it "não explode com resposta que não é JSON" do
    result = plan("Desculpe, não entendi o pedido.")

    expect(result).not_to be_ok
    expect(result.errors).not_to be_empty
  end

  it "reclama quando não veio nem pergunta nem variação" do
    result = plan(answer)

    expect(result).not_to be_ok
    expect(result.errors.first).to include("vazio")
  end
end
