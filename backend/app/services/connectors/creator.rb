module Connectors
  # Cria e conecta um canal, conforme o tipo. As cotas por plano da origem saíram: planos
  # e pacotes estão fora do escopo.
  class Creator
    TYPES = %w[whatsapp_cloud whatsapp_web zapi lead_chat meta_channels instagram_direct web_widget].freeze

    # `connector` é o criado (mesmo quando a ativação no provedor falhou: ele fica `failed`
    # com o motivo, para a pessoa ver). `instagram` só existe em `meta_channels`.
    Result = Struct.new(:connector, :instagram, keyword_init: true)

    class UnknownType < StandardError; end

    def self.call(organization:, params:)
      new(organization, params).call
    end

    def initialize(organization, params)
      @organization = organization
      @params = params
    end

    def call
      case params[:connector_type]
      when "whatsapp_cloud" then whatsapp_cloud
      when "whatsapp_web" then whatsapp_web
      when "zapi" then zapi
      when "lead_chat" then lead_chat
      when "meta_channels" then meta_channels
      when "instagram_direct" then instagram_direct
      when "web_widget" then web_widget
      else raise UnknownType, params[:connector_type].to_s
      end
    end

    private

    attr_reader :organization, :params

    def base_attributes
      { organization_id: organization.id }
    end

    def whatsapp_cloud
      connector = Connector::WhatsappCloud.create!(
        **base_attributes,
        phone_number_id: params[:phone_number_id],
        business_id: params[:business_id],
        waba_id: params[:waba_id],
        access_token: params[:access_token]
      )
      connector.activate(params[:code])
      Result.new(connector: connector)
    end

    def whatsapp_web
      connector = Connector::WhatsappWeb.create!(
        **base_attributes,
        **provider_attributes,
        phone_number_pairing: params[:phone_number_pairing]
      )
      connector.activate
      Result.new(connector: connector)
    end

    # O plano padrão ("aiva_api" na tela de escolha da origem) roda hoje sobre a Evolution.
    # Sem provider explícito vale o padrão do modelo, ou a flag `zapi` da organização.
    def provider_attributes
      provider = params[:provider_api].presence
      return {} unless provider

      { provider_api: provider == "aiva_api" ? "evolution_api" : provider }
    end

    def zapi
      connector = Connector::Zapi.create!(
        **base_attributes,
        instance_id: params[:instance_id],
        token: params[:token],
        account_token: params[:account_token]
      )
      connector.activate
      Result.new(connector: connector)
    end

    def lead_chat
      connector = Connector::LeadChat.create!(
        **base_attributes,
        phone_number_id: params[:phone_number_id],
        access_token: params[:access_token]
      )
      connector.activate
      Result.new(connector: connector)
    end

    # Facebook Login cria o Messenger e, se a página tiver conta profissional ligada, também
    # o Instagram Direct.
    def meta_channels
      messenger = Connector::FacebookMessenger.create!(**base_attributes)
      messenger.activate(params[:code])

      Result.new(connector: messenger, instagram: linked_instagram(messenger))
    end

    def linked_instagram(messenger)
      return nil unless messenger.active? && messenger.page_id.present?

      account_id = messenger.fetch_instagram_account_for_page(messenger.page_id, messenger.page_access_token)
      return nil unless account_id

      instagram = Connector::InstagramDirect.create!(**base_attributes, linked_messenger_connector_id: messenger.id.to_s)
      instagram.activate_via_facebook(fb_page_id: messenger.page_id, fb_page_token: messenger.page_access_token)
      messenger.update(linked_instagram_connector_id: instagram.id.to_s)

      instagram.active? ? instagram : nil
    end

    def instagram_direct
      connector = Connector::InstagramDirect.create!(**base_attributes)
      connector.activate_via_instagram(code: params[:code], redirect_uri: params[:redirect_uri])
      Result.new(connector: connector)
    end

    # Nasce desligado: a pessoa personaliza e liga em `PATCH /connectors/:id/widget`.
    def web_widget
      Result.new(connector: Connector::WebWidget.create!(**base_attributes))
    end
  end
end
