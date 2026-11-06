# frozen_string_literal: true

require 'rails_helper'

RSpec.describe BrPhoneVariants do
  describe '.call' do
    # O caso que motivou o módulo: a Meta devolve `recipient_id` sem o 9º dígito.
    it 'generates the 12-digit form for a 13-digit mobile' do
      expect(described_class.call('5531971810932')).to include('5531971810932', '553171810932')
    end

    it 'generates the 13-digit form for a 12-digit mobile' do
      expect(described_class.call('553171810932')).to include('553171810932', '5531971810932')
    end

    it 'keeps the original form first' do
      expect(described_class.call('553171810932').first).to eq('553171810932')
    end

    it 'includes the JID form of every variant' do
      expect(described_class.call('553171810932')).to include(
        '553171810932@s.whatsapp.net',
        '5531971810932@s.whatsapp.net'
      )
    end

    it 'accepts a JID as input without dragging the domain digits in' do
      expect(described_class.call('5531971810932@s.whatsapp.net')).to include('5531971810932', '553171810932')
    end

    it 'strips punctuation' do
      expect(described_class.call('+55 (31) 97181-0932')).to include('5531971810932')
    end

    it 'does not add a 9th digit to a landline' do
      # 3131100074 → nacional '31100074' começa com 3, não é celular.
      expect(described_class.call('553131100074')).to eq(
        ['553131100074', '553131100074@s.whatsapp.net']
      )
    end

    it 'returns the number unchanged for non-BR input' do
      expect(described_class.call('14155552671')).to eq(
        ['14155552671', '14155552671@s.whatsapp.net']
      )
    end

    it 'returns an empty array for blank input' do
      expect(described_class.call(nil)).to eq([])
      expect(described_class.call('')).to eq([])
    end

    it 'does not mutate the argument' do
      number = +'+55 31 97181-0932'
      expect { described_class.call(number) }.not_to(change { number.dup })
    end

    it 'never returns duplicates' do
      variants = described_class.call('5531971810932')
      expect(variants).to eq(variants.uniq)
    end
  end
end
