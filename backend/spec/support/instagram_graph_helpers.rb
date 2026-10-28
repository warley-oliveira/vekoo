# Dublês da Instagram Graph API: respostas no formato do Meta, sem rede.
module InstagramGraphHelpers
  ENV_KEYS = %w[META_ACCESS_TOKEN META_IG_USER_ID META_APP_ID META_APP_SECRET META_GRAPH_VERSION].freeze

  def with_instagram_env(values = {})
    defaults = { "META_ACCESS_TOKEN" => "token-de-teste", "META_IG_USER_ID" => "17841400000000000",
                 "META_APP_ID" => "1234", "META_APP_SECRET" => "segredo", "META_GRAPH_VERSION" => nil }
    previous = ENV_KEYS.index_with { |key| ENV[key] }
    defaults.merge(values).each { |key, value| ENV[key] = value }
    yield
  ensure
    previous.each { |key, value| ENV[key] = value }
  end

  def ig_media(id, type: "IMAGE", likes: 100, comments: 10, days_ago: 10, product: "FEED", children: nil,
    caption: "Legenda do post #{id}: três passos para o pão perfeito em casa.", media_url: :default, thumbnail_url: nil)
    {
      "id" => id, "caption" => caption, "media_type" => type, "media_product_type" => product,
      "like_count" => likes, "comments_count" => comments, "permalink" => "https://www.instagram.com/p/#{id}/",
      "media_url" => media_url == :default ? "https://scontent.cdninstagram.com/#{id}.jpg" : media_url,
      "thumbnail_url" => thumbnail_url, "timestamp" => (Time.current - days_ago.days).utc.iso8601,
      "children" => children && { "data" => children }
    }.compact
  end

  def ig_child(id, type: "IMAGE")
    { "id" => id, "media_type" => type, "media_url" => ("https://scontent.cdninstagram.com/#{id}.jpg" unless type == "VIDEO"),
      "thumbnail_url" => ("https://scontent.cdninstagram.com/#{id}-capa.jpg" if type == "VIDEO") }.compact
  end

  def ig_discovery(username, media, name: "Padoca Exemplo", followers: 12_000, after: nil)
    {
      "business_discovery" => {
        "username" => username, "name" => name, "followers_count" => followers, "media_count" => media.length,
        "media" => { "data" => media, "paging" => { "cursors" => { "after" => after }.compact } }
      },
      "id" => "17841400000000000"
    }
  end

  def ig_error(code, message: "Erro do Meta", status: 400, headers: {})
    [ status, headers, JSON.generate("error" => { "code" => code, "message" => message, "type" => "OAuthException" }) ]
  end

  # Responde pelo @ que está em `business_discovery.username(...)`; guarda as
  # chamadas para a spec conferir. Valor pode ser payload, [status, headers,
  # body] ou um bloco que recebe os `fields`.
  def ig_transport(responses)
    calls = []
    transport = ->(uri, headers) {
      calls << { uri: uri, headers: headers }
      params = URI.decode_www_form(uri.query.to_s).to_h
      username = params["fields"].to_s[/username\(([^)]+)\)/, 1] || :debug_token
      response = responses.fetch(username) { responses.fetch(:default) }
      response = response.call(params["fields"].to_s) if response.respond_to?(:call)
      response.is_a?(Array) ? response : [ 200, {}, JSON.generate(response) ]
    }
    [ transport, calls ]
  end
end

RSpec.configure do |config|
  config.include InstagramGraphHelpers
end
