module Pipelines
  # Meta do funil contra a receita ganha, mês a mês, nos N meses até `end_month`: alimenta o gráfico
  # de tendência das metas.
  class GoalHistory
    def self.call(board, end_month, months = 6, cards: board.cards)
      new(board, end_month, months, cards: cards).compute
    end

    def initialize(board, end_month, months, cards: board.cards)
      @board = board
      @cards = cards
      @end_month = end_month.to_date.beginning_of_month
      @months = months
    end

    def compute
      start_month = @end_month.prev_month(@months - 1)

      goals = @board.goals.funnel
                    .where(period_month: start_month..@end_month)
                    .index_by { |goal| goal.period_month.strftime("%Y-%m") }

      range = start_month.in_time_zone.beginning_of_day..@end_month.end_of_month.in_time_zone.end_of_day
      month_of_won = won_month_sql
      actuals = @cards.unscope(:order)
                      .where.not(won_at: nil)
                      .where(won_at: range)
                      .group(Arel.sql(month_of_won))
                      .sum(:deal_value)

      (0...@months).map do |offset|
        key = start_month.next_month(offset).strftime("%Y-%m")
        {
          month: key,
          targetValue: goals[key]&.target_value.to_f,
          actualValue: (actuals[key] || 0).to_f
        }
      end
    end

    private

    # O mês no fuso da organização, igual a `GoalProgress`. `TO_CHAR(won_at, ...)` puro usaria o UTC
    # em que a coluna é gravada: o negócio ganho na noite do dia 30 cairia no mês seguinte daqui, e
    # no mês certo de lá.
    def won_month_sql
      zone = Card.lease_connection.quote(Time.zone.tzinfo.name)
      "TO_CHAR(pipeline_cards.won_at AT TIME ZONE 'UTC' AT TIME ZONE #{zone}, 'YYYY-MM')"
    end
  end
end
