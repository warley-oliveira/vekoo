require "rails_helper"

RSpec.describe Pipelines::CardVisibility do
  subject(:visibility) { described_class.new(board, user) }

  let(:organization) { create(:organization) }
  let(:role) { create(:access_role, organization: organization, name: "Supervisão") }
  let(:other_role) { create(:access_role, organization: organization, name: "Vendas") }
  let(:user) { create(:account, organization: organization, role: "member", access_role: other_role) }
  let(:board) do
    create(:pipeline_board, organization: organization, card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])
  end
  let(:stage) { create(:pipeline_stage, board: board) }
  let!(:own_card) { create(:pipeline_card, stage: stage, assigned_to: user) }
  let!(:other_card) { create(:pipeline_card, stage: stage) }

  context "com o quadro aberto para todos" do
    let(:board) { create(:pipeline_board, organization: organization) }

    it "não restringe" do
      expect(visibility.scope(board.cards)).to contain_exactly(own_card, other_card)
      expect(visibility).to be_unrestricted
    end
  end

  context "com a pessoa fora dos grupos liberados" do
    it "só os cards dela" do
      expect(visibility.scope(board.cards)).to contain_exactly(own_card)
    end

    it "esconde os dos outros" do
      expect(visibility.visible?(other_card)).to be(false)
      expect(visibility.visible?(own_card)).to be(true)
    end
  end

  context "com a pessoa num grupo liberado" do
    let(:user) { create(:account, organization: organization, role: "member", access_role: role) }

    it "vê todos" do
      expect(visibility.scope(board.cards)).to contain_exactly(own_card, other_card)
    end
  end

  context "sem grupo nenhum" do
    let(:user) { create(:account, organization: organization, role: "member", access_role: nil) }

    it "é restrita" do
      expect(visibility).not_to be_unrestricted
    end
  end

  context "com a dona da organização" do
    let(:user) { create(:account, organization: organization, role: "owner", access_role: nil) }

    it "vê tudo: é o lugar do `super_user` da origem" do
      expect(visibility).to be_unrestricted
    end
  end
end
