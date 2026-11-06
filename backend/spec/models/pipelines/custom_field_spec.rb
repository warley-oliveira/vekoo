require "rails_helper"

RSpec.describe Pipelines::CustomField, type: :model do
  let(:organization) { create(:organization) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stage) { create(:pipeline_stage, board: board) }

  def build_field(**attributes)
    described_class.new({ board: board, name: "X", field_type: "text" }.merge(attributes))
  end

  describe "escopo" do
    it "nasce no quadro" do
      field = build_field.tap(&:save!)

      expect(field.scope).to eq("board")
      expect(field).to be_board_scope
    end

    it "aceita a etapa, com o id dela" do
      field = build_field(scope: "stage", stage_id: stage.id).tap(&:save!)

      expect(field).to be_stage_scope
    end

    it "recusa etapa sem id" do
      field = build_field(scope: "stage")

      expect(field).not_to be_valid
      expect(field.errors[:stage_id]).to be_present
    end

    it "recusa quadro com id de etapa" do
      field = build_field(scope: "board", stage_id: stage.id)

      expect(field).not_to be_valid
      expect(field.errors[:stage_id]).to be_present
    end

    it "recusa etapa de outro quadro" do
      other = create(:pipeline_stage, board: create(:pipeline_board, organization: organization))
      field = build_field(scope: "stage", stage_id: other.id)

      expect(field).not_to be_valid
      expect(field.errors[:stage_id]).to be_present
    end

    it "recusa escopo desconhecido, em vez de levantar" do
      field = build_field(scope: "column")

      expect(field).not_to be_valid
      expect(field.errors[:scope]).to be_present
    end
  end

  describe "chave" do
    it "sai do nome, sem acento e sem separador" do
      expect(build_field(name: "Forma de Pagamento à vista").tap(&:save!).key).to eq("forma_de_pagamento_a_vista")
    end

    it "não muda ao renomear" do
      field = build_field(name: "Origem").tap(&:save!)

      field.update!(name: "Canal de origem")

      expect(field.reload.key).to eq("origem")
    end

    it "sempre casa com o formato que o SQL dos filtros aceita" do
      [ "Preço (R$)", "日本語", "!!!", "A-B C_D" ].each do |name|
        field = build_field(name: name).tap(&:save!)

        expect(field.key).to match(Pipelines::CardQuery::CUSTOM_KEY_FORMAT), "falhou com #{name}"
      end
    end

    it "é única no quadro" do
      build_field(name: "Origem").save!

      field = build_field(name: "ORIGEM")

      expect(field).not_to be_valid
      expect(field.errors[:key]).to be_present
    end

    it "pode repetir em outro quadro" do
      build_field(name: "Origem").save!

      expect(build_field(name: "Origem", board: create(:pipeline_board, organization: organization))).to be_valid
    end
  end

  describe "transmissão" do
    let(:stream) { ApplicationCable::Channel.organization_stream(organization.id, PipelineBoardChannel.board_stream(board.id)) }
    let(:changed) { { event: "custom_fields_changed", data: { boardId: board.id } } }

    it "ao criar, alterar e apagar" do
      field = nil
      expect { field = build_field.tap(&:save!) }.to have_broadcasted_to(stream).with(changed)
      expect { field.update!(name: "Y") }.to have_broadcasted_to(stream).with(changed)
      expect { field.destroy! }.to have_broadcasted_to(stream).with(changed)
    end
  end
end
