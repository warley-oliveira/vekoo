require 'rails_helper'

RSpec.describe Pipelines::PresetFilters do
  let(:organization) { create(:organization) }
  let(:board) { create(:pipeline_board, organization: organization, deal_rotting_days: 30) }
  let(:user) { create(:account, organization: organization) }

  describe '.all' do
    it 'exposes presets across the quick and data_cleanup sections' do
      sections = described_class.all.map { |preset| preset[:section] }.uniq
      expect(sections).to contain_exactly('quick', 'data_cleanup')
    end
  end

  describe 'every preset definition is structurally valid' do
    described_class.all.each do |preset|
      it "validates '#{preset[:key]}'" do
        errors = Pipelines::FilterDefinition.validate(preset[:definition], board: board)
        expect(errors).to be_empty
      end
    end
  end

  describe 'every preset executes without SQL error' do
    before { create(:pipeline_stage, board: board) }

    described_class.all.each do |preset|
      it "executes '#{preset[:key]}'" do
        expect do
          Pipelines::CardQuery.call(board: board, definition: preset[:definition], current_account: user).to_a
        end.not_to raise_error
      end
    end
  end

  describe '.definition_for and .key?' do
    it 'returns the definition for a known key' do
      expect(described_class.definition_for('open_deals')).to include('version' => 1)
    end

    it 'recognises valid and invalid keys' do
      expect(described_class.key?('open_deals')).to be(true)
      expect(described_class.key?('bogus')).to be(false)
    end
  end
end
