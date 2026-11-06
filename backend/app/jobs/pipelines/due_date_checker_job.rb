module Pipelines
  # Dispara os gatilhos de `due_date_passed` para o card cujo prazo venceu.
  #
  # Uma vez por prazo: `due_notified_at` é marcado antes de enfileirar, e mudar o prazo para depois
  # libera um novo aviso. Na origem este job nunca esteve agendado, e como escrito dispararia todos os
  # gatilhos de todos os cards atrasados a cada execução.
  #
  # Só olha quadros que têm o gatilho, e o gatilho só vale para o prazo que venceu depois de ele existir:
  # criar um gatilho num quadro com 300 cards atrasados não pode mandar 300 mensagens de uma vez.
  class DueDateCheckerJob < ApplicationJob
    queue_as :low
    # A próxima varredura é a nova tentativa.
    sidekiq_options retry: false

    PENDING = "due_notified_at IS NULL OR due_notified_at < due_date".freeze

    def perform
      board_ids = Trigger.for_event("due_date_passed").distinct.pluck(:board_id)

      Board.active.where(id: board_ids).find_each do |board|
        check_board(board)
      rescue StandardError => e
        Rails.logger.error("[Pipelines::DueDateCheckerJob] quadro #{board.id}: #{e.class}: #{e.message}")
      end
    end

    private

    def check_board(board)
      triggers = board.triggers.for_event("due_date_passed").to_a

      overdue_cards(board).find_each do |card|
        next unless claim(card)

        fire(triggers, card, board)
      rescue StandardError => e
        Rails.logger.error("[Pipelines::DueDateCheckerJob] card #{card.id}: #{e.class}: #{e.message}")
      end
    end

    def overdue_cards(board)
      Card.unscoped
          .where(stage_id: board.stages.unscope(:order).select(:id), archived: false, completed_at: nil)
          .where("due_date < ?", Time.current)
          .where(PENDING)
    end

    def claim(card)
      Card.unscoped.where(id: card.id).where(PENDING).update_all(due_notified_at: Time.current).positive?
    end

    def fire(triggers, card, board)
      context = {
        event_type: "due_date_passed",
        card_id: card.id,
        board_id: board.id,
        stage_id: card.stage_id,
        due_date: card.due_date&.iso8601
      }

      triggers.each do |trigger|
        next unless trigger.applies_to_stage?(card.stage_id)
        next if card.due_date < trigger.created_at
        next unless trigger.conditions_met?(context)

        TriggerJob.perform_later(trigger.id, card.id, context.to_json)
      end
    end
  end
end
