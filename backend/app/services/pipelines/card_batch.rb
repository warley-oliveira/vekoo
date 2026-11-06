module Pipelines
  # O que cada card mostra e que mora em outra tabela, calculado de uma vez para a lista inteira. A
  # origem carregava todos os comentários de todos os cards do quadro só para contar.
  class CardBatch
    def initialize(cards, viewer: nil)
      @cards = Array(cards)
      @ids = @cards.map(&:id)
      @viewer = viewer
    end

    def comments_count(card)
      comments_counts[card.id] || 0
    end

    def watchers_count(card)
      watchers_counts[card.id] || 0
    end

    def checklist_progress(card)
      { completed: checklist_counts[[ card.id, true ]] || 0,
        total: (checklist_counts[[ card.id, true ]] || 0) + (checklist_counts[[ card.id, false ]] || 0) }
    end

    def stage_checks_progress(card)
      { completed: stage_checks_completed[card.id] || 0, total: stage_checks_totals[card.stage_id] || 0 }
    end

    def chat_summary(card)
      chat_summaries[card.chat_id]
    end

    private

    def comments_counts
      @comments_counts ||= Comment.where(card_id: @ids).group(:card_id).count
    end

    def watchers_counts
      @watchers_counts ||= CardWatcher.where(card_id: @ids).group(:card_id).count
    end

    def checklist_counts
      @checklist_counts ||= ChecklistItem.unscoped
                                         .joins(:checklist)
                                         .where(pipeline_checklists: { card_id: @ids })
                                         .group("pipeline_checklists.card_id", :completed)
                                         .count
    end

    def stage_checks_totals
      @stage_checks_totals ||= StageChecklistItem.unscoped
                                                 .where(stage_id: @cards.map(&:stage_id).uniq)
                                                 .group(:stage_id)
                                                 .count
    end

    # Só os itens da etapa atual: a marca de uma etapa por onde o card já passou não conta aqui.
    def stage_checks_completed
      @stage_checks_completed ||= CardStageCheck.where(card_id: @ids, completed: true)
                                                .joins(:card, :checklist_item)
                                                .where("pipeline_stage_checklist_items.stage_id = pipeline_cards.stage_id")
                                                .group(:card_id)
                                                .count
    end

    def chat_summaries
      @chat_summaries ||= ChatSummary.for_account(@viewer, @cards.filter_map(&:chat_id))
    end
  end
end
