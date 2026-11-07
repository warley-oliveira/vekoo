# Os provedores do jeito que respondem de verdade, para os fluxos de criar, ligar e consultar
# conectores. A rede é fechada por WebMock (spec/support/webmock.rb): uma chamada sem stub falha.
#
# O SDK da Meta (`whatsapp_sdk`) fala com a Graph API na versão dele (v19.0), e os clientes
# próprios em v22.0 e v24.0: os caminhos aqui valem para a versão que cada um usa.
module ConnectorProviderStubs
  GRAPH_SDK = "https://graph.facebook.com/v19.0".freeze
  GRAPH_FACEBOOK = "https://graph.facebook.com/v22.0".freeze
  GRAPH_INSTAGRAM = "https://graph.instagram.com/v22.0".freeze
  LEAD_CHAT_SUBSCRIPTIONS = "https://api.web.leadchat.app/core/v1/webhook/subscription".freeze

  def provider_json(body, status: 200)
    { status: status, body: body.to_json, headers: { "Content-Type" => "application/json" } }
  end

  # Credenciais de provedor vêm do ambiente. `nil` tira a variável durante o bloco.
  def with_env(values)
    saved = values.keys.to_h { |name| [ name, ENV[name] ] }
    values.each { |name, value| ENV[name] = value }
    yield
  ensure
    saved.each { |name, value| ENV[name] = value }
  end

  def meta_error(message = "Erro da Meta", status: 400, code: 100)
    provider_json({ error: { message: message, type: "OAuthException", code: code, fbtrace_id: "abc" } }, status: status)
  end

  # --- WhatsApp Cloud --------------------------------------------------------

  def stub_cloud_oauth(access_token: "user-token-da-meta")
    stub_request(:post, "#{GRAPH_FACEBOOK}/oauth/access_token")
      .to_return(provider_json({ access_token: access_token, token_type: "bearer" }))
  end

  def cloud_phone_payload(id, **overrides)
    {
      id: id.to_s,
      verified_name: "Clínica Vida",
      display_phone_number: "+55 31 3333-0000",
      quality_rating: "GREEN",
      status: "CONNECTED"
    }.merge(overrides)
  end

  def stub_cloud_phone_number(phone_number_id, **overrides)
    stub_request(:get, %r{\A#{Regexp.escape(GRAPH_SDK)}/#{phone_number_id}\?})
      .to_return(provider_json(cloud_phone_payload(phone_number_id, **overrides)))
  end

  def stub_cloud_phone_number_error(phone_number_id, message: "Número não encontrado")
    stub_request(:get, %r{\A#{Regexp.escape(GRAPH_SDK)}/#{phone_number_id}\?}).to_return(meta_error(message))
  end

  def stub_cloud_phone_numbers(waba_id, numbers)
    stub_request(:get, %r{\A#{Regexp.escape(GRAPH_SDK)}/#{waba_id}/phone_numbers\?})
      .to_return(provider_json({ data: numbers }))
  end

  def stub_cloud_subscribe_app(waba_id)
    stub_request(:post, %r{\Ahttps://graph\.facebook\.com/v24\.0/#{waba_id}/subscribed_apps})
      .to_return(provider_json({ success: true }))
  end

  def business_profile_payload(**overrides)
    {
      data: [ {
        about: "Atendimento em Belo Horizonte",
        address: "Rua da Bahia, 1000",
        description: "Clínica de nutrição",
        email: "contato@clinicavida.com.br",
        messaging_product: "whatsapp",
        profile_picture_url: "https://cdn.exemplo.com/perfil.jpg",
        vertical: "HEALTH",
        websites: [ "https://clinicavida.com.br" ]
      }.merge(overrides) ]
    }
  end

  def stub_cloud_business_profile(phone_number_id, **overrides)
    stub_request(:get, %r{\A#{Regexp.escape(GRAPH_SDK)}/#{phone_number_id}/whatsapp_business_profile\?})
      .to_return(provider_json(business_profile_payload(**overrides)))
  end

  # Tudo que `WhatsappCloud#activate` chama até o conector ficar ativo.
  def stub_cloud_activation(phone_number_id:, waba_id:)
    stub_cloud_phone_number(phone_number_id)
    stub_cloud_phone_numbers(waba_id, [ cloud_phone_payload(phone_number_id) ])
    stub_cloud_subscribe_app(waba_id)
    stub_cloud_business_profile(phone_number_id)
  end

  # --- Facebook Messenger e Instagram ligado à página ---------------------------

  def stub_facebook_oauth(access_token: "user-token-do-facebook")
    stub_request(:post, "#{GRAPH_FACEBOOK}/oauth/access_token")
      .to_return(provider_json({ access_token: access_token }))
  end

  def stub_facebook_pages(pages)
    stub_request(:get, "#{GRAPH_FACEBOOK}/me/accounts").with(query: hash_including({}))
      .to_return(provider_json({ data: pages }))
  end

  def stub_page_picture(page_id)
    stub_request(:get, "#{GRAPH_FACEBOOK}/#{page_id}/picture").with(query: hash_including({}))
      .to_return(provider_json({ data: { url: "https://cdn.exemplo.com/pagina.jpg" } }))
  end

  def stub_page_subscription(page_id, success: true)
    stub_request(:post, "#{GRAPH_FACEBOOK}/#{page_id}/subscribed_apps").with(query: hash_including({}))
      .to_return(success ? provider_json({ success: true }) : meta_error("Sem permissão"))
  end

  def stub_page_instagram_account(page_id, instagram_id)
    body = instagram_id ? { instagram_business_account: { id: instagram_id }, id: page_id } : { id: page_id }

    stub_request(:get, "#{GRAPH_FACEBOOK}/#{page_id}").with(query: hash_including(fields: "instagram_business_account"))
      .to_return(provider_json(body))
  end

  def instagram_profile_payload(**overrides)
    {
      username: "lojadaana",
      name: "Loja da Ana",
      profile_picture_url: "https://cdn.exemplo.com/ana.jpg",
      biography: "Roupas feitas à mão",
      followers_count: 1200,
      follows_count: 300,
      media_count: 87,
      website: "https://lojadaana.com.br",
      account_type: "BUSINESS"
    }.merge(overrides)
  end

  def stub_facebook_instagram_profile(instagram_id, **overrides)
    stub_request(:get, "#{GRAPH_FACEBOOK}/#{instagram_id}").with(query: hash_including({}))
      .to_return(provider_json(instagram_profile_payload(**overrides)))
  end

  def stub_facebook_login_webhooks
    stub_request(:post, "#{GRAPH_FACEBOOK}/me/subscribed_apps").with(query: hash_including({}))
      .to_return(provider_json({ success: true }))
  end

  # Tudo que a criação de `meta_channels` chama. Sem `instagram_id`, a página não tem conta
  # profissional ligada.
  def stub_meta_channels(page_id:, page_token: "page-token-da-meta", instagram_id: nil)
    stub_facebook_oauth
    stub_facebook_pages([ { id: page_id, name: "Loja da Ana", access_token: page_token } ])
    stub_page_picture(page_id)
    stub_page_subscription(page_id)
    stub_page_instagram_account(page_id, instagram_id)
    return unless instagram_id

    stub_facebook_instagram_profile(instagram_id)
    stub_facebook_login_webhooks
  end

  # --- Instagram Login -----------------------------------------------------------

  def stub_instagram_oauth(short_token: "ig-curto", long_token: "ig-longo", user_id: 178_414)
    stub_request(:post, "https://api.instagram.com/oauth/access_token")
      .to_return(provider_json({ access_token: short_token, user_id: user_id }))
    stub_request(:get, "#{GRAPH_INSTAGRAM}/access_token").with(query: hash_including({}))
      .to_return(provider_json({ access_token: long_token, token_type: "bearer", expires_in: 5_184_000 }))
  end

  # O `/me` da Graph API do Instagram: `id` é do app, e `user_id` é o da conta profissional,
  # o mesmo que chega nos webhooks.
  def stub_instagram_me(user_id: "178414", **overrides)
    stub_request(:get, "#{GRAPH_INSTAGRAM}/me").with(query: hash_including({}))
      .to_return(provider_json({ id: "app-scoped-1", user_id: user_id }.merge(instagram_profile_payload(**overrides))))
  end

  def stub_instagram_webhooks
    stub_request(:post, "#{GRAPH_INSTAGRAM}/me/subscribed_apps").with(query: hash_including({}))
      .to_return(provider_json({ success: true }))
  end

  def stub_instagram_login
    stub_instagram_oauth
    stub_instagram_me
    stub_instagram_webhooks
  end

  # --- WhatsApp Web ------------------------------------------------------------

  def evolution_url(path = "")
    "#{Connector::WhatsappWeb.default_base_url('evolution_api')}#{path}"
  end

  def stub_evolution_create(apikey: "chave-da-instancia", qrcode: "QR-EM-BASE64")
    stub_request(:post, evolution_url("/instance/create"))
      .to_return(provider_json({ instance: { instanceName: "IWA-1" }, hash: apikey, qrcode: { base64: qrcode } }, status: 201))
  end

  # --- LeadChat ----------------------------------------------------------------

  def stub_lead_chat_subscription(id: "sub-1")
    stub_request(:post, LEAD_CHAT_SUBSCRIPTIONS).to_return(provider_json({ id: id }))
  end

  def stub_lead_chat_subscription_error(message: "Chave inválida")
    stub_request(:post, LEAD_CHAT_SUBSCRIPTIONS).to_return(provider_json({ error: { code: 401, message: message } }))
  end
end

RSpec.configure do |config|
  config.include ConnectorProviderStubs
end
