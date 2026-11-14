# Serialização explícita: cada recurso diz, em um lugar só, exatamente quais
# campos saem — nada de `to_json` do modelo vazando coluna nova sem querer.
#
# Chaves em camelCase e datas em **milissegundos desde a época** porque é essa
# a forma que o front já usa (`editedAt: number`, `Intl` para exibir). Trocar o
# mock pelo servidor não deve mexer nas telas.
class ApplicationSerializer
  def self.one(record)
    raise NotImplementedError
  end

  def self.many(records)
    records.map { |record| one(record) }
  end

  # A URL do blob no Active Storage, absoluta quando `API_ORIGIN` existe.
  #
  # Caminho relativo só serve quando a página e a API moram no mesmo host — e
  # em desenvolvimento não moram: com o Vite numa porta e o Rails noutra,
  # `/rails/active_storage/...` caía no index.html do Vite e a imagem não
  # aparecia. Prefixar aqui resolve para toda tela de uma vez, em vez de fazer
  # cada uma montar a URL.
  def self.blob_url(attachment)
    path = Rails.application.routes.url_helpers.rails_storage_proxy_url(attachment, only_path: true)
    origin = ENV["API_ORIGIN"].presence
    origin ? "#{origin.chomp('/')}#{path}" : path
  end

  def self.epoch_ms(time)
    return nil if time.nil?

    (time.to_f * 1000).round
  end
end
