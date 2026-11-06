# O registro de cada requisição recebida por um webhook. Mora no Mongo, como na origem, e tem dois
# tetos: o índice TTL apaga depois de `RETENTION`, e o documento nunca passa do tamanho de `Hooks::Capture`.
# `Hooks::PruneLogsJob` corta quem recebe mais do que `MAX_PER_HOOK`.
class HookLog
  include Mongoid::Document
  include Mongoid::Timestamps::Created

  RETENTION = 90.days
  MAX_PER_HOOK = 10_000
  STATUSES = %w[success error skipped].freeze

  field :hook_id, type: String
  field :hook_uid, type: String
  field :hook_name, type: String
  field :organization_id, type: String

  field :request_method, type: String, default: "POST"
  field :request_headers, type: Hash, default: {}
  field :request_body, type: Hash, default: {}
  field :request_query, type: Hash, default: {}
  field :request_ip, type: String

  field :status, type: String
  field :status_code, type: Integer, default: 200
  field :error_message, type: String
  field :processing_time_ms, type: Float

  # Como o webhook estava na hora: active, test ou inactive.
  field :hook_status, type: String

  validates :hook_id, :hook_uid, :organization_id, presence: true
  validates :status, inclusion: { in: STATUSES }

  index({ created_at: 1 }, { expire_after_seconds: RETENTION.to_i, background: true })
  index({ organization_id: 1, created_at: -1 }, { background: true })
  index({ organization_id: 1, hook_id: 1, created_at: -1 }, { background: true })

  scope :for_organization, ->(organization_id) { where(organization_id: organization_id.to_s) }
  scope :for_hook, ->(hook_id) { where(hook_id: hook_id.to_s) }
  scope :recent, -> { order_by(created_at: :desc, _id: :desc) }

  # Nunca derruba quem recebeu a requisição: o log é para olhar depois.
  #
  # @param capture [Hash] o que veio de Hooks::Capture
  # @return [HookLog, nil]
  def self.record(hook:, capture:, status:, error_message: nil, processing_time_ms: nil, status_code: nil)
    create!(
      hook_id: hook.id,
      hook_uid: hook.uid,
      hook_name: hook.name,
      organization_id: hook.organization_id,
      request_method: capture["method"],
      request_headers: capture["headers"],
      request_body: capture["body"],
      request_query: capture["query"],
      request_ip: capture["ip"],
      status: status,
      status_code: status_code || (status == "error" ? 500 : 200),
      error_message: error_message&.to_s&.truncate(2_000),
      processing_time_ms: processing_time_ms,
      hook_status: hook.status
    )
  rescue StandardError => e
    Rails.logger.error("[HookLog] não gravou: #{e.class}: #{e.message}")
    nil
  end

  def success?
    status == "success"
  end

  def error?
    status == "error"
  end

  def skipped?
    status == "skipped"
  end
end
