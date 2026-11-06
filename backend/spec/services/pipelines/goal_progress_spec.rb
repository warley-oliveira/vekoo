require 'rails_helper'

RSpec.describe Pipelines::GoalProgress do
  subject(:result) { described_class.call(board, Date.current) }

  let(:board) { create(:pipeline_board) }
  let(:column) { create(:pipeline_stage, board: board) }
  let(:seller) { create(:account, organization: board.organization, role: 'member') }
  let(:other_seller) { create(:account, organization: board.organization, role: 'member') }

  def won_card(value:, user:, at: Time.current)
    create(:pipeline_card, :won, stage: column, deal_value: value, assigned_to_id: user.id, won_at: at)
  end

  describe '#compute' do
    context 'with a funnel goal and won deals in the month' do
      before do
        create(:pipeline_goal, board: board, target_value: 50_000)
        won_card(value: 8_000, user: seller)
        won_card(value: 3_500, user: other_seller)
        # Outside the month — must be ignored.
        won_card(value: 99_000, user: seller, at: 2.months.ago)
      end

      it 'sums won revenue for the month into the funnel actual' do
        expect(result[:funnel][:targetValue]).to eq(50_000.0)
        expect(result[:funnel][:actualValue]).to eq(11_500.0)
        expect(result[:funnel][:progressPercentage]).to eq(23.0)
      end
    end

    context 'without a funnel goal' do
      it 'returns nil funnel' do
        expect(result[:funnel]).to be_nil
      end
    end

    context 'with individual goals' do
      before do
        create(:pipeline_goal, :user, board: board, assigned_account: seller, target_value: 20_000)
        won_card(value: 4_600, user: seller)
        won_card(value: 1_000, user: other_seller)
      end

      it 'reports per-user attainment for users with a goal' do
        user_row = result[:users].find { |u| u[:user][:id] == seller.id }
        expect(user_row[:targetValue]).to eq(20_000.0)
        expect(user_row[:actualValue]).to eq(4_600.0)
        expect(user_row[:progressPercentage]).to eq(23.0)
      end

      it 'lists assignees without a goal in usersWithoutGoal' do
        ids = result[:usersWithoutGoal].map { |u| u[:id] }
        expect(ids).to include(other_seller.id)
        expect(ids).not_to include(seller.id)
      end

      it 'serializes users with avatar fields' do
        expect(result[:usersWithoutGoal].first).to include(
          :id, :name, :avatarUrl
        )
      end
    end
  end
end
