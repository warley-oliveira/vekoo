# Departamento da organização: agrupa pessoas para distribuir conversas.
class Team < ApplicationRecord
  belongs_to :organization

  has_many :team_memberships, dependent: :destroy
  has_many :accounts, through: :team_memberships

  normalizes :name, with: ->(name) { name.squish }

  validates :name, presence: true, length: { maximum: 60 }, uniqueness: { scope: :organization_id }
end
