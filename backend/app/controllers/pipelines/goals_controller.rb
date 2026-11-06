module Pipelines
  class GoalsController < BaseController
    before_action :set_board
    before_action :set_goal, only: %i[update destroy]

    # ?month=YYYY-MM
    def index
      goals = @board.goals.order(:period_month, :scope, :created_at)
      goals = goals.for_month(parse_month(params[:month])) if params[:month].present?

      render json: { goals: GoalSerializer.many(goals), meta: { total: goals.size } }
    end

    # ?month=YYYY-MM
    def progress
      result = GoalProgress.call(@board, parse_month(params[:month]), cards: visible_cards)

      render json: visibility_for(@board).unrestricted? ? result : own_goal_progress(result)
    end

    # ?month=YYYY-MM&months=6
    def history
      months = (params[:months].presence || 6).to_i.clamp(1, 24)

      render json: { history: GoalHistory.call(@board, parse_month(params[:month]), months, cards: visible_cards) }
    end

    def create
      goal = @board.goals.new(goal_attributes)
      goal.created_by = current_account

      if goal.save
        render json: GoalSerializer.one(goal), status: :created
      else
        render_invalid(goal)
      end
    end

    def update
      if @goal.update(goal_attributes)
        render json: GoalSerializer.one(@goal)
      else
        render_invalid(@goal)
      end
    end

    def destroy
      @goal.destroy!
      head :no_content
    end

    private

    def own_goal_progress(result)
      result.merge(
        users: result[:users].select { |entry| entry[:user][:id] == current_account.id },
        usersWithoutGoal: result[:usersWithoutGoal].select { |user| user[:id] == current_account.id }
      )
    end

    def set_goal
      @goal = @board.goals.find(params[:id])
    end

    # O mês é sempre o primeiro dia. Ao gravar, um mês inválido fica nulo e a validação responde: a
    # origem gravava a meta no mês corrente, sem avisar.
    def goal_attributes
      attributes = envelope(:goal).permit(:scope, :assigned_account_id, :period_month, :target_value, :metric).to_h
      attributes["period_month"] = month_or_nil(attributes["period_month"]) if attributes.key?("period_month")
      attributes
    end

    # Na leitura, sem mês ou com um inválido, vale o mês corrente.
    def parse_month(value)
      month_or_nil(value) || Date.current.beginning_of_month
    end

    def month_or_nil(value)
      text = value.to_s
      # 'YYYY-MM' não é data para o `Date.parse`.
      text = "#{text}-01" if text.match?(/\A\d{4}-\d{2}\z/)
      Date.parse(text).beginning_of_month
    rescue Date::Error, TypeError
      nil
    end
  end
end
