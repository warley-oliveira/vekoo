# Paleta pronta do carrossel. `key` é também a chave de tradução do nome
# visível (`editor.appearance.themes.<key>` no front).
class ThemePreset < ApplicationRecord
  validates :key, presence: true, uniqueness: true
  validates :theme, presence: true

  scope :ordered, -> { order(:position) }
end
