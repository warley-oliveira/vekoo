# Uma rodada de um fluxo em uma conversa, com o estado em `context` (variáveis e o que cada bloco
# precisa lembrar). O histórico fica em `FlowExecutionLog`, uma linha por bloco.
#
# Quem executa é quem ganhou a linha: `claim` troca o status num único UPDATE, então dois eventos da
# mesma conversa nunca rodam o mesmo bloco ao mesmo tempo. Ver FlowRuntime::Engine.
class FlowExecution < ApplicationRecord
  STATUSES = %w[pending running waiting waiting_for_message completed failed cancelled].freeze
  ACTIVE_STATUSES = %w[pending running waiting waiting_for_message].freeze
  FINISHED_STATUSES = %w[completed failed cancelled].freeze

  belongs_to :flow
  belongs_to :flow_version
  belongs_to :organization
  has_many :logs, -> { order(executed_at: :asc, id: :asc) }, class_name: "FlowExecutionLog", inverse_of: :flow_execution

  validates :status, inclusion: { in: STATUSES }

  scope :active, -> { where(status: ACTIVE_STATUSES) }
  scope :finished, -> { where(status: FINISHED_STATUSES) }
  scope :waiting_for_message, -> { where(status: "waiting_for_message") }
  scope :running, -> { where(status: "running") }
  scope :playground_runs, -> { where(playground: true) }
  scope :real_runs, -> { where(playground: false) }
  scope :for_chat, ->(organization_id, chat_id) { where(organization_id: organization_id, chat_id: chat_id.to_s) }

  # @return [String, nil] o token de quem ganhou, ou nil se outro já levou (ou se nada há a retomar)
  def self.claim(id, from:, resume_token: nil)
    token = SecureRandom.hex(8)
    scope = where(id: id, status: from)
    scope = scope.where(resume_token: resume_token) if resume_token

    won = scope.update_all(
      status: "running",
      run_token: token,
      locked_at: Time.current,
      resume_token: nil,
      resume_at: nil,
      updated_at: Time.current
    )
    won == 1 ? token : nil
  end

  def active?
    ACTIVE_STATUSES.include?(status)
  end

  def finished?
    FINISHED_STATUSES.include?(status)
  end

  def variables
    context["variables"] || {}
  end

  def merge_variables!(extra)
    self.context = context.merge("variables" => FlowRuntime::Limits.bound_variables(variables.merge(extra.to_h.stringify_keys)))
  end

  def chat
    return nil if chat_id.blank?

    # Sempre com o escopo: `chats` não pode ser buscada só pelo id.
    @chat ||= Chat.scoped(organization_id, chat_id)
  end

  def transition!(new_status, extra = {})
    update!({ status: new_status }.merge(extra))
  end

  def complete!
    transition!("completed", completed_at: Time.current, run_token: nil, locked_at: nil)
  end

  def fail!(message)
    transition!("failed", error_message: message.to_s.truncate(2_000), completed_at: Time.current, run_token: nil, locked_at: nil)
  end

  def cancel!
    transition!("cancelled", completed_at: Time.current, run_token: nil, locked_at: nil, resume_token: nil, resume_at: nil)
  end
end
