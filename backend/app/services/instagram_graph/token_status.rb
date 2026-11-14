module InstagramGraph
  # O estado do token do Meta para a curadoria: vale, vence logo, venceu.
  #
  # Dois prazos contam: o do token (`expires_at`, 0 = nunca — o do usuário do
  # sistema) e o do acesso aos dados (`data_access_expires_at`, 90 dias no
  # token de usuário). O aviso começa `WARN_DAYS` antes do primeiro.
  #
  # Uma consulta ao Meta por hora, no máximo (`Rails.cache`). Falha de rede não
  # vira "inválido": vira `unknown`, e a importação segue — quem decide é o
  # erro da chamada de verdade.
  module TokenStatus
    WARN_DAYS = 14
    CACHE_KEY = "instagram-graph:token-status"
    REQUIRED_SCOPES = %w[instagram_basic instagram_manage_insights pages_read_engagement].freeze

    module_function

    def call(client: Client.new, now: Time.current)
      return { state: "notConfigured" } unless Client.configured?

      Rails.cache.fetch(CACHE_KEY, expires_in: 1.hour) { read(client, now) }
    end

    def reset! = Rails.cache.delete(CACHE_KEY)

    def importable?(status = call) = !%w[notConfigured invalid].include?(status[:state])

    def read(client, now)
      data = client.debug_token
      expires = [ data["expires_at"], data["data_access_expires_at"] ].map(&:to_i).select(&:positive?).map { |at| Time.at(at) }
      scopes = Array(data["scopes"])
      state =
        if data["is_valid"] != true || expires.any? { |at| at <= now } then "invalid"
        elsif expires.any? { |at| at <= now + WARN_DAYS.days } then "expiring"
        else "ok"
        end
      {
        state: state,
        expiresAt: ms(data["expires_at"]),
        dataAccessExpiresAt: ms(data["data_access_expires_at"]),
        missingScopes: REQUIRED_SCOPES - scopes
      }.compact
    rescue Client::Error => e
      Rails.logger.warn("[instagram] não deu para conferir o token: #{e.code}")
      { state: e.code == "tokenInvalid" ? "invalid" : "unknown" }
    end

    # Segundos do Meta → milissegundos da API; 0 (nunca vence) → nil.
    def ms(seconds) = seconds.to_i.positive? ? seconds.to_i * 1000 : nil
  end
end
