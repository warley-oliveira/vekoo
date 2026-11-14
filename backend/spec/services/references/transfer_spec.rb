require "rails_helper"

# O acervo da curadoria de um banco para outro: exporta, apaga, importa — e o
# card volta igual (análise, vetor, miniatura), sem chamar modelo nenhum.
RSpec.describe References::Transfer do
  include ActiveJob::TestHelper

  let(:staff) { create(:account, staff: true) }

  def card_with_thumbnail
    create(:reference_card).tap do |card|
      card.update_columns(embedding: Array.new(Ai::Embeddings::DIMENSIONS) { |i| (i % 7) / 7.0 }, requires: %w[product_photo])
      card.thumbnail.attach(io: File.open(Rails.root.join("spec/fixtures/files/foto.png")), filename: "miniatura.png", content_type: "image/png")
    end
  end

  it "o card volta com a análise, o vetor, o que exige e a miniatura; quem curou é a conta que importa" do
    card = card_with_thumbnail
    before = card.reload.attributes.except("curated_by_id", "updated_at")
    payload = JSON.parse(described_class.export(cards: ReferenceCard.all, photos: false).to_json)
    card.destroy!

    counts = described_class.import(payload, account: staff)

    imported = ReferenceCard.find(before["id"])
    expect(counts[:cards]).to eq(1)
    times = before.select { |_key, value| value.is_a?(Time) }.keys
    expect(imported.attributes.except("curated_by_id", "updated_at", "embedding", *times)).to eq(before.except("embedding", *times))
    times.each { |key| expect(imported[key]).to be_within(0.001).of(before[key]) }
    expect(imported.embedding.to_a).to eq(before["embedding"].to_a)
    expect(imported.curated_by).to eq(staff)
    expect(imported.thumbnail).to be_attached
  end

  it "rodar de novo não duplica" do
    card_with_thumbnail
    payload = JSON.parse(described_class.export(cards: ReferenceCard.all, photos: false).to_json)

    expect(described_class.import(payload, account: staff)).to include(cardsKept: 1)
    expect(ReferenceCard.count).to eq(1)
  end

  it "as fotos entram na marca de teste já descritas, sem chamar o modelo" do
    References::Eval::Brands.new(account: staff).call(only: %w[padaria], photos: false)
    data = Base64.strict_encode64(File.binread(Rails.root.join("spec/fixtures/files/foto.png")))
    photo = { "brand" => "padaria", "filename" => "padaria-1.png", "contentType" => "image/png", "description" => "Pão na bancada.",
              "shows" => %w[product_photo], "describedAt" => Time.current.iso8601, "descriptionCostMicroUsd" => 160, "data" => data }
    chat = instance_double(Ai::Chat)
    allow(Ai::Chat).to receive(:new).and_return(chat)
    allow(chat).to receive(:answer)

    counts = described_class.import({ "version" => 1, "cards" => [], "photos" => [ photo, photo.merge("brand" => "inexistente") ] }, account: staff)
    perform_enqueued_jobs(only: DescribeBrandAssetJob)

    asset = References::Eval::Brands.all["padaria"].assets.find_by!(filename: "padaria-1.png")
    expect(counts).to include(photos: 1, photosSkipped: 1)
    expect(asset).to have_attributes(description: "Pão na bancada.", shows: %w[product_photo], generated: false)
    expect(chat).not_to have_received(:answer)
    expect(described_class.import({ "version" => 1, "photos" => [ photo ] }, account: staff)).to include(photosKept: 1)
  end

  it "recusa arquivo de outra versão" do
    expect { described_class.import({ "version" => 99 }, account: staff) }.to raise_error(ArgumentError, /versão/)
  end
end
