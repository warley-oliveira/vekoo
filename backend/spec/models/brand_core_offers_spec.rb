require "rails_helper"

# "Produtos & ofertas" é conhecimento, não burocracia: entra como lista simples,
# não bloqueia publicação e não entra na conta do progresso — mas é a única
# fonte de preço que o agente pode usar.
RSpec.describe "Brandcore — produtos e ofertas" do
  let(:brand) { create(:brand_core, :complete) }

  it "normaliza a lista guardando nome, preço, descrição e vigência" do
    errors = brand.assign_section("offers", {
      "items" => [
        { "name" => "  Mentoria  ", "price" => "R$ 890/mês",
          "description" => "Quatro encontros por mês.", "validity" => "Vagas em outubro" }
      ]
    })

    expect(errors).to be_empty
    offer = brand.full_document["offers"]["items"].first
    expect(offer).to include(
      "name" => "Mentoria", "price" => "R$ 890/mês", "validity" => "Vagas em outubro"
    )
    expect(offer["id"]).to be_present
  end

  it "guarda preço e vigência como texto — 'a partir de R$ 18' e 'toda quarta' são respostas legítimas" do
    brand.assign_section("offers", { "items" => [ { "name" => "Pão", "price" => "a partir de R$ 18", "validity" => "toda quarta" } ] })

    expect(brand.full_document["offers"]["items"].first["price"]).to eq("a partir de R$ 18")
  end

  it "exige só o nome: o resto é opcional de propósito" do
    errors = brand.assign_section("offers", { "items" => [ { "name" => "", "price" => "R$ 10" } ] })

    expect(errors).to eq([ [ "offers.items.0.name", :blank ] ])
  end

  it "não entra no mínimo obrigatório — marca sem produto publica igual" do
    expect(brand.completeness).to be_minimum_met

    result = PublishBrandCore.new(brand, account: nil).call

    expect(result).to be_success
  end

  it "não pesa no progresso: quem não vende produto avulso não trava em 90%" do
    before_percent = brand.completeness.percent
    brand.assign_section("offers", { "items" => [ { "name" => "Mentoria" } ] })
    brand.save!

    expect(brand.completeness.percent).to eq(before_percent)
    expect(brand.completeness.sections["offers"]).to eq(100)
  end

  it "descarta chave estranha e limita a lista, como toda seção do documento" do
    brand.assign_section("offers", {
      "items" => Array.new(60) { |i| { "name" => "Item #{i}", "status" => "pendente" } }
    })

    items = brand.full_document["offers"]["items"]
    expect(items.length).to eq(BrandCore::Schema::MAX_OFFERS)
    expect(items.first.keys).to match_array(%w[id name price description validity])
  end

  it "chega ao agente pela ficha da marca, com preço e vigência" do
    brand.assign_section("offers", { "items" => [ { "name" => "Mentoria", "price" => "R$ 890/mês", "validity" => "Vagas em outubro" } ] })
    brand.save!
    PublishBrandCore.new(brand, account: nil).call

    brief = Agent::BrandBrief.new(Engines::Tokens.new(brand.reload)).text

    expect(brief).to include("Mentoria").and include("R$ 890/mês").and include("Vagas em outubro")
  end
end

# A URL do anexo precisa ser absoluta quando a página e a API moram em hosts
# diferentes — que é o caso em desenvolvimento (Vite numa porta, Rails noutra)
# e em qualquer produção com domínio próprio para a API. Com caminho relativo a
# imagem caía no index.html do front e a peça aparecia quebrada.
RSpec.describe ApplicationSerializer, ".blob_url" do
  let(:asset) { create(:brand_asset) }

  it "prefixa a origem da API quando ela está configurada" do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("API_ORIGIN").and_return("https://api.exemplo.com/")

    expect(described_class.blob_url(asset.file))
      .to start_with("https://api.exemplo.com/rails/active_storage/blobs/proxy/")
  end

  it "cai no caminho relativo quando não há origem configurada" do
    allow(ENV).to receive(:[]).and_call_original
    allow(ENV).to receive(:[]).with("API_ORIGIN").and_return(nil)

    expect(described_class.blob_url(asset.file)).to start_with("/rails/active_storage/blobs/proxy/")
  end
end
