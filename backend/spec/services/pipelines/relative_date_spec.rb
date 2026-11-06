require 'rails_helper'

RSpec.describe Pipelines::RelativeDate do
  include ActiveSupport::Testing::TimeHelpers

  # 2026-07-15 é uma quarta-feira.
  let(:frozen) { Time.zone.local(2026, 7, 15, 12, 0, 0) }

  around do |example|
    travel_to(frozen) { example.run }
  end

  describe '.range' do
    it 'resolve today para o dia inteiro' do
      range = described_class.range('today')
      expect(range.begin).to eq(frozen.beginning_of_day)
      expect(range.end).to eq(frozen.end_of_day)
    end

    it 'resolve this_week de segunda a domingo' do
      range = described_class.range('this_week')
      expect(range.begin.to_date).to eq(Date.new(2026, 7, 13))
      expect(range.end.to_date).to eq(Date.new(2026, 7, 19))
    end

    it 'resolve last_week' do
      range = described_class.range('last_week')
      expect(range.begin.to_date).to eq(Date.new(2026, 7, 6))
      expect(range.end.to_date).to eq(Date.new(2026, 7, 12))
    end

    it 'resolve this_month' do
      range = described_class.range('this_month')
      expect(range.begin.to_date).to eq(Date.new(2026, 7, 1))
      expect(range.end.to_date).to eq(Date.new(2026, 7, 31))
    end

    it 'resolve this_year' do
      range = described_class.range('this_year')
      expect(range.begin.to_date).to eq(Date.new(2026, 1, 1))
      expect(range.end.to_date).to eq(Date.new(2026, 12, 31))
    end

    it 'resolve last_n_days parametrizado' do
      range = described_class.range('last_n_days', amount: 7)
      expect(range.begin.to_date).to eq(Date.new(2026, 7, 8))
      expect(range.end).to eq(frozen.end_of_day)
    end

    it 'levanta InvalidToken para token desconhecido' do
      expect { described_class.range('never') }.to raise_error(described_class::InvalidToken)
    end

    it 'levanta InvalidToken quando n ausente em token parametrizado' do
      expect { described_class.range('last_n_days') }.to raise_error(described_class::InvalidToken)
    end
  end

  describe '.point' do
    it 'resolve today como início do dia' do
      expect(described_class.point('today')).to eq(frozen.beginning_of_day)
    end

    it 'resolve more_than_n_months_ago' do
      expect(described_class.point('more_than_n_months_ago', amount: 3)).to eq(frozen - 3.months)
    end

    it 'levanta InvalidToken quando n inválido' do
      expect { described_class.point('more_than_n_months_ago', amount: 0) }
        .to raise_error(described_class::InvalidToken)
    end
  end

  describe 'predicados' do
    it 'classifica tokens de range' do
      expect(described_class.range_token?('this_week')).to be(true)
      expect(described_class.range_token?('more_than_n_months_ago')).to be(false)
    end

    it 'classifica tokens parametrizados' do
      expect(described_class.parameterized?('last_n_days')).to be(true)
      expect(described_class.parameterized?('today')).to be(false)
    end
  end
end
