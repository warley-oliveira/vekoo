require "net/http"

# O arquivo de uma fonte aberta (qualquer família do Google Fonts), em disco, para o Pango desenhar
# com ela de verdade.
#
# Sem isto o catálogo era decorativo: `Vips::Image.text` resolve família por
# fontconfig, e o servidor só tem DejaVu e Ubuntu instaladas — então uma peça
# de uma marca que escolheu "Playfair Display" saía em DejaVu, igualzinha à de
# quem escolheu "Bebas Neue". A pessoa via a fonte certa no navegador (que
# carrega a folha do Google) e errada na imagem exportada.
#
# O truque do `User-Agent` antigo é o que faz a API css2 do Google devolver
# `.ttf` em vez de `.woff2` — fontconfig não lê woff2. Baixa uma vez por
# família+peso e guarda em disco; falha vira `nil`, e aí o Pango cai no
# comportamento de antes (a família por nome, com fallback do sistema) em vez
# de derrubar a renderização.
class BrandFonts
  CSS_ENDPOINT = "https://fonts.googleapis.com/css2"
  # A API escolhe o formato pelo `User-Agent`. Este devolve TTF, que é o que o
  # fontconfig lê. Cuidado ao mexer: um UA de IE ("MSIE 6.0") faz o Google
  # servir **EOT**, que parece funcionar (200, ~300 KB) e não abre em lugar
  # nenhum — foi exatamente o que a checagem de assinatura pegou.
  LEGACY_USER_AGENT = "Mozilla/4.0".freeze
  TIMEOUT = 8
  # Fonte maior que isto não é fonte de texto: é engano ou ataque.
  MAX_BYTES = 5.megabytes

  class << self
    # Caminho local do arquivo, ou `nil` quando não deu para obter.
    def path(family, weight = 400)
      font = BrandCore::FontCatalog.resolve(family)
      return nil unless font

      family = font.family
      weight = BrandCore::FontCatalog.nearest_weight(family, weight)
      cached = cache_path(family, weight)
      return cached.to_s if cached.exist?
      return nil if failed?(family, weight)

      download(family, weight, cached)
    end

    def root
      Rails.root.join("tmp/brand_fonts")
    end

    # Enche o cache antes de precisar (deploy, `bin/rails fonts:warm`): a
    # primeira renderização de cada marca não deveria pagar o download.
    def warm(families = BrandCore::FontCatalog.families, weights: [ 400, 700 ])
      families.sum { |family| weights.count { |weight| path(family, weight) } }
    end

    private

    def cache_path(family, weight)
      root.join("#{family.parameterize}-#{weight}.ttf")
    end

    # Uma falha (rede fora, família removida do Google) não deve virar uma
    # tentativa por peça renderizada. Marca por um tempo e segue sem a fonte.
    def failed?(family, weight)
      Rails.cache.read(failure_key(family, weight)).present?
    end

    def mark_failed(family, weight)
      Rails.cache.write(failure_key(family, weight), true, expires_in: 1.hour)
      nil
    end

    def failure_key(family, weight)
      "brand_fonts:failed:#{family}:#{weight}"
    end

    def download(family, weight, destination)
      css = fetch(URI(css_url(family, weight)))
      return mark_failed(family, weight) if css.blank?

      # A URL nem sempre termina em `.ttf`: fonte variável vem de
      # `/l/font?kit=…`, sem extensão. Quem decide se serve é a assinatura do
      # arquivo, não o nome dele.
      url = css[/src:\s*url\((https:\/\/[^)]+)\)/, 1]
      return mark_failed(family, weight) if url.blank?

      body = fetch(URI(url), binary: true)
      return mark_failed(family, weight) if body.blank? || body.bytesize > MAX_BYTES
      return mark_failed(family, weight) unless truetype?(body)

      FileUtils.mkdir_p(destination.dirname)
      # Escreve num temporário e move: duas renderizações simultâneas não
      # podem deixar meio arquivo no lugar do arquivo.
      temporary = destination.sub_ext(".#{SecureRandom.hex(4)}.part")
      File.binwrite(temporary, body)
      FileUtils.mv(temporary, destination)
      destination.to_s
    rescue StandardError => e
      Rails.logger.warn("brand_fonts: #{family} #{weight} não baixou (#{e.class}: #{e.message[0, 120]})")
      mark_failed(family, weight)
    end

    # As assinaturas que o fontconfig lê. woff2 (`wOF2`) fica de fora de
    # propósito: ele não abre, e é o que a API devolve para navegador moderno.
    TRUETYPE_MAGIC = [ "\x00\x01\x00\x00".b, "true".b, "ttcf".b, "OTTO".b ].freeze

    def truetype?(body)
      TRUETYPE_MAGIC.include?(body.byteslice(0, 4))
    end

    def css_url(family, weight)
      "#{CSS_ENDPOINT}?family=#{ERB::Util.url_encode(family).gsub("%20", "+")}:wght@#{weight}"
    end

    def fetch(uri, binary: false)
      response = Net::HTTP.start(uri.host, uri.port, use_ssl: true, open_timeout: TIMEOUT, read_timeout: TIMEOUT) do |http|
        http.get(uri.request_uri, "User-Agent" => LEGACY_USER_AGENT)
      end
      return nil unless response.is_a?(Net::HTTPSuccess)

      binary ? response.body.b : response.body
    end
  end
end
