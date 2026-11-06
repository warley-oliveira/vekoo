# Uma busca de estabelecimentos no Google Maps, pelo Apify. Origem: Apify::Extraction.
module Outreach
  class PlaceExtraction
    include Mongoid::Document
    include Mongoid::Timestamps

    STATUSES = %w[pending running completed failed].freeze
    IN_PROGRESS_STATUSES = %w[pending running].freeze

    field :organization_id, type: String
    field :created_by_account_id, type: String

    field :search_query, type: String
    field :location, type: String
    field :max_places, type: Integer, default: 100
    field :language, type: String, default: "pt-BR"
    field :filters, type: Hash, default: {}

    field :status, type: String, default: "pending"
    field :apify_run_id, type: String
    field :results, type: Array, default: []
    field :results_count, type: Integer, default: 0
    # Código que a tela traduz. `error_message` guarda o que o Apify disse, quando disse algo.
    field :error_code, type: String
    field :error_message, type: String

    field :started_at, type: Time
    field :completed_at, type: Time

    validates :organization_id, presence: true
    validates :search_query, presence: true, length: { maximum: 200 }
    validates :status, inclusion: { in: STATUSES }

    index({ organization_id: 1, created_at: -1 })
    index({ status: 1, updated_at: 1 })

    scope :for_organization, ->(organization_id) { where(organization_id: organization_id.to_s) }
    scope :recent, -> { order_by(created_at: :desc) }
    scope :completed, -> { where(status: "completed") }
    scope :pending_or_running, -> { where(:status.in => IN_PROGRESS_STATUSES) }
    # `results` pode ter centenas de lugares: a lista não precisa deles.
    scope :without_results, -> { without(:results) }

    # A única forma de carregar uma extração por id vindo de fora.
    def self.scoped(organization_id, id)
      for_organization(organization_id).where(id: id).take
    end

    def pending? = status == "pending"
    def running? = status == "running"
    def completed? = status == "completed"
    def failed? = status == "failed"

    def created_by
      Account.find_by(id: created_by_account_id, organization_id: organization_id) if created_by_account_id
    end

    def mark_running!(run_id = nil)
      update!(status: "running", apify_run_id: run_id, started_at: Time.current)
    end

    def mark_completed!(normalized_results)
      update!(
        status: "completed",
        results: normalized_results.map(&:deep_stringify_keys),
        results_count: normalized_results.size,
        completed_at: Time.current
      )
    end

    def mark_failed!(code, message = nil)
      update!(status: "failed", error_code: code, error_message: message, completed_at: Time.current)
    end

    def duration_seconds
      return nil unless started_at

      ((completed_at || Time.current) - started_at).round(1)
    end
  end
end
