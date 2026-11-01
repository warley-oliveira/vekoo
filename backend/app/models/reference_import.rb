# Um lote de importação do Instagram: as contas que a curadoria colou, com o
# nicho e o porte sugeridos para os cards que saírem dele. Some em 30 dias
# junto com os candidatos que não viraram card (`References::Imports.purge!`);
# o card que saiu fica.
class ReferenceImport < ApplicationRecord
  MAX_ACCOUNTS = 20
  RETENTION = 30.days

  belongs_to :curated_by, class_name: "Account", optional: true
  has_many :accounts, -> { order(:username) }, class_name: "ReferenceImportAccount", dependent: :destroy
  has_many :candidates, through: :accounts

  validates :niche, inclusion: { in: Taxonomy::NICHES }, allow_nil: true
  validates :size, inclusion: { in: Taxonomy::SIZES }, allow_nil: true

  scope :recent_first, -> { order(created_at: :desc) }
  scope :expired, -> { where(created_at: ...RETENTION.ago) }

  def running? = accounts.any? { |account| account.status.in?(%w[pending running]) }
end
