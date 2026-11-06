# frozen_string_literal: true

require "rails_helper"

RSpec.describe CustomAttributes::NormalizationService do
  subject(:service) { described_class.new(definition) }

  let(:organization) { create(:organization) }
  let(:other_organization) { create(:organization) }
  let(:definition) { create(:custom_field, name: "Volume Medio", organization_id: organization.id) }

  before do
    2.times { create(:chat, organization: organization, custom_attributes: { "volume_medio" => "20 a 40/dia" }) }
    create(:chat, organization: organization, custom_attributes: { "volume_medio" => "50" })
    create(:chat, organization: organization, custom_attributes: { "volume_medio" => { "raw" => 1 } })
    # outra organização com o mesmo valor: nunca pode ser tocada
    create(:chat, organization: other_organization, custom_attributes: { "volume_medio" => "20 a 40/dia" })
  end

  def chats_with(value, org = organization, field: "volume_medio")
    Chat.where(organization_id: org.id, "custom_attributes.#{field}" => value)
  end

  describe "#distinct_values" do
    it "lista valores distintos da organização com contagem, marcando não-escalares" do
      result = service.distinct_values

      values = result[:values].to_h { |v| [ v[:value], [ v[:count], v[:editable] ] ] }
      expect(values["20 a 40/dia"]).to eq([ 2, true ])
      expect(values["50"]).to eq([ 1, true ])
      expect(values[{ "raw" => 1 }]).to eq([ 1, false ])
      expect(result[:truncated]).to be(false)
    end

    it "avisa quando corta a lista" do
      stub_const("#{described_class}::MAX_DISTINCT_VALUES", 1)

      result = service.distinct_values

      expect(result[:values].size).to eq(1)
      expect(result[:truncated]).to be(true)
    end
  end

  describe "#normalize" do
    let(:mapping) { { "20 a 40/dia" => "20" } }

    it "em dry_run retorna a prévia sem mudar nada" do
      result = service.normalize(mapping: mapping, dry_run: true)

      expect(result).to eq(dryRun: true, targetKey: nil, changes: [ { from: "20 a 40/dia", to: "20", count: 2 } ])
      expect(chats_with("20 a 40/dia").count).to eq(2)
    end

    it "aplica o mapeamento só na organização do campo" do
      service.normalize(mapping: mapping, dry_run: false)

      expect(chats_with("20").count).to eq(2)
      expect(chats_with("20 a 40/dia", other_organization).count).to eq(1)
    end

    it "grava a auditoria em normalization_history" do
      described_class.new(definition, account_id: "pessoa-7").normalize(mapping: mapping, dry_run: false)

      history = definition.reload.normalization_history
      expect(history.size).to eq(1)
      expect(history.first["mapping"]).to eq(mapping)
      expect(history.first["account_id"]).to eq("pessoa-7")
    end

    it "não deixa a auditoria crescer sem teto" do
      stub_const("CustomField::MAX_NORMALIZATION_HISTORY", 2)

      3.times { |n| service.normalize(mapping: { "nada-#{n}" => "x" }, dry_run: false) }

      history = definition.reload.normalization_history
      expect(history.map { |entry| entry["mapping"].keys.first }).to eq(%w[nada-1 nada-2])
    end

    it "converte o tipo quando pedido" do
      service.normalize(mapping: mapping, convert_to_number: true, dry_run: false)

      expect(definition.reload.value_type).to eq("number")
    end

    it "não converte o tipo por padrão" do
      service.normalize(mapping: mapping, dry_run: false)

      expect(definition.reload.value_type).to eq("text")
    end

    it "grava em outro campo preservando o original quando target_key é informado" do
      service.normalize(mapping: mapping, dry_run: false, convert_to_number: true, target_key: "volume_medio_normalizado")

      expect(chats_with("20", field: "volume_medio_normalizado").count).to eq(2)
      expect(chats_with("20 a 40/dia").count).to eq(2)
      # convert_to_number não se aplica ao campo original quando há target_key
      expect(definition.reload.value_type).to eq("text")
      expect(definition.normalization_history.first["target_key"]).to eq("volume_medio_normalizado")
    end

    it "restringe leitura e escrita ao recorte de created_at" do
      old_chat = create(:chat, organization: organization, custom_attributes: { "volume_medio" => "20 a 40/dia" })
      old_chat.set(created_at: 2.years.ago)
      range = { start: 1.year.ago, end: Time.current }

      listed = service.distinct_values(date_range: range)
      result = service.normalize(mapping: mapping, dry_run: false, date_range: range)

      counts = listed[:values].to_h { |v| [ v[:value], v[:count] ] }
      expect(counts["20 a 40/dia"]).to eq(2)
      expect(result[:changes]).to eq([ { from: "20 a 40/dia", to: "20", count: 2 } ])
      expect(old_chat.reload.custom_attributes["volume_medio"]).to eq("20 a 40/dia")
    end
  end
end
