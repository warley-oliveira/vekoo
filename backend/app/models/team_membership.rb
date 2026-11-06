class TeamMembership < ApplicationRecord
  belongs_to :team
  belongs_to :account

  validates :account_id, uniqueness: { scope: :team_id }
end
