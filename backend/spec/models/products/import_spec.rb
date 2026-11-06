require "rails_helper"

RSpec.describe Products::Import do
  let(:import) { create(:product_import) }

  describe "#claim!" do
    it "só a primeira execução vence" do
      other_copy = described_class.find(import.id)

      expect(import.claim!).to be(true)
      expect(import).to be_processing
      expect(import.started_at).to be_present
      expect(other_copy.claim!).to be(false)
    end

    it "não reabre importação terminada" do
      import.update!(status: "completed")

      expect(import.claim!).to be(false)
      expect(import.reload).to be_completed
    end
  end

  describe "#progress_percentage" do
    it "é zero sem total conhecido" do
      expect(import.progress_percentage).to eq(0)
    end

    it "arredonda em uma casa" do
      import.update!(total_rows: 3, processed_rows: 1)

      expect(import.progress_percentage).to eq(33.3)
    end

    # O total é estimado por linha física e pode ficar abaixo do que foi lido.
    it "nunca passa de 100" do
      import.update!(total_rows: 2, processed_rows: 3)

      expect(import.progress_percentage).to eq(100.0)
    end
  end

  describe "#bump_counters!" do
    it "soma no banco, sem depender do que está em memória" do
      other_copy = described_class.find(import.id)

      import.bump_counters!(processed: 2, created: 1, updated: 1)
      other_copy.bump_counters!(processed: 1, errors: 1)

      expect(import.reload).to have_attributes(processed_rows: 3, created_count: 1, updated_count: 1, error_count: 1)
    end

    it "marca avanço, que é o que separa importação viva de interrompida" do
      import.update_columns(updated_at: 1.hour.ago)

      import.bump_counters!(processed: 1)

      expect(import.reload.updated_at).to be > 1.minute.ago
    end
  end

  describe "#push_error_sample" do
    it "respeita o teto do acumulador" do
      (described_class::MAX_ERROR_SAMPLES + 5).times { |i| import.push_error_sample(line_number: i, message: "erro #{i}") }

      expect(import.error_sample.size).to eq(described_class::MAX_ERROR_SAMPLES)
      expect(import.error_sample.first).to eq("line" => 0, "message" => "erro 0")
    end

    it "corta mensagem longa" do
      import.push_error_sample(line_number: 1, message: "x" * 1000)

      expect(import.error_sample.first["message"].length).to eq(300)
    end
  end

  describe ".stale" do
    it "acha só o que está em andamento e parado" do
      stopped = create(:product_import, status: "processing")
      stopped.update_columns(updated_at: 2.hours.ago)
      alive = create(:product_import, status: "processing")
      finished = create(:product_import, status: "completed")
      finished.update_columns(updated_at: 2.hours.ago)

      expect(described_class.stale).to contain_exactly(stopped)
      expect(described_class.stale).not_to include(alive)
    end
  end

  describe "#mark_failed!" do
    it "registra o motivo na amostra e encerra" do
      import.mark_failed!("deu ruim")

      expect(import.reload).to be_failed
      expect(import.completed_at).to be_present
      expect(import.error_sample).to eq([ { "line" => nil, "message" => "deu ruim" } ])
    end
  end
end
