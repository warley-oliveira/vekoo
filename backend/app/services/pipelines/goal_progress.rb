module Pipelines
  # Atingimento das metas de um quadro num mês:
  #   - a meta coletiva do funil (receita ganha no quadro inteiro)
  #   - as metas individuais, por responsável
  #   - os responsáveis que ainda não têm meta no período
  #
  # "Realizado" = soma do `deal_value` dos cards ganhos (`won_at`) dentro do mês.
  class GoalProgress
    def self.call(board, month, cards: board.cards)
      new(board, month, cards: cards).compute
    end

    def initialize(board, month, cards: board.cards)
      @board = board
      @cards = cards
      @month = month.to_date.beginning_of_month
    end

    def compute
      {
        month: @month.strftime("%Y-%m"),
        funnel: funnel_progress,
        users: user_progress,
        usersWithoutGoal: users_without_goal
      }
    end

    private

    def month_range
      @month_range ||= @month.in_time_zone.beginning_of_day..@month.end_of_month.in_time_zone.end_of_day
    end

    def won_cards
      @won_cards ||= @cards.unscope(:order).where.not(won_at: nil).where(won_at: month_range)
    end

    def funnel_actual
      @funnel_actual ||= won_cards.sum(:deal_value).to_f
    end

    def actuals_by_user
      @actuals_by_user ||= won_cards.group(:assigned_to_id).sum(:deal_value)
    end

    def funnel_goal
      @funnel_goal ||= @board.goals.funnel.for_month(@month).take
    end

    def user_goals
      @user_goals ||= @board.goals.user_goals.for_month(@month).index_by(&:assigned_account_id)
    end

    def funnel_progress
      return nil unless funnel_goal

      target = funnel_goal.target_value.to_f
      {
        goalId: funnel_goal.id,
        targetValue: target,
        actualValue: funnel_actual,
        progressPercentage: percentage(funnel_actual, target)
      }
    end

    def user_progress
      user_goals.values.map do |goal|
        target = goal.target_value.to_f
        actual = (actuals_by_user[goal.assigned_account_id] || 0).to_f
        {
          user: user_json(goal.assigned_account_id),
          goalId: goal.id,
          targetValue: target,
          actualValue: actual,
          progressPercentage: percentage(actual, target)
        }
      end
    end

    def users_without_goal
      candidate_user_ids.reject { |id| user_goals.key?(id) }.map { |id| user_json(id) }
    end

    # Os responsáveis pelos cards do quadro: quem um gestor gostaria de ver com meta.
    def candidate_user_ids
      @candidate_user_ids ||= @cards.unscope(:order).where.not(assigned_to_id: nil).distinct.pluck(:assigned_to_id)
    end

    def users_by_id
      @users_by_id ||= Account.where(id: (candidate_user_ids + user_goals.keys).uniq).with_attached_avatar.index_by(&:id)
    end

    def user_json(id)
      account = users_by_id[id]
      return { id: id, name: nil, avatarUrl: nil } unless account

      { id: account.id, name: account.name, avatarUrl: StoredImagePath.for(account.avatar, :thumb) }
    end

    def percentage(actual, target)
      return 0.0 if target.to_f <= 0

      (actual.to_f / target * 100).round(1)
    end
  end
end
