require "rails_helper"

RSpec.describe Pipelines::Card, type: :model do
  let(:organization) { create(:organization) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stage) { create(:pipeline_stage, board: board) }

  it "herda a organização da etapa" do
    expect(create(:pipeline_card, stage: stage).organization_id).to eq(organization.id)
  end

  it "recusa uma etapa de outra organização se a organização veio escrita" do
    card = build(:pipeline_card, stage: stage, organization: create(:organization))

    expect(card).not_to be_valid
    expect(card.errors[:stage_id]).to be_present
  end

  it "ao nascer, entra na etapa agora" do
    expect(create(:pipeline_card, stage: stage).stage_entered_at).to be_within(1.minute).of(Time.current)
  end

  it "ao mudar de etapa por qualquer caminho, a data de entrada muda" do
    card = create(:pipeline_card, stage: stage, stage_entered_at: 5.days.ago)

    card.update!(stage: create(:pipeline_stage, board: board))

    expect(card.stage_entered_at).to be_within(1.minute).of(Time.current)
  end

  it "editar não muda a data de entrada" do
    entered = 5.days.ago
    card = create(:pipeline_card, stage: stage, stage_entered_at: entered)

    card.update!(title: "Outro")

    expect(card.reload.stage_entered_at).to be_within(1.second).of(entered)
  end

  describe "isRotting" do
    it "esfria depois dos dias do quadro, se o negócio segue aberto" do
      board.update!(deal_rotting_days: 3)

      expect(create(:pipeline_card, stage: stage, stage_entered_at: 4.days.ago)).to be_rotting
      expect(create(:pipeline_card, stage: stage, stage_entered_at: 2.days.ago)).not_to be_rotting
      expect(create(:pipeline_card, stage: stage, stage_entered_at: 4.days.ago, won_at: Time.current)).not_to be_rotting
    end

    it "sem a opção no quadro, nunca" do
      board.update!(deal_rotting_days: nil)

      expect(create(:pipeline_card, stage: stage, stage_entered_at: 400.days.ago)).not_to be_rotting
    end
  end

  describe "conversa" do
    it "busca sempre pela organização, nunca só pelo id" do
      foreign = create(:chat)
      card = create(:pipeline_card, stage: stage, chat_id: foreign.id.to_s)

      expect(card.chat).to be_nil
    end

    it "acha a da organização, e relê se o id mudar" do
      first = create(:chat, organization: organization)
      second = create(:chat, organization: organization)
      card = create(:pipeline_card, stage: stage, chat_id: first.id.to_s)

      expect(card.chat).to eq(first)

      card.chat_id = second.id.to_s
      expect(card.chat).to eq(second)
    end

    it "um id que não é BSON não levanta" do
      expect(create(:pipeline_card, stage: stage, chat_id: "conv-1").chat).to be_nil
    end
  end

  describe "etiquetas de ganho e perdido na conversa" do
    let(:chat) { create(:chat, organization: organization) }
    let(:card) { create(:pipeline_card, stage: stage, chat_id: chat.id.to_s) }

    def tag_names
      ChatTag.where(:_id.in => chat.reload.chat_tag_ids).pluck(:name)
    end

    it "ganho" do
      card.mark_won!

      expect(tag_names).to eq([ "ganho" ])
    end

    it "perdido" do
      card.mark_lost!("sem orçamento")

      expect(tag_names).to eq([ "perdido" ])
    end

    it "troca, de perdido para ganho" do
      card.mark_lost!
      card.mark_won!

      expect(tag_names).to eq([ "ganho" ])
    end

    it "reabrir tira" do
      card.mark_won!
      card.reopen_deal!

      expect(tag_names).to be_empty
    end

    it "editar não mexe" do
      card
      expect_any_instance_of(Chat).not_to receive(:sync_system_tags!)

      card.update!(title: "Outro título")
    end

    it "card sem conversa não procura nada" do
      other = create(:pipeline_card, stage: stage)
      expect(Chat).not_to receive(:scoped)

      other.mark_won!
    end

    it "conversa apagada não atrapalha" do
      card.update_columns(chat_id: BSON::ObjectId.new.to_s)

      expect { card.reload.mark_won! }.not_to raise_error
      expect(card.reload.won_at).to be_present
    end

    it "falha na etiqueta não desfaz o ganho" do
      card
      allow_any_instance_of(Chat).to receive(:sync_system_tags!).and_raise(StandardError, "mongo fora")

      expect { card.mark_won! }.not_to raise_error
      expect(card.reload.won_at).to be_present
    end

    it "só etiqueta depois do commit: um rollback não deixa rastro na conversa" do
      card

      begin
        described_class.transaction do
          card.mark_won!
          raise ActiveRecord::Rollback
        end
      rescue ActiveRecord::Rollback
        nil
      end

      expect(tag_names).to be_empty
    end

    it "a conversa apagada solta os cards" do
      card

      chat.destroy

      expect(card.reload.chat_id).to be_nil
    end

    it "`chat.pipeline_cards` só traz os da organização" do
      card
      foreign_board = create(:pipeline_board)
      create(:pipeline_card, stage: create(:pipeline_stage, board: foreign_board), chat_id: chat.id.to_s)

      expect(chat.pipeline_cards).to eq([ card ])
    end
  end

  describe "contexto do gatilho" do
    let!(:card) { create(:pipeline_card, stage: stage) }
    let!(:updated) { create(:pipeline_trigger, board: board, event_type: "card_updated") }

    it "mudar só de posição não é card atualizado" do
      create(:pipeline_card, stage: stage)

      expect { card.insert_at(2) }.not_to have_enqueued_job(Pipelines::TriggerJob)
    end

    it "um save sem nenhuma mudança também não" do
      expect { card.save! }.not_to have_enqueued_job(Pipelines::TriggerJob)
    end

    it "com `suppress_trigger_evaluation`, nada" do
      card.suppress_trigger_evaluation = true

      expect { card.update!(title: "Outro") }.not_to have_enqueued_job(Pipelines::TriggerJob)
    end
  end

  describe "listas" do
    it "criar na mesma etapa numera em sequência, e apagar fecha o buraco" do
      first = create(:pipeline_card, stage: stage)
      second = create(:pipeline_card, stage: stage)
      third = create(:pipeline_card, stage: stage)

      expect([ first, second, third ].map(&:position)).to eq([ 1, 2, 3 ])

      second.destroy!

      expect(third.reload.position).to eq(2)
    end

    it "apagar a etapa não reposiciona card a card" do
      create_list(:pipeline_card, 3, stage: stage)
      expect_any_instance_of(described_class).not_to receive(:decrement_positions_on_lower_items)

      stage.destroy!
    end
  end

  describe "tetos" do
    it "recusa etiquetas demais e etiqueta longa demais" do
      expect(build(:pipeline_card, stage: stage, tags: Array.new(described_class::MAX_TAGS + 1, "x"))).not_to be_valid
      expect(build(:pipeline_card, stage: stage, tags: [ "x" * (described_class::MAX_TAG_LENGTH + 1) ])).not_to be_valid
    end

    it "recusa campos e descrição grandes demais" do
      expect(build(:pipeline_card, stage: stage, custom_field_values: { "a" => "x" * 70.kilobytes })).not_to be_valid
      expect(build(:pipeline_card, stage: stage, description_json: { "a" => "x" * 300.kilobytes })).not_to be_valid
    end
  end

  describe "#checklist_progress" do
    it "conta os itens de todos os checklists" do
      card = create(:pipeline_card, stage: stage)
      first = create(:pipeline_checklist, card: card)
      second = create(:pipeline_checklist, card: card)
      create(:pipeline_checklist_item, checklist: first, completed: true)
      create(:pipeline_checklist_item, checklist: second)

      expect(card.checklist_progress).to eq(completed: 1, total: 2)
    end
  end

  describe "#sync_labels!" do
    it "ignora id inválido e de outra organização" do
      card = create(:pipeline_card, stage: stage)
      label = create(:pipeline_label, organization: organization)

      card.sync_labels!([ label.id, "abc", create(:pipeline_label).id ])

      expect(card.labels.reload).to eq([ label ])
    end
  end
end
