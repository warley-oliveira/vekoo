module Products
  # Vetor de um Products::Item, em tabela separada para que o vector(512) (~2 KB)
  # nunca seja carregado pelas queries de listagem.
  #
  # `source_hash` é o SHA do texto que gerou o vetor: se o item foi salvo mas o
  # texto indexável não mudou, o job de embedding pula a chamada à OpenAI.
  class Embedding < ApplicationRecord
    belongs_to :item, class_name: "Products::Item", foreign_key: :product_item_id, inverse_of: :embedding_record
    belongs_to :organization

    has_neighbors :embedding

    validates :source_hash, presence: true
    validates :model, presence: true
  end
end
