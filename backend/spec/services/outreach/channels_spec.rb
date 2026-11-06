require "rails_helper"

RSpec.describe Outreach::Channels do
  let(:organization) { create(:organization) }

  describe "modo texto" do
    let(:active) { create(:connector_whatsapp_web, organization: organization) }
    let(:closed) { create(:connector_whatsapp_web, organization: organization, status: :closed) }
    let(:campaign) { create(:outreach_campaign, organization: organization, connector_ids: [ active.id.to_s, closed.id.to_s ]) }

    it "separa quem pode enviar de quem está desconectado" do
      result = described_class.for(campaign)

      expect(result.active.map(&:connector)).to eq([ active ])
      expect(result.disconnected).to eq([ closed ])
    end

    it "cada conector é um canal" do
      expect(described_class.for(campaign).active.first.key).to eq("#{active.id}:")
    end
  end

  describe "modo modelo" do
    let(:waba) { create(:connector_whatsapp_cloud, organization: organization, phone_number_id: 111, phone_number_list: [ { "id" => "222" } ]) }
    let(:template) { create(:whatsapp_template, connector: waba) }
    let(:campaign) do
      create(:outreach_campaign, organization: organization, campaign_mode_cd: "template", messages: [], waba_connector_id: waba.id.to_s, phone_number_ids: %w[111 222], template_ids: [ template.id.to_s ])
    end

    it "cada número é um canal" do
      expect(described_class.for(campaign).active.map(&:key)).to eq([ "#{waba.id}:111", "#{waba.id}:222" ])
    end

    it "conta desconectada não tem canal nenhum" do
      waba.set(status_cd: "closed")

      result = described_class.for(campaign)

      expect(result.active).to eq([])
      expect(result.disconnected).to eq([ waba ])
    end

    it "conta apagada não tem canal nenhum" do
      campaign
      waba.delete

      expect(described_class.for(campaign)).to have_attributes(active: [], disconnected: [])
    end

    # O limite é do número: o mesmo número no modo texto não pode ter uma segunda conta.
    it "texto pela conta oficial divide o canal com o modelo do número principal" do
      text_campaign = create(:outreach_campaign, organization: organization, connector_ids: [ waba.id.to_s ])

      expect(described_class.for(text_campaign).active.first.key).to eq(described_class.for(campaign).active.first.key)
    end
  end
end
