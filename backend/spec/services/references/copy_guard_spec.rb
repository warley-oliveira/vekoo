require "rails_helper"

RSpec.describe References::CopyGuard do
  let(:post) { "Pão de fermentação natural saindo agora do forno. Corre que acaba antes das dez!" }
  let(:shingles) { described_class.shingles(post) }

  it "guarda só resumos, nunca o texto" do
    expect(shingles).to all(match(/\A\h{16}\z/))
    expect(shingles.join).not_to include("forno")
  end

  it "acha a frase do post repetida na análise, com acento, caixa e pontuação diferentes" do
    analysis = {
      "copy" => { "function" => "Anuncia o produto: PÃO de fermentação natural saindo agora do forno, e cria urgência." },
      "whyItWorks" => "Cria urgência com o horário."
    }

    expect(described_class.copied_paths(analysis, shingles)).to eq([ "copy.function" ])
  end

  it "não acusa descrição da função nem expressão curta em comum" do
    analysis = { "copy" => { "function" => "Nomeia o produto e o momento em que ele sai do forno; fecha com urgência." } }

    expect(described_class.copied_paths(analysis, shingles)).to be_empty
    expect(described_class.copied_paths(analysis, [])).to be_empty
  end
end
