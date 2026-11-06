require 'rails_helper'

RSpec.describe Pipelines::DealCloseGate do
  let(:organization) { create(:organization) }
  let(:board) do
    Pipelines::Board.create!(organization: organization, name: 'Funnel',
                        board_type: 'crm', deal_close_behavior: 'manual',
                        require_fields_on_deal_won: true,
                        require_fields_on_deal_lost: true)
  end
  let(:column)       { Pipelines::Stage.create!(board: board, name: 'Negociação', position: 1) }
  let(:other_column) { Pipelines::Stage.create!(board: board, name: 'Proposta', position: 2) }
  let(:card)         { column.cards.create!(title: 'Negócio X') }

  def board_field(name, required: true, field_type: 'text')
    Pipelines::CustomField.create!(
      board: board, name: name, field_type: field_type, position: 1,
      scope: 'board', required: required
    )
  end

  def column_field(name, on_stage: column, required: true, field_type: 'text')
    Pipelines::CustomField.create!(
      board: board, name: name, field_type: field_type, position: 1,
      scope: 'stage', stage_id: on_stage.id, required: required
    )
  end

  describe 'opt-in por board' do
    before { board_field('Origem') }

    it 'permite quando o board não exige nada ao ganhar' do
      board.update!(require_fields_on_deal_won: false)
      expect(described_class.new(card, :won).call).to be_allowed
    end

    it 'permite quando o board não exige nada ao perder' do
      board.update!(require_fields_on_deal_lost: false)
      expect(described_class.new(card, :lost).call).to be_allowed
    end

    it 'trata ganho e perdido de forma independente' do
      board.update!(require_fields_on_deal_won: true, require_fields_on_deal_lost: false)

      expect(described_class.new(card, :won).call).not_to be_allowed
      expect(described_class.new(card, :lost).call).to be_allowed
    end

    it 'rejeita um outcome desconhecido' do
      expect { described_class.new(card, :archived) }.to raise_error(ArgumentError)
    end
  end

  describe 'conjunto de campos exigidos' do
    it 'bloqueia por campo board-scoped obrigatório em branco' do
      board_field('Origem')

      result = described_class.new(card, :won).call

      expect(result).not_to be_allowed
      expect(result.pending_fields).to eq([ 'Origem' ])
      expect(result.pending_field_keys).to eq([ 'origem' ])
    end

    it 'bloqueia por campo column-scoped obrigatório da coluna atual' do
      column_field('Proposta enviada')

      expect(described_class.new(card, :won).call.pending_fields).to eq([ 'Proposta enviada' ])
    end

    it 'ignora campo column-scoped obrigatório de outra coluna' do
      column_field('Campo de outra etapa', on_stage: other_column)

      expect(described_class.new(card, :won).call).to be_allowed
    end

    it 'ignora campo não marcado como obrigatório' do
      board_field('Observações', required: false)

      expect(described_class.new(card, :won).call).to be_allowed
    end

    it 'permite quando todos os obrigatórios estão preenchidos' do
      defn = board_field('Origem')
      card.update!(custom_field_values: { defn.key => 'indicação' })

      expect(described_class.new(card, :won).call).to be_allowed
    end

    it 'acumula todos os campos pendentes' do
      board_field('Origem')
      column_field('Proposta enviada')

      expect(described_class.new(card, :won).call.pending_fields)
        .to contain_exactly('Origem', 'Proposta enviada')
    end
  end

  describe 'semântica de "em branco"' do
    let!(:defn) { board_field('Origem') }

    it 'considera string só com espaços como em branco' do
      card.update!(custom_field_values: { defn.key => '   ' })

      expect(described_class.new(card, :won).call).not_to be_allowed
    end

    it 'considera array vazio como em branco' do
      card.update!(custom_field_values: { defn.key => [] })

      expect(described_class.new(card, :won).call).not_to be_allowed
    end

    it 'considera hash vazio como em branco' do
      card.update!(custom_field_values: { defn.key => {} })

      expect(described_class.new(card, :won).call).not_to be_allowed
    end

    it 'considera false como preenchido' do
      card.update!(custom_field_values: { defn.key => false })

      expect(described_class.new(card, :won).call).to be_allowed
    end

    it 'considera 0 como preenchido' do
      card.update!(custom_field_values: { defn.key => 0 })

      expect(described_class.new(card, :won).call).to be_allowed
    end
  end
end
