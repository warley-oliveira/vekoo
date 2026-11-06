require 'rails_helper'

RSpec.describe Pipelines::BoardFactory do
  let(:organization) { create(:organization) }

  before { Pipelines::BoardTemplate.seed_defaults! }

  describe '.create_from_template' do
    context 'with lead_scoring template' do
      subject(:board) do
        described_class.create_from_template(template_key: 'lead_scoring', organization: organization)
      end

      it 'creates the Lead Score number custom field' do
        score = board.custom_fields.find_by(key: 'lead_score')
        expect(score).to be_present
        expect(score.field_type).to eq('number')
      end

      it 'configures lead_score thresholds and field_key' do
        expect(board.lead_score_field_key).to eq('lead_score')
        expect(board.lead_score_low).to eq(30)
        expect(board.lead_score_high).to eq(70)
      end

      it 'creates the 4 stage columns' do
        expect(board.stages.map(&:name))
          .to contain_exactly('Novos contatos', 'Qualificação', 'Proposta', 'Fechamento')
      end

      it 'defaults board_type to crm (from template default)' do
        expect(board.board_type).to eq('crm')
      end
    end

    context 'with vendas template (regression)' do
      it 'does not set lead_score_field_key' do
        board = described_class.create_from_template(template_key: 'vendas', organization: organization)
        expect(board.lead_score_field_key).to be_nil
      end

      it 'defaults board_type to crm (from template default)' do
        board = described_class.create_from_template(template_key: 'vendas', organization: organization)
        expect(board.board_type).to eq('crm')
      end
    end

    context 'with non-CRM template (suporte)' do
      it 'defaults board_type to standard' do
        board = described_class.create_from_template(template_key: 'suporte', organization: organization)
        expect(board.board_type).to eq('standard')
      end
    end

    context 'board_type override' do
      it 'respects board_type argument over template default' do
        board = described_class.create_from_template(
          template_key: 'lead_scoring', organization: organization, board_type: 'standard',
        )
        expect(board.board_type).to eq('standard')
      end

      it 'ignores blank board_type and falls back to template default' do
        board = described_class.create_from_template(
          template_key: 'lead_scoring', organization: organization, board_type: '',
        )
        expect(board.board_type).to eq('crm')
      end
    end
  end
end
