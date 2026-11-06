module Pipelines
  # Arquiva o que o quadro pediu para arquivar: card parado há X dias, e negócio fechado há X dias.
  class AutoArchiveJob < ApplicationJob
    queue_as :low
    # A próxima varredura é a nova tentativa.
    sidekiq_options retry: false

    def perform
      archive_stale_cards
      archive_closed_deals
    end

    private

    def archive_stale_cards
      Board.active.with_auto_archive.find_each do |board|
        cards = cards_of(board).where(won_at: nil, lost_at: nil).stale(board.auto_archive_days)

        archive(cards, reason: "stale", days_inactive: board.auto_archive_days)
      end
    end

    def archive_closed_deals
      Board.active.with_deal_auto_archive.find_each do |board|
        cutoff = board.deal_close_archive_days.days.ago
        cards = cards_of(board).closed_deals.where("COALESCE(pipeline_cards.won_at, pipeline_cards.lost_at) < ?", cutoff)

        archive(cards, reason: "deal_closed", days_after_close: board.deal_close_archive_days)
      end
    end

    def cards_of(board)
      Card.unscoped.where(stage_id: board.stages.unscope(:order).select(:id), archived: false)
    end

    # Um card com problema não pode parar a varredura de todos os outros.
    def archive(cards, **reason)
      cards.find_each do |card|
        card.auto_archive_reason = reason
        card.update!(archived: true)
      rescue StandardError => e
        Rails.logger.error("[Pipelines::AutoArchiveJob] card #{card.id}: #{e.class}: #{e.message}")
      end
    end
  end
end
