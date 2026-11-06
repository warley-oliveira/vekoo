require "rails_helper"

RSpec.describe Pipelines::Trigger, type: :model do
  let(:board) { create(:pipeline_board) }

  def build_trigger(actions:, event_type: "card_moved", target: board, **attributes)
    described_class.new(board: target, name: "T", event_type: event_type, actions: actions, **attributes)
  end

  describe "ações" do
    it "vale com uma ação conhecida" do
      trigger = build_trigger(actions: [ { "type" => "notify", "message" => "oi" } ])

      expect(trigger).to be_valid
    end

    it "vale com várias, de tipos diferentes" do
      trigger = build_trigger(actions: [
        { "type" => "notify", "message" => "oi" },
        { "type" => "move_card", "stage_id" => SecureRandom.uuid },
        { "type" => "fire_webhook", "url" => "https://x.test" },
        { "type" => "run_code", "code" => "return 1;" }
      ])

      expect(trigger).to be_valid
    end

    it "aceita chave símbolo" do
      expect(build_trigger(actions: [ { type: "notify", message: "oi" } ])).to be_valid
    end

    it "recusa lista vazia e nula" do
      expect(build_trigger(actions: [])).not_to be_valid
      expect(build_trigger(actions: nil)).not_to be_valid
    end

    it "recusa ação sem tipo, com tipo desconhecido e que não é objeto" do
      [ { "message" => "oi" }, { "type" => "chamar_assistente" }, "notify" ].each do |action|
        trigger = build_trigger(actions: [ action ])

        expect(trigger).not_to be_valid
        expect(trigger.errors[:actions]).to be_present
      end
    end

    it "recusa ações demais" do
      expect(build_trigger(actions: Array.new(described_class::MAX_ACTIONS + 1) { { "type" => "notify" } })).not_to be_valid
    end

    it "`run_code` exige o código, dentro do teto" do
      expect(build_trigger(actions: [ { "type" => "run_code" } ])).not_to be_valid
      expect(build_trigger(actions: [ { "type" => "run_code", "code" => "x" * (described_class::MAX_CODE_LENGTH + 1) } ])).not_to be_valid
    end

    it "`runs_code?`" do
      expect(build_trigger(actions: [ { "type" => "run_code", "code" => "x" } ])).to be_runs_code
      expect(build_trigger(actions: [ { "type" => "notify" } ])).not_to be_runs_code
    end
  end

  describe "eventos de negócio" do
    it "não valem em quadro comum" do
      trigger = build_trigger(actions: [ { "type" => "notify" } ], event_type: "deal_won")

      expect(trigger).not_to be_valid
      expect(trigger.errors[:event_type]).to be_present
    end

    it "valem em quadro de negócios" do
      board.update!(board_type: "crm")

      expect(build_trigger(actions: [ { "type" => "notify" } ], event_type: "deal_won")).to be_valid
    end
  end

  it "recusa etapa de outro quadro" do
    trigger = build_trigger(actions: [ { "type" => "notify" } ], stage: create(:pipeline_stage))

    expect(trigger).not_to be_valid
    expect(trigger.errors[:stage_id]).to be_present
  end

  describe "#conditions_met?" do
    def condition(value)
      build_trigger(actions: [ { "type" => "notify" } ], conditions: value)
    end

    it "sem condição, sempre" do
      expect(condition({}).conditions_met?(priority: "low")).to be(true)
    end

    it "por igualdade, em texto ou símbolo" do
      trigger = condition({ "priority" => "high" })

      expect(trigger.conditions_met?(priority: "high")).to be(true)
      expect(trigger.conditions_met?("priority" => "high")).to be(true)
      expect(trigger.conditions_met?(priority: "low")).to be(false)
    end

    it "todas precisam bater" do
      trigger = condition({ "priority" => "high", "to_stage_name" => "Proposta" })

      expect(trigger.conditions_met?(priority: "high", to_stage_name: "Proposta")).to be(true)
      expect(trigger.conditions_met?(priority: "high", to_stage_name: "Outra")).to be(false)
    end

    {
      [ "equals", "a", "a" ] => true,
      [ "not_equals", "a", "b" ] => true,
      [ "contains", "Atacado", "CADO" ] => true,
      [ "not_contains", "Atacado", "varejo" ] => true,
      [ "greater_than", "10", "5" ] => true,
      [ "less_than", "10", "5" ] => false
    }.each do |(operator, actual, value), expected|
      it "operador #{operator}" do
        trigger = condition({ "field" => { "operator" => operator, "value" => value } })

        expect(trigger.conditions_met?(field: actual)).to be(expected)
      end
    end

    it "`is_empty` e `is_not_empty`" do
      expect(condition({ "field" => { "operator" => "is_empty" } }).conditions_met?({})).to be(true)
      expect(condition({ "field" => { "operator" => "is_not_empty" } }).conditions_met?(field: "x")).to be(true)
    end

    it "operador desconhecido compara por igualdade" do
      expect(condition({ "field" => { "operator" => "xyz", "value" => "a" } }).conditions_met?(field: "a")).to be(true)
    end
  end

  describe "alerta de falha" do
    let(:stage) { create(:pipeline_stage, board: board) }
    let(:card) { create(:pipeline_card, stage: stage) }

    def active_alerts(trigger)
      board.organization.organization_alerts.active.for_origin(described_class::ALERT_ORIGIN, trigger.id)
    end

    it "apagar o gatilho resolve o alerta, que nenhuma execução boa resolveria depois" do
      trigger = create(:pipeline_trigger, board: board)
      trigger.raise_failure_alert!(card)

      expect { trigger.destroy! }.to change { active_alerts(trigger).count }.from(1).to(0)
    end

    it "apagar a etapa do gatilho também resolve" do
      trigger = create(:pipeline_trigger, board: board, stage: stage)
      trigger.raise_failure_alert!(card)

      expect { stage.destroy! }.to change { active_alerts(trigger).count }.from(1).to(0)
    end

    it "apagar o quadro também resolve" do
      trigger = create(:pipeline_trigger, board: board)
      trigger.raise_failure_alert!(card)

      expect { board.destroy! }.to change { active_alerts(trigger).count }.from(1).to(0)
    end

    it "um erro ao resolver não impede de apagar" do
      trigger = create(:pipeline_trigger, board: board)
      allow(OrganizationAlert).to receive(:resolve!).and_raise(StandardError, "fora do ar")

      expect { trigger.destroy! }.not_to raise_error
      expect(described_class.exists?(trigger.id)).to be(false)
    end
  end

  describe "#next_round_robin_index" do
    it "anda sem ler antes de escrever, e duas chamadas iguais não saem do cache de consultas" do
      trigger = create(:pipeline_trigger, board: board)

      indexes = ActiveRecord::Base.cache { Array.new(3) { trigger.next_round_robin_index } }

      expect(indexes).to eq([ 0, 1, 2 ])
    end
  end
end
