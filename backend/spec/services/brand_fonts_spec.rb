require "rails_helper"

# A fonte do catálogo em disco. Sem ela o catálogo era decorativo: o Pango
# resolve família por fontconfig, o servidor só tem DejaVu e Ubuntu, e toda
# peça saía na mesma fonte independentemente da escolha da marca.
#
# Nada aqui toca a rede: o download é dublado. O que se testa é a decisão —
# quando baixar, quando desistir e o que aceitar como arquivo de fonte.
RSpec.describe BrandFonts do
  let(:ttf) { "\x00\x01\x00\x00".b + ("a" * 2_000).b }

  # `around` roda fora do ciclo dos dublês do rspec-mocks: o cache em disco
  # precisa de um diretório por exemplo, montado no `before`.
  let(:cache_dir) { Pathname.new(Dir.mktmpdir("brand-fonts")) }

  before { allow(described_class).to receive(:root).and_return(cache_dir) }
  after { FileUtils.rm_rf(cache_dir) }

  def stub_fetch(css:, font:)
    allow(described_class).to receive(:fetch) do |uri, binary: false|
      binary ? font : css
    end
  end

  it "baixa uma vez e reaproveita o arquivo" do
    stub_fetch(css: "src: url(https://fonts.gstatic.com/s/inter/v20/x.ttf) format('truetype');", font: ttf)

    first = described_class.path("Inter", 700)
    second = described_class.path("Inter", 700)

    expect(first).to eq(second)
    expect(File.binread(first)).to eq(ttf)
    expect(described_class).to have_received(:fetch).twice # css + arquivo, só na primeira
  end

  it "aceita URL sem extensão — fonte variável vem de /l/font?kit=" do
    stub_fetch(css: "src: url(https://fonts.gstatic.com/l/font?kit=abc&skey=1&v=v20);", font: ttf)

    expect(described_class.path("Inter", 700)).to be_present
  end

  # O caso que custou caro descobrir: com `User-Agent` de IE o Google devolve
  # EOT — 200, ~300 KB, e nenhum renderizador abre. Só a assinatura denuncia.
  it "recusa arquivo que não é TrueType, mesmo com resposta 200" do
    eot = "\x18\xFC\x04\x00".b + ("a" * 2_000).b
    stub_fetch(css: "src: url(https://fonts.gstatic.com/l/font?kit=abc);", font: eot)

    expect(described_class.path("Inter", 700)).to be_nil
  end

  it "recusa família que não está no catálogo, sem ir à rede" do
    allow(described_class).to receive(:fetch)

    expect(described_class.path("Comic Sans MS", 400)).to be_nil
    expect(described_class).not_to have_received(:fetch)
  end

  it "pede o peso publicado mais próximo — pedir um peso inexistente traz folha vazia" do
    stub_fetch(css: "src: url(https://x/y.ttf);", font: ttf)

    described_class.path("Bebas Neue", 700)

    expect(described_class).to have_received(:fetch).with(
      satisfy { |uri| uri.to_s.include?("wght@400") }, any_args
    )
  end

  it "desiste por um tempo depois de falhar, em vez de tentar a cada peça" do
    allow(described_class).to receive(:fetch).and_return(nil)

    described_class.path("Inter", 400)
    described_class.path("Inter", 400)

    expect(described_class).to have_received(:fetch).once
  end

  it "não deixa arquivo pela metade quando a escrita falha no meio" do
    stub_fetch(css: "src: url(https://x/y.ttf);", font: ttf)
    allow(FileUtils).to receive(:mv).and_raise(Errno::ENOSPC)

    expect(described_class.path("Inter", 400)).to be_nil
    expect(described_class.root.glob("*.ttf")).to be_empty
  end
end
