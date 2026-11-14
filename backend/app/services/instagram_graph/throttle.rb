module InstagramGraph
  # O limite de taxa do Meta vale para o app inteiro: quando uma conta bate
  # nele, as outras do lote nem tentam — insistir só estende a espera.
  module Throttle
    KEY = "instagram-graph:throttled-until"

    module_function

    def until!(minutes)
      at = Time.current + minutes.to_i.minutes
      Rails.cache.write(KEY, at.to_i, expires_in: minutes.to_i.minutes)
      at
    end

    def throttled_until
      at = Rails.cache.read(KEY)
      Time.at(at) if at && Time.at(at) > Time.current
    end

    def check!
      at = throttled_until
      return unless at

      raise Client::Error.new("rateLimited", "aguardando o limite do Meta", retry_after: ((at - Time.current) / 60).ceil)
    end

    def clear! = Rails.cache.delete(KEY)
  end
end
