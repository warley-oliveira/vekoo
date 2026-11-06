require "rails_helper"

# O que na origem era coluna do assistente e agora é configuração da organização.
RSpec.describe OrganizationRelations::Connectors do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }

  describe "#connectors, #chats e #chat_tags" do
    it "só traz o que é da organização" do
      own_connector = create(:connector_whatsapp_web, organization: organization)
      own_chat = create(:chat, connector: own_connector)
      own_tag = create(:chat_tag, organization_id: organization.id)

      other = create(:organization)
      create(:chat, connector: create(:connector_whatsapp_web, organization: other))
      create(:chat_tag, organization_id: other.id)

      expect(organization.connectors.to_a).to eq([ own_connector ])
      expect(organization.chats.to_a).to eq([ own_chat ])
      expect(organization.chat_tags.to_a).to eq([ own_tag ])
    end
  end

  describe "configuração da automação em settings" do
    it "tem os padrões da origem" do
      expect(organization).to have_attributes(
        automation_enabled?: true,
        default_automation_enabled: true,
        automation_pause_period: "disabled",
        automation_pause_time_to: 1,
        auto_clear_context_enabled: false,
        auto_clear_context_interval: 48
      )
    end

    it "lê o que está gravado" do
      organization.update!(
        settings: {
          "automation_enabled" => false,
          "default_automation_enabled" => false,
          "automation_pause_period" => "hours",
          "automation_pause_time_to" => 4,
          "auto_clear_context_enabled" => true,
          "auto_clear_context_interval" => 12
        }
      )

      expect(organization.reload).to have_attributes(
        automation_enabled?: false,
        default_automation_enabled: false,
        automation_pause_period: "hours",
        automation_pause_time_to: 4,
        auto_clear_context_enabled: true,
        auto_clear_context_interval: 12
      )
    end

    it "lê texto vindo de formulário" do
      organization.update!(settings: { "automation_enabled" => "false", "automation_pause_time_to" => "3", "auto_clear_context_interval" => "6" })

      expect(organization).to have_attributes(automation_enabled?: false, automation_pause_time_to: 3, auto_clear_context_interval: 6)
    end

    it "valor em branco cai no padrão" do
      organization.update!(settings: { "automation_pause_period" => "", "automation_pause_time_to" => "", "auto_clear_context_interval" => "" })

      expect(organization).to have_attributes(automation_pause_period: "disabled", automation_pause_time_to: 1, auto_clear_context_interval: 48)
    end
  end
end
