# Uma lâmina renderizada: o PNG de `slide_id` na versão `piece_version`, por
# `renderer` (`react` ou `libvips`). É derivado — o documento é a peça.
class PieceRender < ApplicationRecord
  belongs_to :piece_version
  has_one_attached :file

  validates :renderer, inclusion: { in: PieceRenderers::NAMES }
  validates :checksum, :slide_id, presence: true

  scope :ordered, -> { order(:position) }
end
