require "rails_helper"
require "rake"

# Preenche o nicho no rascunho só de quem nunca publicou. Marca publicada fica
# intocada — gravar no rascunho dela acenderia "alterações não publicadas" —,
# e a busca usa a dedução (`BrandCore#generation_niche`).
RSpec.describe "brands:infer_niche" do
  before(:all) { Rails.application.load_tasks if Rake::Task.tasks.empty? }

  let(:task) { Rake::Task["brands:infer_niche"] }

  after { task.reenable }

  def draft_with(segment, niche: "")
    create(:brand_core, :complete).tap do |brand|
      brand.assign_section("identity", brand.full_document["identity"].merge("segment" => segment, "niche" => niche))
      brand.save!
    end
  end

  it "preenche o rascunho de quem nunca publicou e deixa o resto como está" do
    filled = draft_with("Imobiliária")
    clueless = draft_with("Loja")
    chosen = draft_with("Imobiliária", niche: "pet")
    published = create(:brand_core, :published)
    padaria = published.published_document.deep_merge("identity" => { "segment" => "Padaria" })
    published.update!(document: padaria, published_document: padaria)

    expect { task.execute }.to output(/preenchidas: 1 · sem pista: 1 · já tinham: 1/).to_stdout

    expect(filled.reload.full_document.dig("identity", "niche")).to eq("real_estate")
    expect(clueless.reload.full_document.dig("identity", "niche")).to eq("")
    expect(chosen.reload.full_document.dig("identity", "niche")).to eq("pet")
    expect(published.reload.document["identity"]).not_to have_key("niche")
    expect(published.unpublished_changes?).to be(false)
  end

  it "só relata com DRY_RUN" do
    brand = draft_with("Barbearia")

    ENV["DRY_RUN"] = "1"
    expect { task.execute }.to output(/a preencher: 1/).to_stdout
    expect(brand.reload.full_document.dig("identity", "niche")).to eq("")
  ensure
    ENV.delete("DRY_RUN")
  end
end
