require "rails_helper"

# Apagar uma organização leva tudo o que é dela — em produção a exclusão da
# demonstração parou na chave estrangeira de `onboarding_events`.
RSpec.describe Organization, "#destroy" do
  it "apaga a organização com marca, foto gerada, conversa, peça e telemetria do onboarding" do
    account = create(:account)
    organization = account.organization
    brand = create(:brand_core, :published, organization: organization)
    create(:brand_asset, :photo, brand_core: brand)
    create(:piece, brand_core: brand, organization: organization)
    conversation = brand.agent_conversations.create!(organization: organization, account: account, title: "Teste")
    turn = conversation.turns.create!(organization: organization, account: account, kind: "create", prompt: "post", credits_charged: 0)
    brand.image_generations.create!(organization: organization, account: account, agent_turn: turn, prompt: "pão", aspect_ratio: "1:1",
      count: 1, credits_charged: 0, status: "done")
    OnboardingEvent.create!(organization: organization, brand_core: brand, account: account,
      step: OnboardingEvent::STEPS.first, action: "viewed")

    expect { organization.destroy! }.not_to raise_error

    expect(Organization.exists?(organization.id)).to be(false)
    expect(OnboardingEvent.where(organization_id: organization.id)).to be_empty
    expect(BrandCore.where(organization_id: organization.id)).to be_empty
  end
end
