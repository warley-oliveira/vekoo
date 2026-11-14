module Layouts
  # A geometria de um layout (a lista de camadas de `geometry:` no YAML) e a
  # aritmética das caixas. O espelho do front é `lib/piece-geometry.ts`: as
  # mesmas regras, para o preview e o export do libvips caírem no mesmo lugar.
  module Geometry
    KINDS = %w[fill image scrim logo stack quote_mark swipe_hint slide_number].freeze
    ANCHORS = %w[top bottom center].freeze
    INKS = %w[image background auto].freeze

    # Um degrau de tamanho: ×1,15 por passo do `sizeStep`.
    STEP_RATIO = 1.15

    Box = Struct.new(:x, :y, :w, :h, keyword_init: true)

    module_function

    def size_for(base, step) = (base * (STEP_RATIO**step.to_i)).round

    # O degradê de uma camada `scrim` no nível que a lâmina escolheu: nil é o
    # do layout; `none` não desenha; `light` é bem mais leve; `strong` escurece
    # mais e mais cedo. O espelho do front é `scrimFor` em `piece-geometry.ts`.
    SCRIM_CURVE = 1.4

    def scrim(layer, level)
      opacity = layer["opacity"].to_f
      curve = (layer["curve"] || SCRIM_CURVE).to_f
      case level
      when "none" then nil
      when "light" then { opacity: (opacity * 0.55).round(3), curve: curve }
      when "strong" then { opacity: [ [ opacity, 0.6 ].max + 0.15, 0.92 ].min.round(3), curve: [ curve * 0.7, 0.6 ].max.round(3) }
      else { opacity: opacity, curve: curve }
      end
    end

    # Bordas → caixa em px. Largura e altura podem ficar nil (o conteúdo
    # decide: a logo, a pilha sem topo). `x`/`y` nil também: aí manda a borda
    # oposta (`right`/`bottom`), resolvida por quem desenha.
    def box(spec, width, height)
      return Box.new(x: 0, y: 0, w: width, h: height) if spec == "full"

      spec = (spec || {}).transform_keys(&:to_s)
      left, right, top, bottom = %w[left right top bottom].map { |k| length(spec[k], width, height, k) }
      w = length(spec["width"], width, height, "width")
      h = length(spec["height"], width, height, "height")

      w ||= width - left - right if left && right
      h ||= height - top - bottom if top && bottom
      x = left || (right && w ? width - right - w : nil)
      y = top || (bottom && h ? height - bottom - h : nil)
      Box.new(x: x, y: y, w: w, h: h).tap { |b| b.define_singleton_method(:edges) { { "right" => right, "bottom" => bottom } } }
    end

    def length(value, width, height, edge)
      return nil if value.nil?
      return value.to_f if value.is_a?(Numeric)

      if (pct = value.to_s[/\A(-?\d+(?:\.\d+)?)%\z/, 1])
        axis = %w[left right width].include?(edge) ? width : height
        return axis * pct.to_f / 100.0
      end
      raise InvalidContract, "medida '#{value}' inválida"
    end

    # `[t, r, b, l]` ou um número.
    def inset(value)
      values = Array(value || 0).map(&:to_f)
      case values.length
      when 1 then [ values[0] ] * 4
      when 4 then values
      else raise InvalidContract, "inset precisa de 1 ou 4 números"
      end
    end

    # Confere a lista do YAML; devolve-a com chaves em string.
    def validate!(layers, contract_id, slots)
      Array(layers).map do |layer|
        layer = layer.to_h.deep_stringify_keys
        kind = layer["kind"].to_s
        raise InvalidContract, "layout #{contract_id}: camada '#{kind}' desconhecida" unless KINDS.include?(kind)
        if layer["slot"] && !slots.key?(layer["slot"])
          raise InvalidContract, "layout #{contract_id}: camada #{kind} usa o slot '#{layer["slot"]}', que não existe"
        end
        if kind == "stack"
          raise InvalidContract, "layout #{contract_id}: âncora '#{layer["anchor"]}'" unless ANCHORS.include?(layer["anchor"].to_s)
          raise InvalidContract, "layout #{contract_id}: ink '#{layer["ink"]}'" unless INKS.include?(layer["ink"].to_s)
          Array(layer["items"]).each do |item|
            slot = slots[item["slot"].to_s]
            raise InvalidContract, "layout #{contract_id}: item '#{item["slot"]}' não é slot de texto" unless slot&.text?
            raise InvalidContract, "layout #{contract_id}: item '#{item["slot"]}' sem size" unless item["size"].to_f.positive?
          end
          inset(layer["inset"])
        end
        layer
      end
    end
  end
end
