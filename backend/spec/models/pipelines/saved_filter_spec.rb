require "rails_helper"

RSpec.describe Pipelines::SavedFilter do
  let(:board) { create(:pipeline_board) }
  let(:organization) { board.organization }

  describe "validações" do
    it "vale com uma definição bem formada" do
      expect(build(:pipeline_saved_filter, board: board)).to be_valid
    end

    it "exige nome e visibilidade conhecida" do
      filter = build(:pipeline_saved_filter, board: board, name: "")
      expect(filter).not_to be_valid
      expect(filter.errors[:name]).to be_present

      filter = build(:pipeline_saved_filter, board: board, visibility: "team")
      expect(filter).not_to be_valid
      expect(filter.errors[:visibility]).to be_present
    end

    it "recusa campo desconhecido" do
      filter = build(:pipeline_saved_filter, board: board,
        definition: { "version" => 1, "all" => [ { "field" => "ghost", "operator" => "eq", "value" => 1 } ] })

      expect(filter).not_to be_valid
      expect(filter.errors[:definition]).to be_present
    end

    it "recusa operador que não vale para o tipo do campo" do
      filter = build(:pipeline_saved_filter, board: board,
        definition: { "version" => 1, "all" => [ { "field" => "deal_value", "operator" => "contains", "value" => "x" } ] })

      expect(filter).not_to be_valid
    end

    it "recusa definição sem condições" do
      expect(build(:pipeline_saved_filter, board: board, definition: { "version" => 1, "all" => [], "any" => [] })).not_to be_valid
    end

    it "recusa versão errada, e grupo que não é lista" do
      expect(build(:pipeline_saved_filter, board: board, definition: { "version" => 2, "all" => [ {} ] })).not_to be_valid
      expect(build(:pipeline_saved_filter, board: board, definition: { "version" => 1, "all" => "x" })).not_to be_valid
    end

    it "recusa condições demais" do
      many = Array.new(Pipelines::FilterDefinition::MAX_CONDITIONS + 1) { { "field" => "title", "operator" => "eq", "value" => "x" } }

      expect(build(:pipeline_saved_filter, board: board, definition: { "version" => 1, "all" => many })).not_to be_valid
    end

    it "recusa quadro de outra organização" do
      filter = build(:pipeline_saved_filter, board: create(:pipeline_board), organization: organization)

      expect(filter).not_to be_valid
      expect(filter.errors[:board_id]).to be_present
    end
  end

  describe ".visible_to" do
    let(:owner) { create(:account, organization: organization) }
    let(:other) { create(:account, organization: organization) }
    let!(:my_private) { create(:pipeline_saved_filter, board: board, owner: owner) }
    let!(:others_private) { create(:pipeline_saved_filter, board: board, owner: other) }
    let!(:shared) { create(:pipeline_saved_filter, :shared, board: board, owner: other) }

    it "traz os meus e os compartilhados, sem os privados de outra pessoa" do
      visible = described_class.for_board(board).visible_to(owner)

      expect(visible).to contain_exactly(my_private, shared)
    end
  end

  describe "#owned_by?" do
    let(:owner) { create(:account, organization: organization) }
    let(:filter) { create(:pipeline_saved_filter, board: board, owner: owner) }

    it "sim para quem criou, não para os outros" do
      expect(filter.owned_by?(owner)).to be(true)
      expect(filter.owned_by?(create(:account))).to be(false)
    end

    it "pessoa apagada: o filtro compartilhado fica, sem dono" do
      filter.update!(visibility: "shared")
      owner.destroy!

      filter.reload
      expect(filter.account_id).to be_nil
      expect(filter.owned_by?(create(:account))).to be(false)
      expect(filter.owned_by?(nil)).to be(false)
    end
  end
end
