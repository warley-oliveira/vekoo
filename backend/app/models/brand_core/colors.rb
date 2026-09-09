# Contas de cor que o servidor precisa fazer sozinho (o tema do carrossel
# derivado da paleta). Mesma matemática de `frontend/src/lib/brand-core.ts`.
module BrandCore::Colors
  module_function

  def rgb(hex)
    h = hex.to_s.delete("#")
    [ h[0, 2], h[2, 2], h[4, 2] ].map { |pair| pair.to_i(16) }
  end

  def hex(r, g, b)
    format("#%02x%02x%02x", *[ r, g, b ].map { |v| v.round.clamp(0, 255) })
  end

  # `amount` de `b` misturado em `a` (0 = a, 1 = b).
  def mix(a, b, amount)
    ra, ga, ba = rgb(a)
    rb, gb, bb = rgb(b)
    hex(ra + (rb - ra) * amount, ga + (gb - ga) * amount, ba + (bb - ba) * amount)
  end

  def luminance(color)
    rgb(color).map { |v|
      c = v / 255.0
      c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055)**2.4
    }.then { |r, g, b| 0.2126 * r + 0.7152 * g + 0.0722 * b }
  end

  def contrast(a, b)
    la = luminance(a)
    lb = luminance(b)
    light, dark = la > lb ? [ la, lb ] : [ lb, la ]
    (light + 0.05) / (dark + 0.05)
  end
end
