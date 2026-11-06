require "rails_helper"

RSpec.describe Pipelines::Goal, type: :model do
  describe "validações" do
    it "vale como meta do funil" do
      expect(build(:pipeline_goal)).to be_valid
    end

    it "vale como meta de pessoa" do
      expect(build(:pipeline_goal, :user)).to be_valid
    end

    it "recusa escopo e métrica desconhecidos" do
      expect(build(:pipeline_goal, scope: "team")).not_to be_valid
      expect(build(:pipeline_goal, metric: "count")).not_to be_valid
    end

    it "exige valor positivo e o mês" do
      expect(build(:pipeline_goal, target_value: 0)).not_to be_valid
      expect(build(:pipeline_goal, target_value: -10)).not_to be_valid
      expect(build(:pipeline_goal, period_month: nil)).not_to be_valid
    end

    it "meta de pessoa exige a pessoa" do
      goal = build(:pipeline_goal, scope: "user", assigned_account: nil)

      expect(goal).not_to be_valid
      expect(goal.errors[:assigned_account]).to be_present
    end

    it "meta do funil não tem pessoa" do
      board = create(:pipeline_board)
      goal = build(:pipeline_goal, board: board, assigned_account: create(:account, organization: board.organization))

      expect(goal).not_to be_valid
      expect(goal.errors[:assigned_account]).to be_present
    end

    it "pessoa de outra organização não serve" do
      goal = build(:pipeline_goal, scope: "user", assigned_account: create(:account))

      expect(goal).not_to be_valid
      expect(goal.errors[:assigned_account_id]).to be_present
    end

    it "uma meta de funil por mês no quadro" do
      existing = create(:pipeline_goal)

      expect(build(:pipeline_goal, board: existing.board, period_month: existing.period_month)).not_to be_valid
    end

    it "pessoas diferentes no mesmo mês, sim" do
      existing = create(:pipeline_goal, :user)
      other = build(:pipeline_goal, :user, board: existing.board, period_month: existing.period_month)

      expect(other).to be_valid
    end
  end

  describe "escopos" do
    it "filtra por mês, tipo e pessoa" do
      board = create(:pipeline_board)
      person = create(:account, organization: board.organization)
      this_month = create(:pipeline_goal, :user, board: board, assigned_account: person)
      create(:pipeline_goal, :user, board: board, period_month: 2.months.ago.to_date.beginning_of_month)

      expect(board.goals.for_month(Date.current)).to include(this_month)
      expect(board.goals.user_goals.for_user(person.id)).to eq([ this_month ])
    end
  end
end
