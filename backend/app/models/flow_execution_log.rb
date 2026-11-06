# O que cada bloco fez, para a tela de histórico. Entrada e saída vêm cortadas por
# `FlowRuntime::Limits`: uma resposta de HTTP ou de script pode ter megabytes, e aqui é só para olhar.
class FlowExecutionLog < ApplicationRecord
  STATUSES = %w[success error skipped suspended].freeze

  belongs_to :flow_execution

  validates :node_id, presence: true
  validates :node_type, presence: true
  validates :status, inclusion: { in: STATUSES }

  before_validation :set_executed_at, on: :create

  scope :errors, -> { where(status: "error") }
  scope :ordered, -> { order(executed_at: :asc, id: :asc) }

  private

  def set_executed_at
    self.executed_at ||= Time.current
  end
end
