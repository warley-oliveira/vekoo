module Pipelines
  # Definição de um campo personalizado do quadro (na origem, `KanbanCustomFieldDefinition`). O valor
  # fica em `Card#custom_field_values`, chaveado por `key`.
  class CustomField < ApplicationRecord
    include Pipelines::OrderedList

    FIELD_TYPES = %w[text number date select checkbox url user].freeze

    belongs_to :board, class_name: "Pipelines::Board", inverse_of: :custom_fields
    belongs_to :stage, class_name: "Pipelines::Stage", optional: true, inverse_of: :custom_fields

    ordered_within :board_id

    enum :scope, { board: "board", stage: "stage" }, suffix: :scope, validate: true

    validates :name, presence: true, length: { maximum: 120 }
    validates :key, uniqueness: { scope: :board_id }
    validates :field_type, presence: true, inclusion: { in: FIELD_TYPES }
    validates :options, presence: true, if: :select?
    validates :stage_id, presence: true, if: :stage_scope?
    validates :stage_id, absence: true, if: :board_scope?
    validates :position, numericality: Pipelines::POSITIVE_INTEGER, allow_nil: true
    validate :stage_belongs_to_board, if: -> { stage_scope? && stage_id.present? }

    # Só ao nascer. Na origem a chave era recalculada a cada save: renomear o campo deixava para trás,
    # sob a chave antiga, o valor gravado em todos os cards do quadro.
    before_validation :assign_key, on: :create

    after_commit :broadcast_custom_fields_changed, on: %i[create update destroy]

    def select?
      field_type == "select"
    end

    private

    # O nome pode não ter uma letra latina sequer ("日本語" vira chave vazia), e a chave entra no SQL
    # dos filtros: precisa casar com `CardQuery::CUSTOM_KEY_FORMAT`.
    def assign_key
      self.key = key.presence || name.to_s.parameterize.underscore.presence || "campo_#{SecureRandom.hex(3)}"
    end

    def stage_belongs_to_board
      errors.add(:stage_id, :invalid) unless stage&.board_id == board_id
    end

    # Sem o quadro, foi ele que se apagou, e não há mais ninguém para avisar.
    def broadcast_custom_fields_changed
      current_board = board
      return unless current_board

      PipelineBoardChannel.broadcast_board_event(current_board, event: "custom_fields_changed", data: { boardId: board_id })
    end
  end
end
