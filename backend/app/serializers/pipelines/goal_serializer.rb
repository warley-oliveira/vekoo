module Pipelines
  class GoalSerializer < ApplicationSerializer
    def self.one(goal)
      {
        id: goal.id,
        scope: goal.scope,
        assignedAccountId: goal.assigned_account_id,
        periodMonth: goal.period_month&.strftime("%Y-%m"),
        targetValue: goal.target_value.to_f,
        metric: goal.metric
      }
    end
  end
end
