require "rails_helper"

RSpec.describe Pipelines::Board, type: :model do
  let(:organization) { create(:organization) }

  it "usa a tabela do domínio" do
    expect(described_class.table_name).to eq("pipeline_boards")
    expect(Pipelines::Stage.table_name).to eq("pipeline_stages")
    expect(Pipelines::CardStageCheck.table_name).to eq("pipeline_card_stage_checks")
  end

  describe "campos obrigatórios ao fechar negócio" do
    let(:board) { create(:pipeline_board, :crm, organization: organization) }

    it "as duas opções nascem desligadas" do
      expect(board.require_fields_on_deal_won).to be(false)
      expect(board.require_fields_on_deal_lost).to be(false)
      expect(board.validates_fields_on_deal_close?).to be(false)
    end

    it "basta uma ligada" do
      board.update!(require_fields_on_deal_lost: true)

      expect(board.validates_fields_on_deal_close?).to be(true)
    end
  end

  describe "visibilidade dos cards" do
    let(:role) { create(:access_role, organization: organization) }
    let(:board) { create(:pipeline_board, :crm, organization: organization) }

    it "nasce aberta para todos" do
      expect(board).not_to be_card_visibility_restricted
    end

    it "recusa modo desconhecido" do
      board.card_visibility = "ninguem"

      expect(board).not_to be_valid
    end

    it "restrita, precisa de um grupo" do
      board.card_visibility = "assigned"

      expect(board).not_to be_valid
      expect(board.errors[:card_visibility_bypass_role_ids]).to be_present
    end

    it "recusa grupo de outra organização e id que não é UUID" do
      board.card_visibility = "assigned"
      board.card_visibility_bypass_role_ids = [ create(:access_role).id ]
      expect(board).not_to be_valid

      board.card_visibility_bypass_role_ids = [ "12" ]
      expect(board).not_to be_valid
    end

    it "guarda a lista sem repetição e em ordem" do
      other = create(:access_role, organization: organization)
      board.card_visibility_bypass_role_ids = [ role.id, other.id, role.id ]

      expect(board.card_visibility_bypass_role_ids).to eq([ role.id, other.id ].sort)
    end

    it "apagar o grupo tira da lista" do
      board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])

      role.destroy!

      expect(board.reload.card_visibility_bypass_role_ids).to be_empty
    end

    it "apagar o grupo avisa quem está no quadro" do
      board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])
      stream = ApplicationCable::Channel.organization_stream(organization.id, PipelineBoardChannel.board_stream(board.id))

      expect { role.destroy! }.to have_broadcasted_to(stream).with(event: "card_visibility_changed", data: { id: board.id })
    end

    it "não mexe nos quadros de outra organização" do
      other_board = create(:pipeline_board)
      other_role = create(:access_role, organization: other_board.organization)
      other_board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ other_role.id ])

      role.destroy!

      expect(other_board.reload.card_visibility_bypass_role_ids).to eq([ other_role.id ])
    end
  end

  describe "pontuação" do
    def build_board(**attributes)
      build(:pipeline_board, organization: organization, **attributes)
    end

    it "nasce em 30 e 70, sem campo" do
      board = create(:pipeline_board, organization: organization)

      expect(board).to have_attributes(lead_score_low: 30, lead_score_high: 70, lead_score_field_key: nil)
    end

    it "recusa negativo, acima de mil e fracionado" do
      expect(build_board(lead_score_low: -1)).not_to be_valid
      expect(build_board(lead_score_high: 1500)).not_to be_valid
      expect(build_board(lead_score_low: 30.5)).not_to be_valid
    end
  end

  describe "ordem" do
    it "a lista sai por posição e criação, nunca sorteada pelo UUID" do
      older = create(:pipeline_board, organization: organization, created_at: 2.days.ago)
      newer = create(:pipeline_board, organization: organization, created_at: 1.day.ago)
      first = create(:pipeline_board, organization: organization, position: -1)

      expect(organization.pipeline_boards.ordered).to eq([ first, older, newer ])
    end
  end

  describe "apagar a organização" do
    it "leva os quadros junto" do
      board = create(:pipeline_board, organization: organization)
      card = create(:pipeline_card, stage: create(:pipeline_stage, board: board))
      create(:pipeline_label, organization: organization)
      account = create(:account, organization: organization)
      card.update!(assigned_to: account)

      organization.destroy!

      expect(described_class.exists?(board.id)).to be(false)
      expect(Pipelines::Card.exists?(card.id)).to be(false)
      expect(Pipelines::Label.where(organization_id: organization.id)).to be_empty
    end
  end
end
