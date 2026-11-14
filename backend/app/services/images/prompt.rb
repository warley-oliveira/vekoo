module Images
  # O pedido que vai ao gerador: o que a pessoa escreveu, com o contexto da
  # marca publicada (ramo, o que vende, as cores) e as regras da Vekoo. A
  # regra que mais importa: **sem texto na imagem** — o texto da peça entra
  # depois, no layout, na fonte da marca. Letra desenhada pelo gerador sai
  # torta e em outra fonte.
  module Prompt
    module_function

    def call(brand_core, request, reference: false)
      tokens = Engines::Tokens.new(brand_core)
      identity = tokens.identity
      colors = tokens.colors.filter_map { |c| [ c["name"].presence, c["hex"] ].compact.join(" ") if c["hex"].present? }.first(5)

      <<~TEXT.squish
        #{reference ? "Use a foto enviada como referência do produto ou do lugar, mantendo o que ela mostra." : ""}
        Foto para um post de Instagram de #{identity["name"].presence || "uma marca"}#{segment(identity)}.
        Pedido: #{request.to_s.strip}.
        Estilo: fotografia realista e bem iluminada, composição limpa, com espaço livre para texto ao redor do assunto.
        #{colors.any? ? "Se combinar com a cena, use tons próximos da paleta da marca (#{colors.join(', ')}), sem forçar." : ""}
        Não escreva nenhum texto, letra, número, logotipo ou marca d'água na imagem — nem o nome da marca:
        placas, letreiros, fachadas, embalagens e rótulos aparecem lisos ou fora de foco, sem nenhuma escrita.
      TEXT
    end

    def segment(identity)
      parts = [ identity["segment"].presence, identity["concept"].presence ].compact
      parts.any? ? " (#{parts.join(' — ').first(160)})" : ""
    end
  end
end
