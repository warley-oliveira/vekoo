require "rails_helper"

RSpec.describe Funnels::MoveChat do
  let(:organization) { create(:organization) }
  let(:funnel) { create(:funnel, organization: organization) }
  let(:stage) { funnel.stages.first }
  let(:chat) { create(:chat, organization: organization) }

  def stored(record)
    Chat.scoped(record.organization_id, record.id).funnel_stages
  end

  it "grava a etapa e devolve o resultado" do
    result = described_class.call(chat: chat, funnel: funnel, stage_id: stage.id)

    expect(result).to have_attributes(chat: chat, stage: stage, moved?: true)
    expect(stored(chat)).to eq(funnel.id => stage.id)
    expect(chat.funnel_stage_id(funnel.id)).to eq(stage.id)
  end

  it "não deixa nada pendente na instância, para um save não regravar o mapa" do
    described_class.call(chat: chat, funnel: funnel, stage_id: stage.id)

    expect(chat).not_to be_funnel_stages_changed
    expect { chat.update!(notes: "oi") }.not_to(change { stored(chat) })
  end

  it "avisa a lista conectada" do
    expect(chat).to receive(:dispatch_event!).once

    described_class.call(chat: chat, funnel: funnel, stage_id: stage.id)
  end

  it "mover para onde já está não escreve nem transmite" do
    described_class.call(chat: chat, funnel: funnel, stage_id: stage.id)

    expect(chat).not_to receive(:dispatch_event!)
    result = described_class.call(chat: chat, funnel: funnel, stage_id: stage.id)

    expect(result).not_to be_moved
  end

  it "nil tira do funil, e tirar quem não está não faz nada" do
    described_class.call(chat: chat, funnel: funnel, stage_id: stage.id)

    expect(described_class.call(chat: chat, funnel: funnel, stage_id: nil)).to be_moved
    expect(stored(chat)).to eq({})
    expect(described_class.call(chat: chat, funnel: funnel, stage_id: nil)).not_to be_moved
  end

  # A instância em memória de um não pode apagar o que o outro acabou de gravar.
  it "dois movimentos simultâneos em funis diferentes não se desfazem" do
    second = create(:funnel, organization: organization)
    stale = Chat.scoped(organization.id, chat.id)

    described_class.call(chat: chat, funnel: funnel, stage_id: stage.id)
    described_class.call(chat: stale, funnel: second, stage_id: second.stages.first.id)

    expect(stored(chat)).to eq(funnel.id => stage.id, second.id => second.stages.first.id)
  end

  it "recusa etapa de outro funil" do
    other = create(:funnel, organization: organization)

    expect { described_class.call(chat: chat, funnel: funnel, stage_id: other.stages.first.id) }.to raise_error(described_class::InvalidStage)
    expect(stored(chat)).to eq({})
  end

  it "recusa funil de outra organização" do
    foreign = create(:funnel)

    expect { described_class.call(chat: chat, funnel: foreign, stage_id: foreign.stages.first.id) }.to raise_error(described_class::ForeignFunnel)
    expect(stored(chat)).to eq({})
  end
end
