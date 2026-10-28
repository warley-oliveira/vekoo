require "rails_helper"

# A taxonomia tem uma fonte só (`config/reference_taxonomy.yml`). O front
# recebe as listas por um arquivo gerado; se alguém mudar o YAML e esquecer o
# `bin/rails taxonomy:export`, a tela passa a oferecer um código que a API
# recusa — ou deixa de oferecer um que ela aceita.
RSpec.describe Taxonomy do
  TAXONOMY_LISTS = described_class::TYPESCRIPT.keys.freeze

  it "tem todas as listas, sem código repetido" do
    TAXONOMY_LISTS.each do |list|
      values = described_class.values(list)

      expect(values).not_to be_empty, list
      expect(values).to eq(values.uniq), list
    end
  end

  it "usa snake_case nos códigos de texto e 1–3 na replicabilidade" do
    (TAXONOMY_LISTS - %w[replicability]).each do |list|
      expect(described_class.values(list)).to all(match(/\A[a-z]+(_[a-z]+)*\z/)), list
    end
    expect(described_class::REPLICABILITY).to eq([ 1, 2, 3 ])
  end

  it "descreve cada código para o modelo" do
    TAXONOMY_LISTS.each do |list|
      described_class.values(list).each { |code| expect(described_class.describe(list, code)).to be_present, "#{list}.#{code}" }
    end
  end

  it "liga cada formato de peça a um formato de referência" do
    expect(described_class::PIECE_FORMATS.keys).to match_array(PieceDocument::FORMATS.keys)
    expect(described_class::PIECE_FORMATS.values - described_class::FORMATS).to be_empty
  end

  it "bate com o arquivo gerado do front" do
    skip "front não está neste checkout" unless File.exist?(described_class::TYPESCRIPT_PATH)

    expect(File.read(described_class::TYPESCRIPT_PATH)).to eq(described_class.typescript),
      "rode `bin/rails taxonomy:export` depois de mudar config/reference_taxonomy.yml"
  end

  # Nicho e arquétipo aparecem para o assinante (o ramo e o estilo da marca):
  # cada código precisa de rótulo nos dois idiomas.
  it "tem rótulo de tela nos dois idiomas para nicho e arquétipo" do
    %w[pt-BR en].each do |language|
      path = Rails.root.join("../frontend/src/locales/#{language}/taxonomy.json")
      skip "front não está neste checkout" unless File.exist?(path)

      labels = JSON.parse(File.read(path)).fetch("taxonomy")
      expect(labels.fetch("niches").keys).to match_array(described_class::NICHES), language
      expect(labels.fetch("archetypes").keys).to match_array(described_class::ARCHETYPES), language
      described_class::ARCHETYPES.each do |code|
        expect(labels.dig("archetypes", code)).to include("label", "hint"), "#{language}: #{code}"
      end
    end
  end
end
