require "rails_helper"

RSpec.describe PipelineBoardChannel, type: :channel do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stage) { create(:pipeline_stage, board: board) }

  def org_stream(name)
    ApplicationCable::Channel.organization_stream(organization.id, name)
  end

  describe "assinatura" do
    it "assina as streams do quadro e de todos os cards" do
      stub_connection current_account: owner

      subscribe(boardId: board.id)

      expect(subscription).to be_confirmed
      expect(subscription).to have_stream_from(org_stream(described_class.board_stream(board.id)))
      expect(subscription).to have_stream_from(org_stream(described_class.full_card_stream(board)))
    end

    it "recusa sem a permissão de pipelines" do
      stub_connection current_account: member_with(chat: "all")

      subscribe(boardId: board.id)

      expect(subscription).to be_rejected
    end

    it "recusa quadro de outra organização" do
      stub_connection current_account: owner

      subscribe(boardId: create(:pipeline_board).id)

      expect(subscription).to be_rejected
    end

    it "recusa id inválido" do
      stub_connection current_account: owner

      subscribe(boardId: "abc")

      expect(subscription).to be_rejected
    end

    context "em quadro restrito" do
      let(:role) { create(:access_role, organization: organization) }

      before { board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ]) }

      it "quem é de um grupo liberado assina todos os cards" do
        allowed = create(:account, organization: organization, role: "member", access_role: role)
        stub_connection current_account: allowed

        subscribe(boardId: board.id)

        expect(subscription).to have_stream_from(org_stream(described_class.full_card_stream(board)))
      end

      it "quem não é assina só os próprios" do
        member = pipelines_member
        stub_connection current_account: member

        subscribe(boardId: board.id)

        expect(subscription).to have_stream_from(org_stream(described_class.personal_card_stream(board.id, member.id)))
        expect(subscription).not_to have_stream_from(org_stream(described_class.full_card_stream(board)))
      end

      it "mudar a regra muda o nome da stream: quem ficou na antiga deixa de receber" do
        before_change = described_class.full_card_stream(board)

        other_role = create(:access_role, organization: organization)
        board.update!(card_visibility_bypass_role_ids: [ other_role.id ])

        expect(described_class.full_card_stream(board)).not_to eq(before_change)
      end
    end
  end

  describe "eventos" do
    let(:cards_stream) { org_stream(described_class.full_card_stream(board)) }
    let(:board_stream) { org_stream(described_class.board_stream(board.id)) }

    it "card criado, sem dado da conversa, porque vai para o quadro inteiro" do
      chat = create(:chat, organization: organization, user_name: "Fernanda Lima")

      expect { create(:pipeline_card, stage: stage, title: "Novo", chat_id: chat.id.to_s) }
        .to have_broadcasted_to(cards_stream).with { |payload|
          expect(payload["event"]).to eq("card_created")
          expect(payload["data"]).to include("title" => "Novo", "stageId" => stage.id, "hasChat" => true, "chatId" => chat.id.to_s)
          expect(payload["data"]).not_to have_key("chatSummary")
        }
    end

    it "card movido, com a etapa de origem, uma vez só" do
      card = create(:pipeline_card, stage: stage)
      target = create(:pipeline_stage, board: board)
      card

      expect { Pipelines::MoveCard.call(card: card, stage: target, position: 1) }
        .to have_broadcasted_to(cards_stream).exactly(:once).with { |payload|
          expect(payload["event"]).to eq("card_moved")
          expect(payload["data"]).to include("stageId" => target.id, "previousStageId" => stage.id, "position" => 1)
        }
    end

    it "card apagado" do
      card = create(:pipeline_card, stage: stage)

      expect { card.destroy! }.to have_broadcasted_to(cards_stream).with(event: "card_deleted", data: { id: card.id, stageId: stage.id })
    end

    it "etapa criada, alterada e apagada, na stream do quadro" do
      created = nil
      expect { created = create(:pipeline_stage, board: board, name: "Nova") }
        .to have_broadcasted_to(board_stream).with { |payload|
          expect(payload["event"]).to eq("stage_created")
          expect(payload["data"]).to include("name" => "Nova", "boardId" => board.id)
        }

      expect { created.update!(name: "Renomeada") }
        .to have_broadcasted_to(board_stream).with { |payload| expect(payload["event"]).to eq("stage_updated") }

      expect { created.destroy! }
        .to have_broadcasted_to(board_stream).with(event: "stage_deleted", data: { id: created.id })
    end

    it "mudança na regra de visibilidade" do
      role = create(:access_role, organization: organization)

      expect { board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ]) }
        .to have_broadcasted_to(board_stream).with(event: "card_visibility_changed", data: { id: board.id })
    end

    it "uma falha no Redis não impede a gravação" do
      allow(ActionCable.server).to receive(:broadcast).and_raise(Redis::CannotConnectError)

      expect { create(:pipeline_card, stage: stage) }.not_to raise_error
    end

    context "em quadro restrito" do
      let(:role) { create(:access_role, organization: organization) }
      let(:member) { pipelines_member }
      let(:personal) { org_stream(described_class.personal_card_stream(board.id, member.id)) }

      before { board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ]) }

      it "o responsável recebe o evento do próprio card" do
        expect { create(:pipeline_card, stage: stage, assigned_to: member) }
          .to have_broadcasted_to(personal).with { |payload| expect(payload["event"]).to eq("card_created") }
      end

      it "quem perde o card recebe como se ele tivesse sido apagado, e quem ganha, como criado" do
        card = create(:pipeline_card, stage: stage, assigned_to: member)
        other = pipelines_member
        other_stream = org_stream(described_class.personal_card_stream(board.id, other.id))

        expect { card.update!(assigned_to: other) }
          .to have_broadcasted_to(personal).with(event: "card_deleted", data: { id: card.id, stageId: stage.id })
          .and have_broadcasted_to(other_stream).at_least(:once).with(a_hash_including("event" => "card_created"))
      end

      it "não vaza card alheio para a stream pessoal" do
        expect { create(:pipeline_card, stage: stage) }.not_to have_broadcasted_to(personal)
      end
    end
  end
end
