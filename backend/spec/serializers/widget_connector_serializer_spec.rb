require "rails_helper"

RSpec.describe WidgetConnectorSerializer do
  let(:connector) { create(:connector_web_widget) }

  describe ".appearance" do
    it "traz o que o widget precisa para se desenhar" do
      connector.update!(
        primary_color: "#FF00AA",
        position: "bottom-left",
        welcome_message: "Oi!",
        bot_avatar_url: "https://cdn.exemplo.com/a.jpg",
        bot_display_name: "Ana",
        launcher_icon: "balao",
        locale: "en",
        pre_chat_fields: "name",
        auto_page_context: false,
        proactive_enabled: false,
        launcher_image_url: "https://cdn.exemplo.com/b.jpg",
        launcher_size: 72,
        header_bg_color: "#000000",
        header_text_color: "#FFFFFF",
        user_bubble_color: "#111111",
        user_bubble_text_color: "#222222",
        assistant_bubble_color: "#333333",
        assistant_bubble_text_color: "#444444",
        message_area_bg: "#555555",
        bubble_radius: 8,
        panel_radius: 20,
        font_family: "inter",
        custom_css: ".a{color:red}"
      )

      expect(described_class.appearance(connector)).to eq(
        primaryColor: "#FF00AA",
        position: "bottom-left",
        welcomeMessage: "Oi!",
        botAvatarUrl: "https://cdn.exemplo.com/a.jpg",
        botDisplayName: "Ana",
        launcherIcon: "balao",
        locale: "en",
        preChatFields: "name",
        autoPageContext: false,
        proactiveEnabled: false,
        launcherImageUrl: "https://cdn.exemplo.com/b.jpg",
        launcherSize: 72,
        headerBgColor: "#000000",
        headerTextColor: "#FFFFFF",
        userBubbleColor: "#111111",
        userBubbleTextColor: "#222222",
        assistantBubbleColor: "#333333",
        assistantBubbleTextColor: "#444444",
        messageAreaBg: "#555555",
        bubbleRadius: 8,
        panelRadius: 20,
        fontFamily: "inter",
        customCss: ".a{color:red}"
      )
    end

    # É o `config` público: sai para qualquer um que tenha o token do site.
    it "não traz credencial nem regra interna" do
      serialized = described_class.appearance(connector)

      expect(serialized.keys).not_to include(:publicToken, :signingSecret, :allowedOrigins, :rateLimitPerMin, :dailyMessageCap, :dailyVisitorCap)
      expect(serialized.to_json).not_to include(connector.signing_secret, connector.public_token)
    end
  end

  describe ".one" do
    it "soma a aparência às regras e ao que a tela de instalação precisa" do
      connector.update!(rate_limit_per_min: 50, daily_message_cap: 100, daily_visitor_cap: 10, allowed_origins: [ "https://loja.com" ])

      serialized = described_class.one(connector)

      expect(serialized).to include(described_class.appearance(connector))
      expect(serialized).to include(
        id: connector.id.to_s,
        status: "active",
        active: true,
        publicToken: connector.public_token,
        rateLimitPerMin: 50,
        dailyMessageCap: 100,
        dailyVisitorCap: 10,
        allowedOrigins: [ "https://loja.com" ],
        deliveryMode: "rolling",
        pinnedVersion: nil,
        widgetSri: nil
      )
    end

    it "nunca traz o segredo de assinatura" do
      serialized = described_class.one(connector)

      expect(serialized).not_to have_key(:signingSecret)
      expect(serialized.to_json).not_to include(connector.signing_secret)
    end

    it "traz o snippet e as diretivas de CSP do conector" do
      builder = Widget::SnippetBuilder.new(connector)

      expect(described_class.one(connector)).to include(
        installSnippet: builder.call,
        cspScriptHash: builder.csp_script_hash,
        cspDirectives: builder.csp_directives,
        cspHeader: builder.csp_header
      )
    end

    it "traz o catálogo de versões em camelCase" do
      version = Widget::ReleaseRegistry.versions.first

      expect(described_class.one(connector)[:availableVersions]).to include(
        a_hash_including("version" => version, "sri" => Widget::ReleaseRegistry.sri(version), "releasedAt" => anything, "notes" => anything)
      )
    end

    it "traz o hash e a versão quando fixado" do
      version = Widget::ReleaseRegistry.versions.first
      connector.update!(delivery_mode: "pinned", pinned_version: version)

      expect(described_class.one(connector)).to include(
        deliveryMode: "pinned",
        pinnedVersion: version,
        widgetSri: Widget::ReleaseRegistry.sri(version)
      )
    end

    it "mostra o desligado" do
      connector.deactivate

      expect(described_class.one(connector)).to include(status: "closed", active: false)
    end
  end
end
