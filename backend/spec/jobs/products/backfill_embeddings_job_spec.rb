require "rails_helper"

RSpec.describe Products::BackfillEmbeddingsJob, type: :job do
  let!(:missing) { create(:product_item) }
  let!(:embedded) { create(:product_item) }

  before { create(:product_embedding, item: embedded) }

  it "roda na fila low" do
    expect(described_class.new.queue_name).to eq("low")
  end

  it "alcança só quem está sem vetor" do
    with_openai_key("sk-teste") do
      expect { described_class.perform_now }
        .to have_enqueued_job(Products::EmbedItemsJob).with([ missing.id ])
    end
  end

  it "sem chave, não faz nada" do
    with_openai_key(nil) do
      expect { described_class.perform_now }.not_to have_enqueued_job(Products::EmbedItemsJob)
    end
  end

  it "respeita o teto por execução" do
    stub_const("#{described_class}::MAX_PER_RUN", 1)
    create(:product_item)

    with_openai_key("sk-teste") do
      expect { described_class.perform_now }
        .to have_enqueued_job(Products::EmbedItemsJob).once.with { |ids| expect(ids.size).to eq(1) }
    end
  end
end
