# Um snapshot do documento de uma peça. Nunca muda e nunca é apagado:
# restaurar é criar uma versão nova com o documento da antiga.
class PieceVersion < ApplicationRecord
  # De onde a versão veio — vira o rótulo do histórico.
  SOURCES = %w[generation user_edit conversation layout_change brandcore_update restore migration].freeze

  belongs_to :piece
  belongs_to :account, optional: true
  has_many :renders, class_name: "PieceRender", dependent: :destroy

  validates :source, inclusion: { in: SOURCES }
  validates :summary, length: { maximum: 200 }

  scope :chronological, -> { order(:created_at) }

  # Imutável: alterar é criar outra. Apagar só acontece junto com a peça.
  before_update { raise ActiveRecord::ReadOnlyRecord, "versão de peça não muda" }
end
