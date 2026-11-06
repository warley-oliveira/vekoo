# frozen_string_literal: true

require "rails_helper"

RSpec.describe MiniRacerEngine::SessionContext do
  subject(:session) { described_class.new }

  it "guarda o que as extensões quiserem, com chave texto ou símbolo" do
    session.set(:qualquer, 1)

    expect(session.get("qualquer")).to eq(1)
    expect(session.get(:qualquer)).to eq(1)
    expect(session.get(:outra)).to be_nil
  end

  it "conhece a organização e a conversa" do
    organization = create(:organization)
    chat = create(:chat, organization: organization)
    session.set(:organization, organization)
    session.set(:chat, chat)

    expect(session.organization).to eq(organization)
    expect(session.organization_id).to eq(organization.id)
    expect(session.chat).to eq(chat)
  end

  it "vazio não é erro: só não alcança nada" do
    expect(session.organization_id).to be_nil
    expect { session.validate! }.not_to raise_error
  end

  describe "#validate!" do
    let(:organization) { create(:organization) }

    before { session.set(:organization, organization) }

    it "aceita conversa da organização" do
      session.set(:chat, create(:chat, organization: organization))

      expect { session.validate! }.not_to raise_error
    end

    it "recusa conversa de outra organização" do
      session.set(:chat, create(:chat, organization: create(:organization)))

      expect { session.validate! }.to raise_error(MiniRacerEngine::Error, /does not belong/)
    end
  end
end
