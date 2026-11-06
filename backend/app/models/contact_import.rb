# Uma leva de contatos importados para um canal (origem: ContactImportBatch). Quem processa é
# ProcessContactImportJob; as linhas ficam em ContactImportRow.
class ContactImport < ApplicationRecord
  STATUSES = %w[pending processing completed failed].freeze

  belongs_to :organization
  belongs_to :account, optional: true
  has_many :contact_import_rows, dependent: :delete_all

  validates :connector_id, presence: true
  validates :total_contacts, numericality: { greater_than: 0 }
  validates :imported_contacts_count, :errors_count, numericality: { greater_than_or_equal_to: 0 }
  validates :status, inclusion: { in: STATUSES }

  scope :recent_first, -> { order(created_at: :desc) }

  STATUSES.each do |value|
    define_method(:"#{value}?") { status == value }
  end

  def start_processing!
    update!(status: "processing", started_at: Time.current)
  end

  def mark_completed!
    update!(status: "completed", completed_at: Time.current)
  end

  def mark_failed!
    update!(status: "failed", completed_at: Time.current)
  end

  # O conector é da mesma organização: um id trocado nunca alcança canal de outra.
  def connector
    @connector ||= Connector::Base.scoped(organization_id, connector_id)
  end

  def success_rate
    return 0 if total_contacts.zero?

    ((imported_contacts_count.to_f / total_contacts) * 100).round(2)
  end

  def processing_duration
    return nil unless started_at && completed_at

    completed_at - started_at
  end

  def progress_percentage
    return 0 if total_contacts.zero?

    (((imported_contacts_count + errors_count).to_f / total_contacts) * 100).round(2)
  end
end
