# Cópia do carrossel: mesmo documento, identidade nova, fora da lixeira e sem
# herdar o favorito. Os ids de card e bloco vivem dentro do documento e só
# precisam ser únicos ali dentro, então a cópia os mantém.
class DuplicateCarousel
  def initialize(carousel, title: nil)
    @carousel = carousel
    @title = title
  end

  def call
    @carousel.organization.carousels.create!(
      title: @title.presence || default_title,
      format: @carousel.format,
      theme: @carousel.theme.deep_dup,
      cards: @carousel.cards.deep_dup,
      caption: @carousel.caption,
      folder_id: @carousel.folder_id,
      favorite: false,
      edited_at: Time.current
    )
  end

  private

  def default_title
    "#{@carousel.title} (#{I18n.t('carousels.copy_suffix')})".truncate(120)
  end
end
