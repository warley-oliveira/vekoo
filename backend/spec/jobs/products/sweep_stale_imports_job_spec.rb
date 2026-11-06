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
end
