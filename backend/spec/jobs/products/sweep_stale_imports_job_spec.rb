require "rails_helper"

RSpec.describe Products::SweepStaleImportsJob, type: :job do
  it "roda na fila low" do
    expect(described_class.new.queue_name).to eq("low")
  end

  it "encerra a importação que parou de avançar, avisando quem acompanha" do
    import = create(:product_import, status: "processing")
    import.update_columns(updated_at: 2.hours.ago)
    stream = ProductImportChannel.organization_stream(import.organization_id, ProductImportChannel::STREAM)

    expect { described_class.perform_now }.to have_broadcasted_to(stream).with(
      action: "error",
      data: { importId: import.id, code: "importInterrupted", message: I18n.t("products.imports.interrupted") }
    )

    expect(import.reload).to be_failed
    expect(import.error_sample.last["message"]).to eq(I18n.t("products.imports.interrupted"))
  end

  it "deixa em paz o que está avançando, e o que já terminou" do
    alive = create(:product_import, status: "processing")
    done = create(:product_import, status: "completed")
    done.update_columns(updated_at: 2.hours.ago)

    described_class.perform_now

    expect(alive.reload).to be_processing
    expect(done.reload).to be_completed
  end

  describe "importação abandonada na tela de mapeamento" do
    def abandon(import, at: 8.days.ago) = import.tap { import.update_columns(updated_at: at) }

    it "é apagada, e o arquivo cru vai junto" do
      import = abandon(create_import(create(:organization), "sku\nA1\n", mapping: {}))

      expect { described_class.perform_now }
        .to have_enqueued_job(ActiveStorage::PurgeJob)
      expect(Products::Import.exists?(import.id)).to be(false)
    end

    it "espera a tolerância: a pessoa pode só ter saído para o almoço" do
      recent = abandon(create(:product_import), at: 1.day.ago)

      described_class.perform_now

      expect(Products::Import.exists?(recent.id)).to be(true)
    end

    it "não confunde com importação que já terminou ou falhou" do
      finished = abandon(create(:product_import, status: "completed"))
      failed = abandon(create(:product_import, status: "failed"))

      described_class.perform_now

      expect(Products::Import.where(id: [ finished.id, failed.id ]).count).to eq(2)
    end
  end
end
