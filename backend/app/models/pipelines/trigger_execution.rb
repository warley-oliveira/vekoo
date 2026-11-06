module Pipelines
  class TriggerExecution < ApplicationRecord
    STATUSES = %w[success failure skipped].freeze
    # Quanto o histórico fica guardado. Ver `Pipelines::PurgeTriggerExecutionsJob`.
    RETENTION = 90.days

    belongs_to :trigger, class_name: "Pipelines::Trigger", foreign_key: :pipeline_trigger_id, inverse_of: :executions
    belongs_to :card, class_name: "Pipelines::Card", inverse_of: :trigger_executions

    validates :status, presence: true, inclusion: { in: STATUSES }

    scope :recent, -> { order(executed_at: :desc) }
    scope :for_board, ->(board_id) { joins(:trigger).where(pipeline_triggers: { board_id: board_id }) }
  end
end
