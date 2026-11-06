module Pipelines
  # Verifica se um card pode ser fechado como ganho ou perdido, dada a escolha do quadro.
  #
  # O que é exigido: campos marcados como `required` do quadro inteiro, ou da etapa onde o card está
  # agora. Fechar um negócio é ação terminal: o card sai do funil sem passar pela trava de mover, por
  # isso os campos gerais do quadro também contam aqui.
  class DealCloseGate
    OUTCOMES = %i[won lost].freeze

    Result = Struct.new(:allowed, :pending_fields, :pending_field_keys, keyword_init: true) do
      def allowed?
        allowed
      end
    end

    def initialize(card, outcome)
      raise ArgumentError, "unknown outcome: #{outcome}" unless OUTCOMES.include?(outcome)

      @card = card
      @outcome = outcome
    end

    def call
      return allow unless enabled?

      pending = pending_definitions
      return allow if pending.empty?

      Result.new(allowed: false, pending_fields: pending.map(&:name), pending_field_keys: pending.map(&:key))
    end

    private

    attr_reader :card, :outcome

    def board
      @board ||= card.stage&.board
    end

    def enabled?
      return false if board.blank?

      outcome == :won ? board.require_fields_on_deal_won? : board.require_fields_on_deal_lost?
    end

    def pending_definitions
      values = card.custom_field_values || {}
      required_definitions.select { |definition| CustomFieldValue.blank_value?(values[definition.key]) }
    end

    def required_definitions
      board.custom_fields
           .where(required: true)
           .where("scope = 'board' OR (scope = 'stage' AND stage_id = ?)", card.stage_id)
    end

    def allow
      Result.new(allowed: true, pending_fields: [], pending_field_keys: [])
    end
  end
end
