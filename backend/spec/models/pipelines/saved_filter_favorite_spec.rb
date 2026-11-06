require "rails_helper"

RSpec.describe Pipelines::SavedFilterFavorite do
  let(:board) { create(:pipeline_board) }
  let(:user) { create(:account, organization: board.organization) }

  describe "alvo" do
    it "vale apontando para um filtro salvo" do
      filter = create(:pipeline_saved_filter, board: board)

      expect(build(:pipeline_saved_filter_favorite, user: user, saved_filter: filter, board: board)).to be_valid
    end

    it "vale apontando para um pronto" do
      expect(build(:pipeline_saved_filter_favorite, :preset, user: user, board: board)).to be_valid
    end

    it "não vale sem nenhum" do
      expect(build(:pipeline_saved_filter_favorite, user: user, board: board, saved_filter: nil, preset_key: nil)).not_to be_valid
    end

    it "não vale com os dois" do
      filter = create(:pipeline_saved_filter, board: board)

      expect(build(:pipeline_saved_filter_favorite, user: user, board: board, saved_filter: filter, preset_key: "open_deals")).not_to be_valid
    end
  end

  it "recusa um pronto desconhecido" do
    favorite = build(:pipeline_saved_filter_favorite, :preset, user: user, board: board, preset_key: "nope")

    expect(favorite).not_to be_valid
    expect(favorite.errors[:preset_key]).to be_present
  end

  it "o índice segura o favorito repetido" do
    create(:pipeline_saved_filter_favorite, :preset, user: user, board: board, preset_key: "open_deals")
    duplicate = build(:pipeline_saved_filter_favorite, :preset, user: user, board: board, preset_key: "open_deals")

    expect { duplicate.save!(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
  end

  it "a check constraint segura o alvo duplo" do
    filter = create(:pipeline_saved_filter, board: board)
    both = build(:pipeline_saved_filter_favorite, user: user, board: board, saved_filter: filter, preset_key: "open_deals")

    expect { both.save!(validate: false) }.to raise_error(ActiveRecord::StatementInvalid)
  end
end
