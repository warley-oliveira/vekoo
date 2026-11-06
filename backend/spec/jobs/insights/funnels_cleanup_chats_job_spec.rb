require "rails_helper"

RSpec.describe Funnels::CleanupChatsJob do
  let(:organization) { create(:organization) }
  let(:funnel) { create(:funnel, organization: organization) }
  let(:first_stage) { funnel.stages.first }
  let(:last_stage) { funnel.stages.last }

  def chat_in(stage, org = organization, target = funnel)
    create(:chat, organization: org).tap { |chat| chat.place_in_funnel!(target.id, stage.id) }
  end

  def stored(chat)
    Chat.scoped(chat.organization_id, chat.id).funnel_stages
  end

  it "sem etapas, tira o funil inteiro das conversas da organização" do
    other = create(:funnel, organization: organization)
    chat = chat_in(first_stage)
    chat.place_in_funnel!(other.id, other.stages.first.id)

    described_class.perform_now(organization.id, funnel.id)

    expect(stored(chat)).to eq(other.id => other.stages.first.id)
  end

  it "com etapas, tira só quem estava nelas" do
    gone = chat_in(last_stage)
    stays = chat_in(first_stage)

    described_class.perform_now(organization.id, funnel.id, [ last_stage.id ])

    expect(stored(gone)).to eq({})
    expect(stored(stays)).to eq(funnel.id => first_stage.id)
  end

  it "não encosta em outra organização, mesmo com o mesmo id de funil" do
    foreign = chat_in(first_stage, create(:organization))

    described_class.perform_now(organization.id, funnel.id)

    expect(stored(foreign)).to eq(funnel.id => first_stage.id)
  end
end
