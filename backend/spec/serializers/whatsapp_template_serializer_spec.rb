require "rails_helper"

RSpec.describe WhatsappTemplateSerializer do
  let(:connector) { create(:connector_whatsapp_cloud) }

  it "traz o modelo em camelCase, com as datas em milissegundos" do
    synced_at = Time.utc(2026, 7, 22, 10)
    template = create(
      :whatsapp_template,
      connector: connector,
      name: "lembrete",
      template_id: "meta-1",
      language: "pt_BR",
      category: "UTILITY",
      sub_category: "CUSTOM",
      previous_category: "MARKETING",
      correct_category: "UTILITY",
      rejected_reason: "NONE",
      quality_score: { "score" => "GREEN" },
      parameter_format: "POSITIONAL",
      message_send_ttl_seconds: 600,
      last_synced_at: synced_at
    )

    expect(described_class.one(template)).to include(
      id: template.id.to_s,
      connectorId: connector.id.to_s,
      templateId: "meta-1",
      name: "lembrete",
      language: "pt_BR",
      category: "UTILITY",
      subCategory: "CUSTOM",
      previousCategory: "MARKETING",
      correctCategory: "UTILITY",
      rejectedReason: "NONE",
      qualityScore: { "score" => "GREEN" },
      parameterFormat: "POSITIONAL",
      messageSendTtlSeconds: 600,
      status: "approved",
      removed: false,
      removedAt: nil,
      lastSyncedAt: synced_at.to_i * 1000,
      createdAt: (template.created_at.to_f * 1000).round,
      updatedAt: (template.updated_at.to_f * 1000).round
    )
  end

  it "manda os componentes como a Meta devolve, sem mexer nas chaves" do
    components = [ { "type" => "BODY", "text" => "Olá {{1}}", "example" => { "body_text" => [ [ "Ana" ] ] } } ]
    template = create(:whatsapp_template, connector: connector, components: components)

    expect(described_class.one(template)[:components]).to eq(components)
  end

  it "avisa o removido, com a data" do
    template = create(:whatsapp_template, connector: connector)
    template.mark_as_removed!

    serialized = described_class.one(template.reload)

    expect(serialized).to include(status: "removed", removed: true)
    expect(serialized[:removedAt]).to be_a(Integer)
  end

  describe "cabeçalho" do
    it "assume texto quando não há cabeçalho" do
      template = create(:whatsapp_template, connector: connector)

      expect(described_class.one(template)).to include(headerFormat: "TEXT", hasMediaHeader: false, hasLocationHeader: false)
    end

    it "avisa o cabeçalho de mídia" do
      template = create(:whatsapp_template, connector: connector, components: [ { "type" => "HEADER", "format" => "IMAGE" } ])

      expect(described_class.one(template)).to include(headerFormat: "IMAGE", hasMediaHeader: true, hasLocationHeader: false)
    end

    it "avisa o cabeçalho de localização" do
      template = create(:whatsapp_template, connector: connector, components: [ { "type" => "HEADER", "format" => "LOCATION" } ])

      expect(described_class.one(template)).to include(headerFormat: "LOCATION", hasMediaHeader: false, hasLocationHeader: true)
    end

    it "traz a origem pública da mídia, guardada fora dos componentes" do
      template = create(
        :whatsapp_template,
        connector: connector,
        components: [ { "type" => "HEADER", "format" => "IMAGE", "example" => { "header_url" => [ "https://cdn.exemplo.com/a.jpg" ] } } ]
      )

      expect(described_class.one(template)).to include(headerMediaUrl: "https://cdn.exemplo.com/a.jpg")
    end
  end

  describe "parâmetros" do
    it "avisa quando o texto tem variável" do
      template = create(:whatsapp_template, connector: connector, components: [ { "type" => "BODY", "text" => "Olá {{1}}" } ])

      expect(described_class.one(template)[:hasParameters]).to be(true)
    end

    it "avisa quando não tem" do
      template = create(:whatsapp_template, connector: connector, components: [ { "type" => "BODY", "text" => "Olá" } ])

      expect(described_class.one(template)[:hasParameters]).to be(false)
    end
  end

  describe "botões" do
    it "traz os botões do componente" do
      buttons = [ { "type" => "QUICK_REPLY", "text" => "Sim" } ]
      template = create(:whatsapp_template, connector: connector, components: [ { "type" => "BUTTONS", "buttons" => buttons } ])

      expect(described_class.one(template)[:buttons]).to eq(buttons)
    end

    it "traz lista vazia sem botões" do
      template = create(:whatsapp_template, connector: connector)

      expect(described_class.one(template)[:buttons]).to eq([])
    end
  end

  it "serializa a lista" do
    templates = [ create(:whatsapp_template, connector: connector, name: "a"), create(:whatsapp_template, connector: connector, name: "b") ]

    expect(described_class.many(templates).map { |template| template[:name] }).to eq(%w[a b])
  end
end
