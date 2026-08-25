# O documento inteiro, no mesmo formato de `frontend/src/lib/doc.ts`: `theme`
# e `cards` saem do jsonb como estão (já em camelCase por dentro).
#
# `summary` serve às listas — a biblioteca não precisa carregar todos os blocos
# de todos os carrosséis para desenhar a grade, só o card 1.
class CarouselSerializer < ApplicationSerializer
  def self.one(carousel)
    {
      id: carousel.id,
      title: carousel.title,
      format: carousel.format,
      theme: carousel.theme,
      cards: carousel.cards,
      caption: carousel.caption,
      folderId: carousel.folder_id,
      favorite: carousel.favorite,
      editedAt: epoch_ms(carousel.edited_at),
      trashedAt: epoch_ms(carousel.trashed_at)
    }
  end

  def self.summary(carousel)
    one(carousel).merge(
      cards: carousel.cards.first(1),
      cardCount: carousel.cards.length
    )
  end

  def self.many_summaries(carousels)
    carousels.map { |carousel| summary(carousel) }
  end
end
