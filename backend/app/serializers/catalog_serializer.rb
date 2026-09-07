# O acervo da ferramenta: temas prontos, biblioteca de imagens, paletas,
# formatos e o custo em créditos de cada geração. É igual para todo mundo e não
# muda no meio da sessão — a tela busca uma vez e guarda.
class CatalogSerializer < ApplicationSerializer
  # Proporção largura/altura de cada formato (9:16 entra em etapa futura).
  FORMAT_RATIOS = { "4:5" => 4.fdiv(5), "1:1" => 1.0 }.freeze

  # Quanto cada operação consome de crédito.
  AI_COSTS = {
    carousel: 5,
    card: 1,
    rewrite: 1,
    image: 2,
    caption: 1
  }.freeze

  def self.call
    {
      formats: Carousel::FORMATS.map { |f| { id: f, ratio: FORMAT_RATIOS[f] } },
      themePresets: ThemePreset.ordered.map { |preset|
        { id: preset.key, theme: preset.theme }
      },
      imageLibrary: LibraryImage.ordered.map { |image|
        { id: image.key, base: image.base, layers: image.layers }
      },
      folderColors: PaletteColor.in_group("folder").map { |color|
        { id: color.key, value: color.value }
      },
      accentChoices: PaletteColor.in_group("accent").pluck(:value),
      extendedPalette: PaletteColor.in_group("extended").pluck(:value),
      aiCosts: AI_COSTS,
      # A tela não crava mais "30 dias" no texto: o prazo é do servidor, que é
      # quem de fato apaga.
      trashRetentionDays: (Carousel::TRASH_RETENTION / 1.day).to_i,
      # O teto do upload é do servidor: a tela não deve mais cravar um número
      # que veio da época em que a imagem morava no localStorage.
      uploadLimits: {
        maxBytes: Upload::MAX_BYTES,
        contentTypes: Upload::CONTENT_TYPES
      }
    }
  end
end
