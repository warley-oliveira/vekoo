module Pipelines
  # Move um card de etapa, ou dentro da mesma etapa. Um lugar só para as travas, usado pela tela, por
  # script e por fluxo. Gatilho passa `enforce_gates: false`: quem configurou o gatilho escolheu mover
  # sem conferir, como na origem.
  #
  # As travas só valem para a frente, como na origem: voltar uma etapa não exige nada.
  class MoveCard
    Result = Struct.new(:moved, :error, :pending_items, :pending_fields, keyword_init: true) do
      def moved?
        moved
      end
    end

    # @param position [Integer, nil] posição na lista, a partir de 1
    # @param at [Symbol, nil] `:top` ou `:bottom`, no lugar de `position`
    def self.call(card:, stage:, position: nil, at: nil, enforce_gates: true)
      new(card, stage, position, at, enforce_gates).call
    end

    def initialize(card, stage, position, at, enforce_gates)
      @card = card
      @stage = stage
      @position = position
      @at = at
      @enforce_gates = enforce_gates
    end

    def call
      result = Result.new(moved: true)

      Card.transaction do
        # As duas listas ficam presas até o commit: dois arrastes ao mesmo tempo não embaralham as
        # posições. O card é relido depois da trava, porque a posição pode ter mudado na espera.
        ListLock.acquire(@card.stage_id, @stage.id)
        @card.reload

        blocked = @enforce_gates ? gate_result(@card.stage) : nil
        if blocked
          result = blocked
        else
          @card.update!(stage: @stage, position: nil) if @card.stage_id != @stage.id
          place
        end
      end

      result
    end

    private

    def gate_result(source)
      return nil unless source.id != @stage.id && @stage.position > source.position

      unless source.checklist_complete_for?(@card)
        return Result.new(
          moved: false,
          error: :checklist_incomplete,
          pending_items: source.incomplete_required_items_for(@card)
        )
      end

      pending_fields = source.incomplete_required_field_values_for(@card)
      return nil if pending_fields.empty?

      Result.new(moved: false, error: :required_fields_incomplete, pending_fields: pending_fields)
    end

    def place
      case @at
      when :top then @card.move_to_top
      when :bottom then @card.move_to_bottom
      else @card.insert_at(clamped_position) if @position
      end
    end

    # Fora da lista, a gem levantaria (abaixo de 1) ou deixaria um buraco (acima do fim).
    def clamped_position
      last = Card.unscoped.where(stage_id: @card.stage_id).count
      @position.to_i.clamp(1, [ last, 1 ].max)
    end
  end
end
