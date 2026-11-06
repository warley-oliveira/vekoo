require "rails_helper"

RSpec.describe ConnectorSerializer do
  let(:organization) { create(:organization) }
  let(:secret_keys) { /token|secret|api_?key|ciphertext|password/i }

  def deep_keys(value)
    case value
    when Hash then value.keys.map(&:to_s) + value.values.flat_map { |inner| deep_keys(inner) }
    when Array then value.flat_map { |inner| deep_keys(inner) }
    else []
    end
  end

  describe ".one" do
    it "traz os campos comuns a todo conector" do
      connector = create(:connector_web_widget, organization: organization, bot_display_name: "Ana", send_collaborator_name: true)

      expect(described_class.one(connector)).to include(
        id: connector.id.to_s,
        type: "web_widget",
        name: "Ana",
        status: "active",
        active: true,
        sendCollaboratorName: true,
        createdAt: (connector.created_at.to_f * 1000).round
      )
    end

    it "diz que o conector pausado não está ativo" do
      connector = create(:connector_web_widget, organization: organization, status: :paused)

      expect(described_class.one(connector)).to include(status: "paused", active: false)
    end

    it "serializa o WhatsApp Cloud" do
      connector = create(
        :connector_whatsapp_cloud,
        organization: organization,
        phone_number_id: 123,
        waba_id: 456,
        business_id: 789,
        verified_name: "Clínica Vida",
        display_phone_number: "+55 31 3333-0000",
        quality_rating: "GREEN",
        fb_status: "CONNECTED",
        error_message: "Falhou",
        phone_number_details: { "123" => { "about" => "Oi" } },
        phone_number_list: [ { "id" => "123" } ]
      )

      expect(described_class.one(connector)).to include(
        type: "whatsapp_cloud",
        name: "Clínica Vida",
        profileName: "Clínica Vida",
        phoneNumberId: "123",
        wabaId: "456",
        businessId: "789",
        displayPhoneNumber: "+55 31 3333-0000",
        qualityRating: "GREEN",
        fbStatus: "CONNECTED",
        errorMessage: "Falhou",
        phoneNumberDetails: { "123" => { "about" => "Oi" } },
        phoneNumberList: [ { "id" => "123" } ]
      )
    end

    it "manda os números e os detalhes em camelCase, mantendo o id de cada número como chave" do
      connector = create(
        :connector_whatsapp_cloud,
        organization: organization,
        phone_number_details: { "123" => { "about" => "Oi", "profile_picture_url" => "https://cdn.exemplo.com/a.jpg" } },
        phone_number_list: [ { "id" => "123", "display_phone_number" => "+55 31 3333-0000", "is_pin_enabled" => true } ]
      )

      [ connector, connector.reload ].each do |record|
        serialized = described_class.one(record)

        expect(serialized[:phoneNumberDetails]).to eq("123" => { "about" => "Oi", "profilePictureUrl" => "https://cdn.exemplo.com/a.jpg" })
        expect(serialized[:phoneNumberList]).to eq([ { "id" => "123", "displayPhoneNumber" => "+55 31 3333-0000", "isPinEnabled" => true } ])
      end
    end

    it "manda os ids numéricos da Meta como texto, porque passam do inteiro seguro do JavaScript" do
      connector = create(:connector_whatsapp_cloud, organization: organization, phone_number_id: 9_007_199_254_740_993, waba_id: 9_007_199_254_740_995)

      expect(described_class.one(connector)).to include(phoneNumberId: "9007199254740993", wabaId: "9007199254740995")
    end

    it "serializa o WhatsApp Web" do
      connector = create(:connector_whatsapp_web, organization: organization, profile_name: "Loja da Ana", profile_picture_url: "https://cdn.exemplo.com/a.jpg", number_id: "5531971810932")

      expect(described_class.one(connector)).to include(
        type: "whatsapp_web",
        name: "Loja da Ana",
        providerApi: "evolution_api",
        profileName: "Loja da Ana",
        profilePictureUrl: "https://cdn.exemplo.com/a.jpg",
        numberId: "5531971810932",
        numberFormatted: "(31) 97181-0932",
        reactionsSupported: true,
        deleteForEveryoneSupported: false
      )
    end

    it "diz o que cada provider do WhatsApp Web suporta" do
      connector = create(:connector_whatsapp_web, :zapi, organization: organization)

      expect(described_class.one(connector)).to include(providerApi: "zapi", reactionsSupported: false, deleteForEveryoneSupported: true)
    end

    it "serializa a Z-API" do
      connector = create(:connector_zapi, organization: organization, instance_id: "ZINST", profile_name: "Padaria", profile_picture_url: "https://cdn.exemplo.com/p.jpg", phone_number: "5531971810932")

      expect(described_class.one(connector)).to include(
        type: "zapi",
        name: "Padaria",
        instanceId: "ZINST",
        profileName: "Padaria",
        profilePictureUrl: "https://cdn.exemplo.com/p.jpg",
        numberFormatted: "+55 (31) 97181-0932"
      )
    end

    it "serializa o Instagram" do
      connector = create(
        :connector_instagram,
        organization: organization,
        instagram_account_id: "1784",
        instagram_username: "lojadaana",
        account_name: "Loja da Ana",
        profile_picture_url: "https://cdn.exemplo.com/a.jpg",
        biography: "Roupas",
        followers_count: 10,
        follows_count: 20,
        media_count: 30,
        website: "https://loja.com",
        account_type: "BUSINESS",
        linked_messenger_connector_id: "abc",
        error_message: "Falhou"
      )

      expect(described_class.one(connector)).to include(
        type: "instagram_direct",
        name: "@lojadaana",
        profileName: "lojadaana",
        accountName: "Loja da Ana",
        instagramAccountId: "1784",
        instagramUsername: "lojadaana",
        biography: "Roupas",
        followersCount: 10,
        followsCount: 20,
        mediaCount: 30,
        website: "https://loja.com",
        accountType: "BUSINESS",
        authProvider: "instagram_login",
        linkedMessengerConnectorId: "abc",
        errorMessage: "Falhou"
      )
    end

    it "serializa o Messenger" do
      connector = create(:connector_messenger, organization: organization, page_id: "9900", page_name: "Loja da Ana", page_url: "https://facebook.com/loja", linked_instagram_connector_id: "abc")

      expect(described_class.one(connector)).to include(
        type: "facebook_messenger",
        name: "Loja da Ana",
        profileName: "Loja da Ana",
        pageId: "9900",
        pageUrl: "https://facebook.com/loja",
        linkedInstagramConnectorId: "abc"
      )
    end

    it "serializa a LeadChat" do
      connector = create(:connector_lead_chat, organization: organization, phone_number_id: 5531)

      expect(described_class.one(connector)).to include(type: "lead_chat", name: "LeadChat 5531", phoneNumberId: "5531")
    end

    it "serializa o widget só com o que é seguro de mostrar" do
      connector = create(:connector_web_widget, organization: organization, allowed_origins: [ "https://loja.com" ])

      serialized = described_class.one(connector)

      expect(serialized).to include(
        type: "web_widget",
        botDisplayName: "Atendimento",
        primaryColor: "#5B93FF",
        position: "bottom-right",
        allowedOrigins: [ "https://loja.com" ],
        locale: "pt-BR"
      )
      expect(serialized.keys).not_to include(:publicToken, :installSnippet, :rateLimitPerMin)
    end

    it "não traz credencial em tipo nenhum" do
      [
        create(:connector_whatsapp_cloud, organization: organization, user_access_token: "SEGREDO"),
        create(:connector_whatsapp_web, organization: organization, instance_api_key: "SEGREDO", zapi_token: "SEGREDO"),
        create(:connector_zapi, organization: organization, account_token: "SEGREDO"),
        create(:connector_instagram, organization: organization, page_access_token: "SEGREDO"),
        create(:connector_messenger, organization: organization, instagram_user_access_token: "SEGREDO"),
        create(:connector_lead_chat, organization: organization, access_token: "SEGREDO"),
        create(:connector_web_widget, organization: organization, signing_secret: "SEGREDO")
      ].each do |connector|
        serialized = described_class.one(connector)

        expect(serialized.to_json).not_to include("SEGREDO", "chave-evolution", "ig-token", "token-da-meta", "ZTOKEN", "page-token", "lead-token")
        expect(deep_keys(serialized).grep(secret_keys)).to eq([])
      end
    end
  end

  describe ".many" do
    it "serializa a lista" do
      connectors = [ create(:connector_web_widget, organization: organization), create(:connector_zapi, organization: organization) ]

      expect(described_class.many(connectors).map { |connector| connector[:type] }).to eq(%w[web_widget zapi])
    end
  end

  describe ".created" do
    it "traz o que a pessoa cola no painel da Meta no WhatsApp Cloud" do
      connector = create(:connector_whatsapp_cloud, organization: organization)

      expect(described_class.created(connector)).to include(
        webhookUrl: "#{Media::Storage.backend_url}/inbound/whatsapp-cloud/#{connector.id}",
        verificationToken: connector.verification_token
      )
    end

    it "traz o webhook de mensagens da Meta no Instagram e no Messenger" do
      [ create(:connector_instagram, organization: organization), create(:connector_messenger, organization: organization) ].each do |connector|
        expect(described_class.created(connector)).to include(
          webhookUrl: "#{Media::Storage.backend_url}/inbound/meta-messaging",
          verificationToken: connector.verification_token
        )
      end
    end

    it "traz o webhook da LeadChat" do
      connector = create(:connector_lead_chat, organization: organization)

      expect(described_class.created(connector)).to include(
        webhookUrl: "#{Media::Storage.backend_url}/inbound/lead-chat/#{connector.id}/event",
        verificationToken: connector.verification_token
      )
    end

    it "não traz nada a mais nos canais em que a configuração é automática" do
      [ create(:connector_whatsapp_web, organization: organization), create(:connector_zapi, organization: organization), create(:connector_web_widget, organization: organization) ].each do |connector|
        expect(described_class.created(connector).keys).not_to include(:webhookUrl, :verificationToken)
      end
    end

    it "é a única saída com o token de verificação: a listagem é lida por qualquer conta" do
      connector = create(:connector_whatsapp_cloud, organization: organization)

      expect(described_class.one(connector)).not_to have_key(:verificationToken)
    end

    it "não traz credencial do provedor" do
      connector = create(:connector_whatsapp_cloud, organization: organization, access_token: "SEGREDO")

      expect(described_class.created(connector).to_json).not_to include("SEGREDO")
    end
  end
end
