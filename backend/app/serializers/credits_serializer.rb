class CreditsSerializer < ApplicationSerializer
  def self.one(organization)
    {
      total: organization.credits_total,
      used: organization.credits_used,
      left: organization.credits_left
    }
  end
end
