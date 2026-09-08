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
      Engines::Manifest.new({ "id" => "quebrado", "name" => "x", "formats" => [ "post" ], "fields" => [ { "id" => "a", "type" => "ref", "label" => "a" } ] })
    }.to raise_error(Engines::InvalidManifest, /kinds/)
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

      it "persiste a proveniência: versão da marca e refs consumidas com valor" do
        piece = create(:piece, organization: organization, brand_core: brand_core, engine_id: engine_id,
          format: manifest.formats.first, values: EngineExamples.values(engine_id))

        RenderPiece.new(piece).call

        expect(piece.provenance["brandCoreVersion"]).to eq(brand_core.current_version)
        expect(piece.provenance["frames"]).to eq(EngineExamples.frames(engine_id))
        used_refs = manifest.ref_fields.select { |field| EngineExamples.values(engine_id)[field.id].present? }
        expect(piece.provenance["refs"].length).to eq(used_refs.length)
        used_refs.each do |field|
          ref = piece.provenance["refs"].find { |r| r["field"] == field.id }
          expect(ref).to include("factId" => "fato-preco", "value" => "R$ 18", "status" => "confirmed")
        end
      end

      if entry.manifest.ref_fields.any?
        it "falha de forma limpa quando a ref aponta para um fato pendente, nomeando o fato" do
          field = manifest.ref_fields.first
          values = EngineExamples.values(engine_id).merge(field.id => EngineExamples.pending_fact_for(field))
          piece = create(:piece, organization: organization, brand_core: brand_core, engine_id: engine_id,
            format: manifest.formats.first, values: values)

          RenderPiece.new(piece).call

          expect(piece.status).to eq("failed")
          expect(piece.error).to include("code" => "refPending", "field" => field.id)
          expect(piece.error["factLabel"]).to be_present
          expect(piece.images).not_to be_attached
          expect(piece.provenance).to eq({})
        end
      end
    end
  end

  it "só lê a versão publicada: o rascunho não muda a peça" do
    brand_core.update!(document: brand_core.document.deep_merge("facts" => { "items" => [ brand_core.document["facts"]["items"].first.merge("value" => "R$ 99") ] }))
    piece = create(:piece, organization: organization, brand_core: brand_core)

    RenderPiece.new(piece).call

    expect(piece.provenance["refs"].first["value"]).to eq("R$ 18")
  end

  it "não gera sem marca publicada" do
    draft = create(:brand_core, :complete, organization: organization)
    piece = create(:piece, organization: organization, brand_core: draft)

    RenderPiece.new(piece).call

    expect(piece.status).to eq("failed")
    expect(piece.error["code"]).to eq("brandNotPublished")
  end
end
