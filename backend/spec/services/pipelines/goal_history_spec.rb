require 'rails_helper'

RSpec.describe Pipelines::GoalHistory do
  let(:board) { create(:pipeline_board) }
  let(:column) { create(:pipeline_stage, board: board) }

  def won_card(value:, at:)
    create(:pipeline_card, :won, stage: column, deal_value: value, won_at: at)
  end

  it 'returns one entry per month with funnel target and realized value' do
    this_month = Date.current.beginning_of_month
    last_month = this_month.prev_month

    create(:pipeline_goal, board: board, period_month: this_month, target_value: 50_000)
    create(:pipeline_goal, board: board, period_month: last_month, target_value: 30_000)
    won_card(value: 12_000, at: this_month + 5.days)
    won_card(value: 7_000, at: last_month + 3.days)

    result = described_class.call(board, this_month, 6)

    expect(result.size).to eq(6)
    expect(result.last).to include(
      month: this_month.strftime('%Y-%m'), targetValue: 50_000.0, actualValue: 12_000.0
    )
    prev = result.find { |r| r[:month] == last_month.strftime('%Y-%m') }
    expect(prev).to include(targetValue: 30_000.0, actualValue: 7_000.0)
  end

  it 'reports zero for months without a goal or deals' do
    result = described_class.call(board, Date.current.beginning_of_month, 6)
    expect(result.first).to include(targetValue: 0.0, actualValue: 0.0)
  end
end
