# A configuração completa do widget, para quem administra: inclui token público e snippet
# de instalação. O segredo de assinatura nunca sai.
class WidgetConnectorSerializer < ApplicationSerializer
  def self.one(connector)
    snippet = ::Widget::SnippetBuilder.new(connector)

    appearance(connector).merge(
      id: connector.id.to_s,
      status: connector.status_name,
      active: connector.active?,
      publicToken: connector.public_token,
      rateLimitPerMin: connector.rate_limit_per_min,
      dailyMessageCap: connector.daily_message_cap,
      dailyVisitorCap: connector.daily_visitor_cap,
      allowedOrigins: connector.allowed_origins,
      deliveryMode: connector.delivery_mode,
      pinnedVersion: connector.pinned_version,
      widgetSri: snippet.sri,
      cspScriptHash: snippet.csp_script_hash,
      cspDirectives: snippet.csp_directives,
      cspHeader: snippet.csp_header,
      availableVersions: ::Widget::ReleaseRegistry.catalog.map { |release| release.transform_keys { |key| key.to_s.camelize(:lower) } },
      installSnippet: snippet.call
    )
  end

  # O que o widget precisa para se desenhar: é também o `config` público de `/widget/v1`.
  def self.appearance(connector)
    {
      primaryColor: connector.primary_color,
      position: connector.position,
      welcomeMessage: connector.welcome_message,
      botAvatarUrl: connector.bot_avatar_url,
      botDisplayName: connector.bot_display_name,
      launcherIcon: connector.launcher_icon,
      locale: connector.locale,
      preChatFields: connector.pre_chat_fields,
      autoPageContext: connector.auto_page_context,
      proactiveEnabled: connector.proactive_enabled,
      launcherImageUrl: connector.launcher_image_url,
      launcherSize: connector.launcher_size,
      headerBgColor: connector.header_bg_color,
      headerTextColor: connector.header_text_color,
      userBubbleColor: connector.user_bubble_color,
      userBubbleTextColor: connector.user_bubble_text_color,
      assistantBubbleColor: connector.assistant_bubble_color,
      assistantBubbleTextColor: connector.assistant_bubble_text_color,
      messageAreaBg: connector.message_area_bg,
      bubbleRadius: connector.bubble_radius,
      panelRadius: connector.panel_radius,
      fontFamily: connector.font_family,
      customCss: connector.custom_css
    }
  end
end
