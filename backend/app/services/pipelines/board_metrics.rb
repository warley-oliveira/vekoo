module Pipelines
  class BoardMetrics
    def self.call(board, cards: board.cards)
      new(board, cards: cards).compute
    end

    def initialize(board, cards: board.cards)
      @board = board
      @cards = cards
    end

    def compute
      {
        cardsPerStage: cards_per_stage,
        dealValuePerStage: deal_value_per_stage,
        cardsByPriority: cards_by_priority,
        overdueCount: overdue_count,
        dealSummary: deal_summary,
        avgTimePerStage: avg_time_per_stage,
        totalCards: active_cards.count,
        totalDealValue: active_cards.where.not(deal_value: nil).sum(:deal_value).to_f,
        weightedPipelineValue: weighted_pipeline_value,
        forecast: forecast
      }
    end

    private

    def stages
      @stages ||= @board.stages.to_a
    end

    def active_cards
      @active_cards ||= @cards.active.unscope(:order)
    end

    def cards_per_stage
      counts = active_cards.group(:stage_id).count

      stages.map do |stage|
        {
          stageId: stage.id,
          stageName: stage.name,
          count: counts[stage.id] || 0,
          color: stage.color,
          position: stage.position
        }
      end
    end

    def deal_value_per_stage
      deal_cards = active_cards.where.not(deal_value: nil)
      sums = deal_cards.group(:stage_id).sum(:deal_value)
      counts = deal_cards.group(:stage_id).count

      stages.map do |stage|
        {
          stageId: stage.id,
          stageName: stage.name,
          totalValue: (sums[stage.id] || 0).to_f,
          count: counts[stage.id] || 0
        }
      end
    end

    def cards_by_priority
      active_cards.where.not(priority: nil).group(:priority).count
    end

    def overdue_count
      active_cards.overdue.count
    end

    def deal_summary
      cards = @cards.unscope(:order)
      won_count = cards.won.count
      lost_count = cards.lost.count

      {
        wonCount: won_count,
        wonValue: cards.won.sum(:deal_value).to_f,
        lostCount: lost_count,
        lostValue: cards.lost.sum(:deal_value).to_f,
        openCount: cards.open_deals.active.count,
        openValue: cards.open_deals.active.sum(:deal_value).to_f,
        conversionRate: conversion_rate(won_count, lost_count)
      }
    end

    def conversion_rate(won, lost)
      total = won + lost
      return 0.0 if total.zero?

      (won.to_f / total * 100).round(1)
    end

    # Quanto tempo os cards passam em cada etapa: as passagens já encerradas (de uma movimentação até
    # a seguinte) mais as que seguem em aberto nos cards ativos.
    #
    # A origem calculava a distância entre cada movimentação e o `updated_at` do card, agrupando pela
    # etapa ATUAL. Isso não media o tempo em etapa nenhuma: qualquer edição mudava o número de todas.
    def avg_time_per_stage
      card_ids = @cards.unscope(:order).select(:id)
      averages = Card.lease_connection.select_rows(<<~SQL.squish).to_h
        SELECT stage_id, AVG(seconds) FROM (
          SELECT activities.details->>'from_stage_id' AS stage_id,
                 EXTRACT(EPOCH FROM activities.created_at - COALESCE(
                   LAG(activities.created_at) OVER (PARTITION BY activities.card_id ORDER BY activities.created_at),
                   cards.created_at
                 )) AS seconds
          FROM pipeline_card_activities activities
          JOIN pipeline_cards cards ON cards.id = activities.card_id
          WHERE activities.action = 'moved' AND activities.card_id IN (#{card_ids.to_sql})
          UNION ALL
          SELECT cards.stage_id::text, EXTRACT(EPOCH FROM NOW() AT TIME ZONE 'UTC' - cards.stage_entered_at)
          FROM pipeline_cards cards
          WHERE cards.archived = false AND cards.won_at IS NULL AND cards.lost_at IS NULL
            AND cards.id IN (#{card_ids.to_sql})
        ) stays
        GROUP BY stage_id
      SQL

      stages.map do |stage|
        {
          stageId: stage.id,
          stageName: stage.name,
          avgHours: (averages[stage.id].to_f / 3600).round(1)
        }
      end
    end

    def weighted_pipeline_value
      active_cards
        .open_deals
        .where.not(deal_probability: nil)
        .sum("deal_value * deal_probability / 100.0")
        .to_f
        .round(2)
    end

    def forecast
      active_cards
        .open_deals
        .where.not(expected_close_date: nil)
        .group("TO_CHAR(expected_close_date, 'YYYY-MM')")
        .pluck(
          Arel.sql("TO_CHAR(expected_close_date, 'YYYY-MM')"),
          Arel.sql("SUM(deal_value)"),
          Arel.sql("COUNT(*)"),
          Arel.sql("SUM(deal_value * COALESCE(deal_probability, 50) / 100.0)")
        )
        .sort_by(&:first)
        .map do |month, total, count, weighted|
          {
            month: month,
            totalValue: total.to_f,
            count: count.to_i,
            weightedValue: weighted.to_f.round(2)
          }
        end
    end
  end
end
