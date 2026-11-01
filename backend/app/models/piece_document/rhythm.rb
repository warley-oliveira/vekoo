module PieceDocument
  # O ritmo do carrossel: capa marcante, miolo com um fundo só, no máximo uma
  # lâmina de destaque e chamada final marcante. Cor alternando lâmina a lâmina
  # quebrava a unidade da peça (26 de 30 carrosséis do agente tinham dois ou
  # mais fundos no miolo).
  #
  # O agente não escolhe a cor de lâmina de carrossel: escolhe o esquema da
  # variação (claro ou escuro) e qual lâmina é o destaque; a cor de cada papel
  # vem daqui. Hoje é o padrão tirado da paleta da marca; a escolha da marca
  # no Brandcore entra no lugar de `SCHEMES` quando existir.
  module Rhythm
    # Por papel, os tokens na ordem de preferência — o primeiro que a marca
    # tem. O destaque é a cor que contrasta com o miolo: o acento no miolo
    # claro, o fundo claro no miolo escuro.
    SCHEMES = {
      "light" => {
        "body" => %w[surface],
        "cover" => %w[primary accent secondary], "highlight" => %w[accent secondary primary], "cta" => %w[primary accent secondary]
      },
      "dark" => {
        "body" => %w[primary],
        "cover" => %w[accent secondary primary], "highlight" => %w[surface accent secondary], "cta" => %w[accent secondary primary]
      }
    }.freeze
    DEFAULT = "light"
    ROLES = %w[cover body highlight cta].freeze

    module_function

    # Os esquemas que a paleta da marca sustenta, já com o token de cada
    # papel. Sem fundo claro na paleta, não há esquema claro. Capa, destaque
    # e chamada preferem uma cor diferente da do miolo.
    def schemes(colors)
      SCHEMES.each_with_object({}) do |(name, candidates), found|
        body = candidates["body"].find { |token| PieceDocument.resolve_token(colors, token) }
        next unless body

        body_hex = PieceDocument.resolve_token(colors, body)["hex"]
        found[name] = ROLES.to_h { |role|
          next [ role, body ] if role == "body"

          present = candidates[role].select { |token| PieceDocument.resolve_token(colors, token) }
          [ role, present.find { |token| PieceDocument.resolve_token(colors, token)["hex"] != body_hex } || present.first || body ]
        }
      end
    end

    # O esquema pedido, se a marca o sustenta; senão o padrão, ou o que houver.
    def scheme_for(name, colors)
      options = schemes(colors)
      key = options.key?(name.to_s) ? name.to_s : (options.key?(DEFAULT) ? DEFAULT : options.keys.first)
      [ key, options[key] ]
    end

    # O token de cada lâmina, na ordem. Destaque só o primeiro marcado do
    # miolo — no máximo um por carrossel; capa e chamada final já são
    # marcantes.
    def tokens(raw_slides, scheme_roles)
      total = raw_slides.length
      highlighted = highlight_index(raw_slides)
      raw_slides.each_index.map { |index|
        role =
          if index.zero? then "cover"
          elsif index == total - 1 then "cta"
          elsif index == highlighted then "highlight"
          else "body"
          end
        scheme_roles.fetch(role)
      }
    end

    def highlight_index(raw_slides)
      (1...(raw_slides.length - 1)).find { |index| highlight?(raw_slides[index]) }
    end

    # O que o plano do agente quebra no ritmo — volta a ele como erro, para a
    # segunda tentativa. O miolo é `carousel-body`; outro layout só na lâmina
    # com foto ou na de destaque.
    def problems(raw_slides)
      raw_slides = Array(raw_slides)
      problems = []
      marked = (1...(raw_slides.length - 1)).select { |index| highlight?(raw_slides[index]) }
      problems << "marque `highlight` em no máximo uma lâmina do miolo (vieram #{marked.length})" if marked.length > 1
      (1...(raw_slides.length - 1)).each do |index|
        slide = raw_slides[index].to_h.stringify_keys
        layout = slide["layout"].presence || slide["layoutId"]
        next if layout.to_s == Fit::LAYOUT || index == marked.first || photo?(slide, layout)

        problems << "lâmina #{index + 1}: o miolo usa `#{Fit::LAYOUT}`; `#{layout}` só na lâmina com foto ou na de destaque (`\"highlight\": true`)"
      end
      problems
    end

    def photo?(slide, layout)
      contract = Layouts::Registry.find(layout)
      content = slide["content"].to_h.stringify_keys
      Array(contract&.slots&.values).any? { |slot| slot.type == "image" && content[slot.id].present? }
    end

    def highlight?(raw_slide)
      raw_slide.is_a?(Hash) && [ true, "true" ].include?(raw_slide.stringify_keys["highlight"])
    end
  end
end
