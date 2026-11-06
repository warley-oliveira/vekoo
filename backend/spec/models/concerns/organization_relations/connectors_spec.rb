require "rails_helper"

# O que na origem era coluna do assistente e agora é configuração da organização.
RSpec.describe OrganizationRelations::Connectors do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }

  describe ".reopen_on_inbound_enabled?" do
    def with_flag(value)
      create(:organization, features: { "reopen_conversation_on_inbound_enabled" => value })
    end

    it "é falso sem tocar no banco quando o id está em branco" do
      expect(Organization).not_to receive(:where)

      expect(Organization.reopen_on_inbound_enabled?(nil)).to be(false)
    end

    it "é verdadeiro com o flag ligado em features" do
      expect(Organization.reopen_on_inbound_enabled?(with_flag(true).id)).to be(true)
    end

    it "é falso com o flag desligado" do
      expect(Organization.reopen_on_inbound_enabled?(with_flag(false).id)).to be(false)
    end

    it "é falso sem o flag" do
      expect(Organization.reopen_on_inbound_enabled?(organization.id)).to be(false)
    end

    it "é falso para organização que não existe" do
      expect(Organization.reopen_on_inbound_enabled?(SecureRandom.uuid)).to be(false)
    end

    # jsonb: o valor pode ter chegado como texto.
    it "lê texto como booleano" do
      expect(Organization.reopen_on_inbound_enabled?(with_flag("true").id)).to be(true)
      expect(Organization.reopen_on_inbound_enabled?(with_flag("false").id)).to be(false)
    end

    it "guarda em cache: mudar no banco só vale depois de apagar a chave" do
      flagged = with_flag(true)

      expect(Organization.reopen_on_inbound_enabled?(flagged.id)).to be(true)

      Organization.where(id: flagged.id).update_all(features: { "reopen_conversation_on_inbound_enabled" => false })
      expect(Organization.reopen_on_inbound_enabled?(flagged.id)).to be(true)

      Rails.cache.delete(Organization.reopen_on_inbound_cache_key(flagged.id))
      expect(Organization.reopen_on_inbound_enabled?(flagged.id)).to be(false)
    end

    it "o cache expira sozinho em 5 minutos" do
      flagged = with_flag(true)
      Organization.reopen_on_inbound_enabled?(flagged.id)
      Organization.where(id: flagged.id).update_all(features: {})

      travel(described_class::REOPEN_ON_INBOUND_CACHE_TTL + 1.second) do
        expect(Organization.reopen_on_inbound_enabled?(flagged.id)).to be(false)
      end
    end

    it "guarda em cache também o falso, para não consultar a cada mensagem" do
      expect(Organization).to receive(:where).once.and_call_original

      2.times { Organization.reopen_on_inbound_enabled?(organization.id) }
    end

    it "cada organização tem a própria chave" do
      flagged = with_flag(true)

      expect(Organization.reopen_on_inbound_enabled?(flagged.id)).to be(true)
      expect(Organization.reopen_on_inbound_enabled?(organization.id)).to be(false)
    end
  end

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
