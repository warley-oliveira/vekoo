# Um contato de uma importação (origem: ImportedContact).
class ContactImportRow < ApplicationRecord
  STATUSES = %w[pending processing completed failed].freeze

  belongs_to :contact_import

  validates :name, :phone, presence: true
  validates :status, inclusion: { in: STATUSES }

  scope :pending, -> { where(status: "pending") }
  scope :completed, -> { where(status: "completed") }
  scope :failed, -> { where(status: "failed") }

  def mark_as_completed!
    update!(status: "completed", processed_at: Time.current)
  end

  def mark_as_failed!(error_message)
    update!(status: "failed", error_message: error_message, processed_at: Time.current)
  end
end
