module References
  # O que denuncia de onde a referência saiu: link, domínio, @, o perfil de
  # origem e os termos que a curadoria marcou (o nome da marca de origem, de
  # quem aparece no post). A análise é um padrão; se ela cita a fonte, vira
  # cópia de alguém — e o agente levaria o nome para a peça de outra marca.
  #
  # Card com achado não publica (`ReferenceCard#findings`), e a ficha que vai
  # ao agente passa por aqui de novo antes de sair.
  module Leakage
    URL = %r{https?://\S+|\bwww\.\S+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|br|io|app|me|co|shop|store|site)\b}i
    HANDLE = /(?<![\w.@])@[a-z0-9._]{2,30}/i

    # Domínio de rede social não é a marca: "post do Instagram" pode aparecer
    # numa análise sem dizer de quem é.
    PLATFORMS = %w[instagram facebook tiktok youtube youtu linkedin twitter x threads pinterest kwai].freeze

    MIN_TERM = 3

    module_function

    # [{ "path" => "copy.cta", "kind" => "url" | "handle" | "term", "match" => "…" }]
    def findings(analysis, source)
      terms = terms_for(source)
      Text.leaves(analysis).flat_map { |path, text|
        found = []
        text.scan(URL) { found << { "path" => path, "kind" => "url", "match" => Regexp.last_match(0) } }
        text.scan(HANDLE) { found << { "path" => path, "kind" => "handle", "match" => Regexp.last_match(0) } }
        folded = Text.fold(text)
        terms.each do |term|
          found << { "path" => path, "kind" => "term", "match" => term } if folded.match?(/(?<![[:alnum:]])#{Regexp.escape(term)}(?![[:alnum:]])/)
        end
        found
      }.uniq
    end

    # O que da fonte não pode aparecer: o @ sem a arroba, o nome do site (fora
    # as redes) e os termos da curadoria — todos já sem acento.
    def terms_for(source)
      source = source.to_h.stringify_keys
      terms = Array(source["bannedTerms"]).map { |term| Text.fold(term) }
      terms << Text.fold(source["channel"].to_s.delete_prefix("@").tr("._", "  "))
      terms << Text.fold(source["channel"].to_s.delete_prefix("@"))
      terms << site_name(source["url"])
      terms.compact_blank.select { |term| term.length >= MIN_TERM }.uniq
    end

    # O rótulo antes do sufixo: `shop.padaria.com.br` → "padaria".
    SUFFIXES = %w[com net org br io app me co uk pt shop store site www].freeze

    def site_name(url)
      labels = URI.parse(url.to_s).host.to_s.downcase.split(".")
      labels.pop while labels.length > 1 && SUFFIXES.include?(labels.last)
      label = labels.last
      label unless label.blank? || PLATFORMS.include?(label)
    rescue URI::InvalidURIError
      nil
    end
  end
end
