# O catálogo da organização. O nome é `Products`, e as rotas moram em `/products`,
# porque `Catalog*` e `GET /catalog` já são o acervo da ferramenta de carrosséis.
module Products
  # Modelos daqui usam tabelas `product_*`: Products::Item -> product_items.
  def self.table_name_prefix = "product_"

  # Só http(s) com host. O link sai da API para virar `href` e `src` na tela, e um
  # `javascript:` gravado aqui seria XSS na tela de quem abrir o item. O padrão é
  # permissivo de propósito no resto: URL real de loja tem acento e espaço escapado
  # de todo jeito, e quem consome é o navegador, não o `URI.parse`.
  WEB_URL = %r{\Ahttps?://[^\s/?#]+[^\s]*\z}i

  # O que cabe na coluna `integer`. Passar disso seria um 500 no INSERT, e não um 422.
  POSITION_RANGE = { greater_than_or_equal_to: -2_147_483_648, less_than_or_equal_to: 2_147_483_647 }.freeze

  def self.web_url?(value)
    WEB_URL.match?(value.to_s.strip)
  end
end
