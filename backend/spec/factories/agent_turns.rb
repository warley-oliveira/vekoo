FactoryBot.define do
  factory :agent_conversation, class: "AgentConversation" do
    organization
    brand_core { association :brand_core, :published, organization: organization }
    title { "post da promoção de quarta" }
  end

  factory :agent_turn, class: "AgentTurn" do
    organization
    conversation { association :agent_conversation, organization: organization }
    kind { "create" }
    status { "answered" }
    prompt { "post da promoção de quarta" }
  end
end
