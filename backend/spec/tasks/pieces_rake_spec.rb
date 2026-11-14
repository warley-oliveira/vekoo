require "rails_helper"
require "rake"

RSpec.describe "pieces:to_documents" do
  before(:all) { Rails.application.load_tasks if Rake::Task.tasks.empty? }

  let(:task) { Rake::Task["pieces:to_documents"] }

  it "converte o que tem layout equivalente e deixa o resto como legado" do
    statement = create(:piece, engine_id: "statement")
    table = create(:piece, engine_id: "tabela", values: { "title" => "Horários", "rows" => [ "seg 7h" ] })

    expect { task.execute }.to output(/1 convertidas; ficam legadas: tabela 1/).to_stdout

    statement.reload
    expect(statement).to be_document
    expect(statement).to have_attributes(format: "feed_portrait", status: "draft")
    expect(statement.versions.map(&:source)).to eq([ "migration" ])
    expect(table.reload).to be_legacy
  end
end
