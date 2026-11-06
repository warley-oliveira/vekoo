require "rails_helper"

RSpec.describe Pipelines::BoardTemplate, type: :model do
  let(:expected_keys) { %w[vendas suporte lead_scoring onboarding] }

  describe ".seed_defaults!" do
    it "cria todos os modelos" do
      described_class.seed_defaults!

      expect(described_class.pluck(:template_key)).to match_array(expected_keys)
    end

    it "é idempotente" do
      described_class.seed_defaults!

      expect { described_class.seed_defaults! }.not_to(change(described_class, :count))
    end

    it "o de pontuação tem o campo numérico" do
      described_class.seed_defaults!

      field = described_class.find_by!(template_key: "lead_scoring").custom_fields_config.find { |item| item["name"] == "Lead Score" }

      expect(field).to include("field_type" => "number", "default_value" => "0")
    end

    it "todo modelo tem etapas, com nome e posição" do
      described_class.seed_defaults!

      expected_keys.each do |key|
        stages = described_class.find_by!(template_key: key).stages_config

        expect(stages).not_to be_empty
        expect(stages).to all(include("name" => be_present, "position" => be_a(Integer)))
      end
    end

    it "vendas e pontuação são quadros de negócio; suporte e onboarding, não" do
      described_class.seed_defaults!

      expect(described_class.find_by!(template_key: "vendas").default_board_type).to eq("crm")
      expect(described_class.find_by!(template_key: "lead_scoring").default_board_type).to eq("crm")
      expect(described_class.find_by!(template_key: "suporte").default_board_type).to eq("standard")
      expect(described_class.find_by!(template_key: "onboarding").default_board_type).to eq("standard")
    end

    it "os gatilhos dos modelos passam na validação de um quadro de verdade" do
      described_class.seed_defaults!

      expected_keys.each do |key|
        board = Pipelines::BoardFactory.create_from_template(template_key: key, organization: create(:organization))

        expect(board).to be_persisted
      end
    end
  end

  describe ".ensure_defaults!" do
    it "cria só quando falta, sem depender da semente, que em produção não roda" do
      expect { described_class.ensure_defaults! }.to change(described_class, :count).by(4)

      expect(described_class).not_to receive(:seed_defaults!)
      described_class.ensure_defaults!
    end
  end
end
