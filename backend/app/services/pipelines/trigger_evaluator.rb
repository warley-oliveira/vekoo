module Pipelines
  # Decide quais gatilhos do quadro um evento do card dispara e os enfileira.
  class TriggerEvaluator
    def self.call(card, board, event_context = {})
      new(card, board, event_context).evaluate
    end

    def initialize(card, board, event_context = {})
      @card = card
      @board = board
      @event_context = event_context
    end

    def evaluate
      event_type = @event_context[:event_type]
      return if event_type.blank?

      context = build_context(event_type)

      @board.triggers.for_event(event_type).each do |trigger|
        next unless trigger.applies_to_stage?(relevant_stage_id(event_type))
        next unless trigger.conditions_met?(context)

        TriggerJob.perform_later(trigger.id, @card.id, @event_context.to_json)
      end
    end

    private

    # Gatilho de etapa: ao mover, vale a etapa de destino; nos demais eventos, a etapa em que o card
    # está. Na origem, só "movido" e "criado" olhavam a etapa, e um gatilho de etapa em qualquer outro
    # evento (ganho, editado) era aceito na tela e nunca disparava.
    def relevant_stage_id(event_type)
      event_type == "card_moved" ? @event_context[:to_stage_id] : @card.stage_id
    end

    def build_context(event_type)
      context = @event_context.dup

      if context[:from_stage_id].present?
        names = Stage.unscoped.where(id: [ context[:from_stage_id], context[:to_stage_id] ]).pluck(:id, :name).to_h
        context[:from_stage_name] = names[context[:from_stage_id]]
        context[:to_stage_name] = names[context[:to_stage_id]]
      end

      context[:card_id] = @card.id
      context[:board_id] = @board.id
      context[:stage_id] = @card.stage_id
      context[:assigned_to_id] = @card.assigned_to_id
      context[:priority] = @card.priority

      enrich_for_deal(context, event_type) if Trigger::CRM_EVENT_TYPES.include?(event_type)
      context
    end

    def enrich_for_deal(context, event_type)
      context[:deal_value] = @card.deal_value
      context[:deal_probability] = @card.deal_probability
      context[:company_name] = @card.company_name
      context[:contact_email] = @card.contact_email
      context[:lost_reason] = @card.lost_reason if event_type == "deal_lost"
    end
  end
end
