require "rails_helper"

RSpec.describe Pipelines::Stage, type: :model do
  let(:organization) { create(:organization) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stage) { create(:pipeline_stage, board: board, name: "Qualificação") }

  def stage_field(name, on_stage: stage, **attributes)
    create(:pipeline_custom_field, board: board, name: name, field_type: attributes.delete(:field_type) || "text",
      scope: "stage", stage: on_stage, **attributes)
  end

  describe "#incomplete_required_field_values_for" do
    let(:card) { create(:pipeline_card, stage: stage) }

    it "nada, sem campo obrigatório" do
      expect(stage.incomplete_required_field_values_for(card)).to eq([])
    end

    it "nada, se o campo existe mas não é obrigatório para sair" do
      stage_field("Notas", required_to_leave_stage: false)

      expect(stage.incomplete_required_field_values_for(card)).to eq([])
    end

    it "traz o nome do campo sem valor" do
      stage_field("BANT Budget", required_to_leave_stage: true)

      expect(stage.incomplete_required_field_values_for(card)).to eq([ "BANT Budget" ])
    end

    it "texto só com espaços é vazio" do
      field = stage_field("BANT Budget", required_to_leave_stage: true)
      card.update!(custom_field_values: { field.key => "   " })

      expect(stage.incomplete_required_field_values_for(card)).to eq([ "BANT Budget" ])
    end

    it "zero e false são respostas" do
      score = stage_field("Score", field_type: "number", required_to_leave_stage: true)
      budget = stage_field("Tem orçamento?", field_type: "checkbox", required_to_leave_stage: true)
      card.update!(custom_field_values: { score.key => 0, budget.key => false })

      expect(stage.incomplete_required_field_values_for(card)).to eq([])
    end

    it "campo do quadro não conta, mesmo marcado" do
      create(:pipeline_custom_field, board: board, name: "Origem", required_to_leave_stage: true)

      expect(stage.incomplete_required_field_values_for(card)).to eq([])
    end

    it "campo de outra etapa não conta" do
      stage_field("De outra", on_stage: create(:pipeline_stage, board: board), required_to_leave_stage: true)

      expect(stage.incomplete_required_field_values_for(card)).to eq([])
    end
  end

  describe "checklist obrigatório" do
    let(:card) { create(:pipeline_card, stage: stage) }
    let!(:required) { create(:pipeline_stage_checklist_item, stage: stage, title: "Confirmar CNPJ") }
    let!(:optional) { create(:pipeline_stage_checklist_item, stage: stage, title: "Opcional", required: false) }

    it "incompleto enquanto falta o obrigatório" do
      expect(stage.checklist_complete_for?(card)).to be(false)
      expect(stage.incomplete_required_items_for(card)).to eq([ "Confirmar CNPJ" ])
    end

    it "completo sem o opcional" do
      card.stage_checks.create!(checklist_item: required, completed: true)

      expect(stage.checklist_complete_for?(card)).to be(true)
      expect(stage.incomplete_required_items_for(card)).to eq([])
    end

    it "desmarcar volta a travar" do
      check = card.stage_checks.create!(checklist_item: required, completed: true)
      check.toggle!

      expect(stage.checklist_complete_for?(card)).to be(false)
    end

    it "etapa sem checklist está sempre completa" do
      empty = create(:pipeline_stage, board: board)

      expect(empty.checklist_complete_for?(card)).to be(true)
    end
  end

  describe "campos ao apagar a etapa" do
    it "leva os da etapa" do
      field = stage_field("BANT")

      expect { stage.destroy! }.to change { Pipelines::CustomField.exists?(field.id) }.from(true).to(false)
    end

    it "preserva os do quadro" do
      field = create(:pipeline_custom_field, board: board, name: "Origem")

      expect { stage.destroy! }.not_to(change { Pipelines::CustomField.exists?(field.id) })
    end
  end

  describe "limite de cards" do
    it "conta só os não arquivados" do
      stage.update!(wip_limit: 1)
      create(:pipeline_card, stage: stage, archived: true)
      expect(stage).not_to be_wip_limit_reached

      create(:pipeline_card, stage: stage)
      expect(stage).to be_wip_limit_reached
    end
  end
end
