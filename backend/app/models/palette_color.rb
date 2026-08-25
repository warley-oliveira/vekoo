# Uma cor de alguma das paletas da ferramenta:
# - `folder`   cores de pasta (têm nome traduzido em `folders.colors.<key>`)
# - `accent`   acentos do carrossel
# - `extended` paleta ampla do "Mais cores"
class PaletteColor < ApplicationRecord
  GROUPS = %w[folder accent extended].freeze

  validates :group, inclusion: { in: GROUPS }
  validates :value, presence: true, uniqueness: { scope: :group }

  scope :ordered, -> { order(:position) }
  scope :in_group, ->(group) { where(group: group).ordered }
end
