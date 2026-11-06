require 'rails_helper'

RSpec.describe Pipelines::CardQuery do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:board) { create(:pipeline_board, organization: organization, deal_rotting_days: 30) }
  let(:col_a) { create(:pipeline_stage, board: board) }
  let(:col_b) { create(:pipeline_stage, board: board) }

  before do
    Pipelines::CustomField.create!(board: board, name: 'Budget', field_type: 'number')
    Pipelines::CustomField.create!(board: board, name: 'Source', field_type: 'text')
    Pipelines::CustomField.create!(board: board, name: 'Signed', field_type: 'checkbox')
  end

  def result_ids(definition, current_account: nil)
    described_class.call(board: board, definition: definition, current_account: current_account).pluck(:id).sort
  end

  def definition(all: [], any: [])
    { 'version' => 1, 'all' => all, 'any' => any }
  end

  describe 'text operators' do
    let!(:acme) { create(:pipeline_card, stage: col_a, title: 'Acme Corp', company_name: 'Acme') }
    let!(:globex) { create(:pipeline_card, stage: col_a, title: 'Globex', company_name: '') }

    it 'eq' do
      expect(result_ids(definition(all: [ cond('title', 'eq', 'Acme Corp') ]))).to eq([ acme.id ])
    end

    it 'contains' do
      expect(result_ids(definition(all: [ cond('title', 'contains', 'cme') ]))).to eq([ acme.id ])
    end

    it 'starts_with' do
      expect(result_ids(definition(all: [ cond('title', 'starts_with', 'Glo') ]))).to eq([ globex.id ])
    end

    it 'not_starts_with' do
      expect(result_ids(definition(all: [ cond('title', 'not_starts_with', 'Glo') ]))).to eq([ acme.id ])
    end

    it 'is_empty (company_name)' do
      expect(result_ids(definition(all: [ cond('company_name', 'is_empty', nil) ]))).to eq([ globex.id ])
    end

    it 'is_not_empty (company_name)' do
      expect(result_ids(definition(all: [ cond('company_name', 'is_not_empty', nil) ]))).to eq([ acme.id ])
    end
  end

  describe 'number operators' do
    let!(:small) { create(:pipeline_card, stage: col_a, deal_value: 100) }
    let!(:big) { create(:pipeline_card, stage: col_a, deal_value: 5000) }

    it 'gt' do
      expect(result_ids(definition(all: [ cond('deal_value', 'gt', 1000) ]))).to eq([ big.id ])
    end

    it 'between' do
      expect(result_ids(definition(all: [ cond('deal_value', 'between', [ 50, 200 ]) ]))).to eq([ small.id ])
    end
  end

  describe 'date operators with relative tokens' do
    around { |ex| travel_to(Time.zone.local(2026, 7, 15, 12)) { ex.run } }

    let!(:recent) { create(:pipeline_card, stage: col_a, created_at: Time.zone.local(2026, 7, 14)) }
    # `col_a` é criada na primeira menção: fora do `around`, numa ordem que não importa aqui.
    let!(:old) { create(:pipeline_card, stage: col_a, created_at: Time.zone.local(2026, 1, 1)) }

    it 'within this_week' do
      value = { 'type' => 'relative', 'token' => 'this_week' }
      expect(result_ids(definition(all: [ cond('created_at', 'within', value) ]))).to eq([ recent.id ])
    end

    it 'before more_than_n_months_ago' do
      value = { 'type' => 'relative', 'token' => 'more_than_n_months_ago', 'n' => 3 }
      expect(result_ids(definition(all: [ cond('created_at', 'before', value) ]))).to eq([ old.id ])
    end
  end

  describe 'select operator (priority)' do
    let!(:high) { create(:pipeline_card, stage: col_a, priority: 'high') }
    let!(:low) { create(:pipeline_card, stage: col_a, priority: 'low') }

    it 'in' do
      expect(result_ids(definition(all: [ cond('priority', 'in', %w[high urgent]) ]))).to eq([ high.id ])
    end
  end

  describe 'user operator with me token' do
    let(:user) { create(:account, organization: organization) }
    let!(:mine) { create(:pipeline_card, stage: col_a, assigned_to: user) }
    let!(:other) { create(:pipeline_card, stage: col_a) }

    it 'eq with {type: me}' do
      value = { 'type' => 'me' }
      ids = result_ids(definition(all: [ cond('assigned_to_id', 'eq', value) ]), current_account: user)
      expect(ids).to eq([ mine.id ])
    end

    it 'raises when me token used without current_account' do
      value = { 'type' => 'me' }
      expect { result_ids(definition(all: [ cond('assigned_to_id', 'eq', value) ])) }
        .to raise_error(described_class::InvalidDefinitionError)
    end
  end

  describe 'tags (array)' do
    let!(:vip) { create(:pipeline_card, stage: col_a, tags: %w[vip hot]) }
    let!(:plain) { create(:pipeline_card, stage: col_a, tags: []) }

    it 'contains_any' do
      expect(result_ids(definition(all: [ cond('tags', 'contains_any', %w[vip]) ]))).to eq([ vip.id ])
    end

    it 'is_empty' do
      expect(result_ids(definition(all: [ cond('tags', 'is_empty', nil) ]))).to eq([ plain.id ])
    end
  end

  describe 'labels' do
    let(:label) { Pipelines::Label.create!(organization: organization, name: 'Priority', color: '#f00') }
    let!(:labeled) { create(:pipeline_card, stage: col_a) }
    let!(:unlabeled) { create(:pipeline_card, stage: col_a) }

    before { labeled.labels << label }

    it 'contains_any' do
      expect(result_ids(definition(all: [ cond('label_ids', 'contains_any', [ label.id ]) ]))).to eq([ labeled.id ])
    end

    it 'is_empty' do
      expect(result_ids(definition(all: [ cond('label_ids', 'is_empty', nil) ]))).to eq([ unlabeled.id ])
    end
  end

  describe 'custom fields (jsonb)' do
    let!(:matching) do
      create(:pipeline_card, stage: col_a,
                           custom_field_values: { 'budget' => '1500', 'source' => 'google', 'signed' => 'true' })
    end
    let!(:below) do
      create(:pipeline_card, stage: col_a,
                           custom_field_values: { 'budget' => '200', 'source' => 'organic', 'signed' => 'false' })
    end
    let!(:garbage) do
      create(:pipeline_card, stage: col_a, custom_field_values: { 'budget' => 'not-a-number' })
    end

    it 'custom number gt (garbage jsonb does not raise nor match)' do
      ids = result_ids(definition(all: [ cond('custom.budget', 'gt', 1000) ]))
      expect(ids).to eq([ matching.id ])
    end

    it 'custom text eq' do
      expect(result_ids(definition(all: [ cond('custom.source', 'eq', 'google') ]))).to eq([ matching.id ])
    end

    it 'custom checkbox eq true' do
      expect(result_ids(definition(all: [ cond('custom.signed', 'eq', true) ]))).to eq([ matching.id ])
    end

    describe 'is_empty / is_not_empty' do
      let!(:missing_key)  { create(:pipeline_card, stage: col_a, custom_field_values: {}) }
      let!(:json_null)    { create(:pipeline_card, stage: col_a, custom_field_values: { 'source' => nil }) }
      let!(:only_spaces)  { create(:pipeline_card, stage: col_a, custom_field_values: { 'source' => '   ' }) }
      let!(:empty_array)  { create(:pipeline_card, stage: col_a, custom_field_values: { 'source' => [] }) }
      let!(:empty_hash)   { create(:pipeline_card, stage: col_a, custom_field_values: { 'source' => {} }) }

      it 'trata chave ausente, JSON null, espaços, array e hash vazios como vazio' do
        ids = result_ids(definition(all: [ cond('custom.source', 'is_empty') ]))

        expect(ids).to include(missing_key.id, json_null.id, only_spaces.id, empty_array.id, empty_hash.id)
      end

      it 'não considera um valor preenchido como vazio' do
        ids = result_ids(definition(all: [ cond('custom.source', 'is_empty') ]))

        expect(ids).not_to include(matching.id, below.id)
      end

      it 'is_not_empty é o complemento exato' do
        ids = result_ids(definition(all: [ cond('custom.source', 'is_not_empty') ]))

        expect(ids).to contain_exactly(matching.id, below.id)
      end

      it 'não considera a string "0" como vazio' do
        zero = create(:pipeline_card, stage: col_a, custom_field_values: { 'budget' => '0' })

        expect(result_ids(definition(all: [ cond('custom.budget', 'is_empty') ]))).not_to include(zero.id)
      end

      it 'checkbox: is_empty casa com o nunca respondido, não com false' do
        never_answered = create(:pipeline_card, stage: col_a, custom_field_values: {})
        answered_false = create(:pipeline_card, stage: col_a, custom_field_values: { 'signed' => false })

        ids = result_ids(definition(all: [ cond('custom.signed', 'is_empty') ]))

        expect(ids).to include(never_answered.id)
        expect(ids).not_to include(answered_false.id)
      end

      it 'checkbox: eq false continua casando com o nunca respondido e com false' do
        never_answered = create(:pipeline_card, stage: col_a, custom_field_values: {})
        answered_false = create(:pipeline_card, stage: col_a, custom_field_values: { 'signed' => false })

        ids = result_ids(definition(all: [ cond('custom.signed', 'eq', false) ]))

        expect(ids).to include(never_answered.id, answered_false.id)
      end
    end
  end

  describe 'virtual fields' do
    around { |ex| travel_to(Time.zone.local(2026, 7, 15, 12)) { ex.run } }

    let!(:open_deal) { create(:pipeline_card, stage: col_a) }
    let!(:won_deal) { create(:pipeline_card, stage: col_a, won_at: Time.current) }
    let!(:lost_deal) { create(:pipeline_card, stage: col_a, lost_at: Time.current) }

    it 'deal_status open' do
      expect(result_ids(definition(all: [ cond('deal_status', 'eq', 'open') ]))).to eq([ open_deal.id ])
    end

    it 'deal_status won' do
      expect(result_ids(definition(all: [ cond('deal_status', 'eq', 'won') ]))).to eq([ won_deal.id ])
    end

    it 'is_rotting true (entered long ago)' do
      open_deal.update!(stage_entered_at: 60.days.ago)
      ids = result_ids(definition(all: [ cond('is_rotting', 'eq', true) ]))
      expect(ids).to eq([ open_deal.id ])
    end

    it 'in_first_stage true' do
      # acts_as_list gerencia position; fixamos explicitamente para determinismo.
      col_a.update_column(:position, 0)
      col_b.update_column(:position, 1)
      first = create(:pipeline_card, stage: col_a)
      last = create(:pipeline_card, stage: col_b)
      ids = result_ids(definition(all: [ cond('in_first_stage', 'eq', true) ]))
      expect(ids).to include(first.id)
      expect(ids).not_to include(last.id)
    end

    it 'assigned_to_deactivated true' do
      active_user = create(:account, organization: organization, role: 'member')
      revoked_user = create(:account, organization: organization, role: 'member')
      active_card = create(:pipeline_card, stage: col_a, assigned_to: active_user)
      deactivated_card = create(:pipeline_card, stage: col_a, assigned_to: revoked_user)
      revoked_user.revoke!

      ids = result_ids(definition(all: [ cond('assigned_to_deactivated', 'eq', true) ]))
      expect(ids).to include(deactivated_card.id)
      expect(ids).not_to include(active_card.id)
    end

    it 'stage_id' do
      other = create(:pipeline_card, stage: col_b)

      expect(result_ids(definition(all: [ cond('stage_id', 'eq', col_b.id) ]))).to eq([ other.id ])
      expect(result_ids(definition(all: [ cond('stage_id', 'in', [ col_b.id ]) ]))).to eq([ other.id ])
    end

    it 'stage_entered_at' do
      value = { 'type' => 'relative', 'token' => 'more_than_n_months_ago', 'n' => 3 }
      old = create(:pipeline_card, stage: col_a, stage_entered_at: 1.year.ago)

      expect(result_ids(definition(all: [ cond('stage_entered_at', 'before', value) ]))).to eq([ old.id ])
    end
  end

  describe 'virtual fields, negated' do
    let!(:open_deal) { create(:pipeline_card, stage: col_a) }
    let!(:won_deal) { create(:pipeline_card, stage: col_a, won_at: Time.current) }

    it 'deal_status ne' do
      expect(result_ids(definition(all: [ cond('deal_status', 'ne', 'won') ]))).to eq([ open_deal.id ])
    end

    it 'in_first_stage false' do
      later = create(:pipeline_card, stage: col_b)

      expect(result_ids(definition(all: [ cond('in_first_stage', 'eq', false) ]))).to eq([ later.id ])
    end
  end

  describe 'values that would break the SQL' do
    it 'rejects a number that is not a number' do
      expect { result_ids(definition(all: [ cond('deal_value', 'gt', 'abc') ])) }
        .to raise_error(described_class::InvalidDefinitionError)
    end

    it 'rejects a list where a single value goes' do
      expect { result_ids(definition(all: [ cond('deal_value', 'eq', [ 1, 2 ]) ])) }
        .to raise_error(described_class::InvalidDefinitionError)
    end

    it 'rejects ids that are not UUIDs in uuid columns' do
      [ '12', 'abc' ].each do |value|
        expect { result_ids(definition(all: [ cond('assigned_to_id', 'eq', value) ])) }
          .to raise_error(described_class::InvalidDefinitionError)
        expect { result_ids(definition(all: [ cond('stage_id', 'eq', value) ])) }
          .to raise_error(described_class::InvalidDefinitionError)
        expect { result_ids(definition(all: [ cond('label_ids', 'contains_any', [ value ]) ])) }
          .to raise_error(described_class::InvalidDefinitionError)
      end
    end

    it 'rejects an invalid date' do
      expect { result_ids(definition(all: [ cond('due_date', 'before', 'ontem') ])) }
        .to raise_error(described_class::InvalidDefinitionError)
    end

    it 'runs every operator against real SQL' do
      {
        'title' => %w[eq ne contains not_contains starts_with not_starts_with is_empty is_not_empty],
        'deal_value' => %w[eq ne gt gte lt lte is_empty is_not_empty],
        'priority' => %w[eq ne is_empty is_not_empty]
      }.each do |field, operators|
        operators.each do |operator|
          value = field == 'deal_value' ? 10 : 'high'
          expect { result_ids(definition(all: [ cond(field, operator, value) ])) }.not_to raise_error
        end
      end

      expect { result_ids(definition(all: [ cond('priority', 'in', [ 'high' ]) ])) }.not_to raise_error
      expect { result_ids(definition(all: [ cond('priority', 'nin', [ 'high' ]) ])) }.not_to raise_error
      expect { result_ids(definition(all: [ cond('deal_value', 'between', [ 1, 2 ]) ])) }.not_to raise_error
      expect { result_ids(definition(all: [ cond('tags', 'contains_all', [ 'x' ]) ])) }.not_to raise_error
      expect { result_ids(definition(all: [ cond('tags', 'not_contains', [ 'x' ]) ])) }.not_to raise_error
      expect { result_ids(definition(all: [ cond('due_date', 'eq', '2026-11-01') ])) }.not_to raise_error
      expect { result_ids(definition(all: [ cond('due_date', 'between', [ '2026-11-01', '2026-11-30' ]) ])) }.not_to raise_error
      expect { result_ids(definition(all: [ cond('due_date', 'not_within', { 'type' => 'relative', 'token' => 'this_month' }) ])) }.not_to raise_error
      expect { result_ids(definition(all: [ cond('expected_close_date', 'before', { 'type' => 'relative', 'token' => 'today' }) ])) }.not_to raise_error
    end
  end

  describe 'combining groups' do
    let!(:a) { create(:pipeline_card, stage: col_a, priority: 'high', deal_value: 5000) }
    let!(:b) { create(:pipeline_card, stage: col_a, priority: 'high', deal_value: 100) }
    let!(:c) { create(:pipeline_card, stage: col_a, priority: 'low', deal_value: 5000) }

    it 'all conditions are ANDed' do
      d = definition(all: [ cond('priority', 'eq', 'high'), cond('deal_value', 'gt', 1000) ])
      expect(result_ids(d)).to eq([ a.id ])
    end

    it 'any conditions are ORed' do
      d = definition(any: [ cond('priority', 'eq', 'low'), cond('deal_value', 'gt', 1000) ])
      expect(result_ids(d)).to eq([ a.id, c.id ].sort)
    end

    it 'all AND any combined' do
      d = definition(all: [ cond('priority', 'eq', 'high') ],
                     any: [ cond('deal_value', 'gt', 1000), cond('deal_value', 'lt', 200) ])
      expect(result_ids(d)).to eq([ a.id, b.id ].sort)
    end
  end

  describe 'base_scope isolation' do
    let(:other_board) { create(:pipeline_board, organization: organization) }
    let(:other_col) { create(:pipeline_stage, board: other_board) }
    let!(:mine) { create(:pipeline_card, stage: col_a, priority: 'high') }
    let!(:theirs) { create(:pipeline_card, stage: other_col, priority: 'high') }

    it 'never returns cards outside the board base_scope' do
      expect(result_ids(definition(all: [ cond('priority', 'eq', 'high') ]))).to eq([ mine.id ])
    end
  end

  describe 'validation and safety' do
    it 'raises InvalidDefinitionError for malformed definition' do
      expect { result_ids({ 'version' => 1, 'all' => [ { 'field' => 'nope', 'operator' => 'eq', 'value' => 1 } ] }) }
        .to raise_error(described_class::InvalidDefinitionError)
    end

    it 'rejects injection attempts in field name' do
      bad = definition(all: [ cond('title); DROP TABLE pipeline_cards;--', 'eq', 'x') ])
      expect { result_ids(bad) }.to raise_error(described_class::InvalidDefinitionError)
      expect(Pipelines::Card.table_exists?).to be(true)
    end

    it 'rejects unknown operator for field type' do
      expect { result_ids(definition(all: [ cond('deal_value', 'contains', 'x') ])) }
        .to raise_error(described_class::InvalidDefinitionError)
    end
  end

  def cond(field, operator, value = nil)
    { 'field' => field, 'operator' => operator, 'value' => value }
  end
end
