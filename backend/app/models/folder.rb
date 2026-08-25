class Folder < ApplicationRecord
  belongs_to :organization
  has_many :carousels, dependent: :nullify

  normalizes :name, with: ->(name) { name.squish }

  validates :name, presence: true, length: { maximum: 60 }
  validates :color, presence: true

  scope :ordered, -> { order(:name) }
end
