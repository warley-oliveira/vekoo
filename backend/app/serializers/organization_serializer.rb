class OrganizationSerializer < ApplicationSerializer
  # `plan` sai como **código** (`free`); o rótulo visível vem de `plans.<plan>`
  # na tela — o backend não escreve interface.
  def self.one(organization)
    {
      id: organization.id,
      name: organization.name,
      plan: organization.plan,
      createdAt: epoch_ms(organization.created_at)
    }
  end
end
