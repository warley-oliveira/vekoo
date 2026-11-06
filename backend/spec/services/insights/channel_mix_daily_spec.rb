require "rails_helper"

RSpec.describe Insights::ChannelMixDaily do
  subject(:service) { described_class.new(organization_id: organization.id, range: range) }

  let(:organization) { create(:organization) }
  let(:zone) { ActiveSupport::TimeZone["America/Sao_Paulo"] }
  let(:day) { zone.today }
  let(:range) { day_range(day, zone) }

  def add_chat(audience_type:, created_at: range.first + 10.hours, target: organization)
    create(:chat, organization: target, audience_type: audience_type, created_at: created_at)
  end

  describe "#to_h" do
    it "agrupa as conversas do dia por audience_type" do
      add_chat(audience_type: "whatsapp_api")
      add_chat(audience_type: "whatsapp_api")
      add_chat(audience_type: "instagram")

      expect(service.to_h).to eq("whatsapp_api" => 2, "instagram" => 1)
    end

    it "ignora conversas de outra organização" do
      add_chat(audience_type: "whatsapp_api")
      add_chat(audience_type: "instagram", target: create(:organization))

      expect(service.to_h).to eq("whatsapp_api" => 1)
    end

    it "ignora conversas fora do dia" do
      add_chat(audience_type: "whatsapp_api")
      add_chat(audience_type: "instagram", created_at: range.first - 1.hour)
      add_chat(audience_type: "web", created_at: range.last)

      expect(service.to_h).to eq("whatsapp_api" => 1)
    end

    it "agrupa audience_type ausente como unknown" do
      add_chat(audience_type: nil)

      expect(service.to_h).to eq("unknown" => 1)
    end

    it "deixa de fora a conversa de teste" do
      create(:chat, organization: organization, external_id: Chat::TEST_EXTERNAL_ID, created_at: range.first + 1.hour)

      expect(service.to_h).to eq({})
    end

    it "devolve hash vazio quando não há conversas" do
      expect(service.to_h).to eq({})
    end
  end

  describe "#total" do
    it "soma todos os canais" do
      add_chat(audience_type: "whatsapp_api")
      add_chat(audience_type: "instagram")

      expect(service.total).to eq(2)
    end

    it "devolve zero sem conversas" do
      expect(service.total).to eq(0)
    end
  end
end
