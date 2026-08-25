# Peça da biblioteca de imagens da ferramenta: não é foto, é fundo desenhado
# (cor de base + camadas de gradiente radial). `key` é a chave de tradução do
# nome visível.
class LibraryImage < ApplicationRecord
  validates :key, presence: true, uniqueness: true
  validates :base, presence: true

  scope :ordered, -> { order(:position) }
end
