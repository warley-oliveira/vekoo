# As logos de uma marca. Uma logo é um **grupo** de `brand_assets` de tipo
# `logo` que dividem um `logo_id`: as variantes (clara, escura) do mesmo
# desenho. Nada aqui apaga arquivo — trocar a principal só muda a referência
# no documento (`assets.primaryLogoId`), e ela é versionada com o resto.
class BrandCore::Logos
  include Enumerable

  ORIGINS = %w[onboarding brand upload].freeze

  # Dentro do grupo, a variante mais recente vale: reenviar a versão clara
  # pelo wizard junta no mesmo grupo sem apagar a anterior.
  Logo = Struct.new(:id, :assets, keyword_init: true) do
    def variant(name) = assets.select { |asset| asset.variant == name.to_s }.max_by(&:created_at)
    def variants = %w[light dark].index_with { |name| variant(name) }.compact
    def generated? = assets.any?(&:generated)
    def source = generated? ? "generated" : "uploaded"
    def origin = meta["origin"].presence || (generated? ? "onboarding" : "upload")
    def style = meta["style"].presence
    # A logo com símbolo do "cria pra mim": direção, arranjo e a ideia.
    def concept = meta["concept"].presence
    def created_at = assets.map(&:created_at).min
    def svg? = assets.any? { |asset| asset.content_type == "image/svg+xml" }

    private

    def meta = assets.min_by(&:created_at).meta || {}
  end

  def initialize(assets)
    @logos = assets.select { |asset| asset.kind == "logo" && asset.logo_id.present? }
      .group_by(&:logo_id)
      .map { |id, group| Logo.new(id: id, assets: group) }
      .sort_by(&:created_at).reverse
  end

  def each(&) = @logos.each(&)

  def find_logo(id) = @logos.find { |logo| logo.id == id.to_s }

  # A principal segundo um documento (o rascunho ou o publicado). Sem escolha
  # — ou com a escolha apontando para uma logo apagada —, a de sempre: a
  # enviada mais recente, senão o nosso logotipo mais recente.
  def primary(document)
    chosen = document.dig("assets", "primaryLogoId").presence
    (chosen && find_logo(chosen)) ||
      @logos.find { |logo| !logo.generated? } ||
      @logos.first
  end
end
