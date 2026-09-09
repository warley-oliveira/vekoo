class Folder < ApplicationRecord
  belongs_to :organization
  # Opcional só por causa do legado (ver `orphans`): pasta nova nasce na marca.
  belongs_to :brand_core, optional: true
  has_many :carousels, dependent: :nullify

  normalizes :name, with: ->(name) { name.squish }

  validates :name, presence: true, length: { maximum: 60 }
  validates :color, presence: true

  scope :ordered, -> { order(:name) }
  scope :in_brand, ->(brand_id) { where(brand_core_id: brand_id) }
  scope :orphans, -> { where(brand_core_id: nil) }

  validate :must_be_born_in_a_brand, on: :create

  private

  def must_be_born_in_a_brand
    return errors.add(:brand_core, :blank) if brand_core.nil?

    errors.add(:brand_core, :invalid) if brand_core.organization_id != organization_id
  end
end
