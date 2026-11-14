require "rails_helper"

# Os três exemplos que todo motor do catálogo tem que passar. Motor novo
# entra aqui sozinho: o `each` lê o registry, não uma lista escrita à mão.
RSpec.describe "Motores", type: :model do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:brand_core) { create(:brand_core, :published, organization: organization) }

  def dimensions_of(image)
    result = PngInspector.call(StringIO.new(image.download))
    [ result.width, result.height ]
  end

  it "monta o catálogo com os oito motores iniciais, sem manifesto inválido" do
    expect(Engines::Registry.ids).to include(
      "statement", "preco_heroi", "foto_copy", "promo_box", "tabela", "programa_evento", "contagem", "destaque_item"
    )
    Engines::Registry.all.each_value do |entry|
      expect(entry.renderer).to be < Engines::Base
      expect(entry.manifest.formats).not_to be_empty
    end
  end

  it "recusa um manifesto quebrado em vez de deixá-lo virar formulário" do
    expect {
      Engines::Manifest.new({ "id" => "quebrado", "name" => "x", "formats" => [ "post" ], "fields" => [ { "id" => "a", "type" => "inventado", "label" => "a" } ] })
    }.to raise_error(Engines::InvalidManifest, /desconhecido/)
    expect {
      Engines::Manifest.new({ "id" => "dup", "name" => "x", "formats" => [ "post" ], "fields" => [ { "id" => "a", "type" => "text", "label" => "a" }, { "id" => "a", "type" => "text", "label" => "b" } ] })
    }.to raise_error(Engines::InvalidManifest, /repetidos/)
  end

  Engines::Registry.all.each do |engine_id, entry|
    describe engine_id do
      let(:manifest) { entry.manifest }

      manifest_formats = entry.manifest.formats
      manifest_formats.each do |format|
        it "gera em #{format} nas dimensões certas" do
          piece = create(:piece, organization: organization, brand_core: brand_core, engine_id: engine_id,
            format: format, values: EngineExamples.values(engine_id))

          RenderPiece.new(piece).call

          expect(piece.status).to eq("ready"), piece.error.inspect
          expect(piece.images.count).to eq(EngineExamples.frames(engine_id))
          expect(dimensions_of(piece.images.first)).to eq(manifest.dimensions(format))
        end
      end

      it "persiste a proveniência: de que versão da marca a peça saiu" do
        piece = create(:piece, organization: organization, brand_core: brand_core, engine_id: engine_id,
          format: manifest.formats.first, values: EngineExamples.values(engine_id))

        RenderPiece.new(piece).call

        expect(piece.provenance["brandCoreVersion"]).to eq(brand_core.current_version)
        expect(piece.provenance["frames"]).to eq(EngineExamples.frames(engine_id))
        expect(piece.provenance["brandCoreVersionId"]).to eq(brand_core.versions.first&.id)
      end
    end
  end

  it "só lê a versão publicada: mexer no rascunho não muda o que a peça enxerga" do
    brand_core.update!(
      document: brand_core.document.deep_merge("identity" => { "name" => "Outro nome" })
    )

    tokens = Engines::Tokens.new(brand_core)

    expect(tokens.identity["name"]).to eq("Pão da Vila")
    expect(tokens.version).to eq(brand_core.current_version)
  end

  it "não gera sem marca publicada" do
    draft = create(:brand_core, :complete, organization: organization)
    piece = create(:piece, organization: organization, brand_core: draft)

    RenderPiece.new(piece).call

    expect(piece.status).to eq("failed")
    expect(piece.error["code"]).to eq("brandNotPublished")
  end
end
