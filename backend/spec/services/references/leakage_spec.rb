require "rails_helper"

# A análise é um padrão: se cita a origem — link, @, o site, o perfil, o nome
# da marca —, o agente levaria isso para a peça de outra marca.
RSpec.describe References::Leakage do
  let(:source) { { "url" => "https://www.padocadovale.com.br/promo", "channel" => "@padoca.do.vale", "bannedTerms" => [ "Padoca do Vale", "Dona Célia" ] } }

  def findings(text, source: self.source)
    described_class.findings({ "copy" => { "cta" => text } }, source)
  end

  it "acha link, domínio e @ em qualquer campo, com o caminho" do
    found = described_class.findings({ "hook" => { "description" => "Veja em https://x.co/a" }, "structure" => { "beats" => [ "", "siga @outraconta" ] } }, {})

    expect(found).to include(
      { "path" => "hook.description", "kind" => "url", "match" => "https://x.co/a" },
      { "path" => "structure.beats.1", "kind" => "handle", "match" => "@outraconta" }
    )
    expect(findings("pede para entrar em loja.com.br")).to include(hash_including("kind" => "url", "match" => "loja.com.br"))
  end

  it "acha o perfil, o site e os termos da curadoria — sem acento e sem caixa" do
    expect(findings("Convida a provar o pão da padoca do vale").map { |f| f["match"] }).to include("padoca do vale")
    expect(findings("A fundadora, dona celia, aparece sorrindo").map { |f| f["match"] }).to include("dona celia")
    expect(findings("O nome padocadovale aparece no rodapé").map { |f| f["match"] }).to include("padocadovale")
  end

  it "não confunde a rede social com a marca nem pega pedaço de palavra" do
    instagram = { "url" => "https://www.instagram.com/p/abc", "channel" => "@vale" }

    expect(findings("Formato de carrossel do Instagram", source: instagram)).to be_empty
    expect(findings("Fala do valor do pão", source: instagram)).to be_empty
    expect(findings("Mostra o vale ao fundo", source: instagram).map { |f| f["match"] }).to eq([ "vale" ])
  end

  it "não acusa texto limpo" do
    expect(findings("Fecha convidando a visitar a loja, sem preço.")).to be_empty
  end

  it "tira o nome do site do domínio, sem subdomínio nem sufixo" do
    expect(described_class.site_name("https://shop.padaria.com.br/x")).to eq("padaria")
    expect(described_class.site_name("https://marca.io")).to eq("marca")
    expect(described_class.site_name("https://www.tiktok.com/@a/video/1")).to be_nil
  end
end
