module Products
  # Uma linha do CSV que FALHOU. Sucesso não gera registro — o volume não
  # justificaria e o contador do Products::Import já responde "quantas passaram".
  class ImportRow < ApplicationRecord
    belongs_to :import, class_name: "Products::Import", foreign_key: :product_import_id, inverse_of: :rows

    validates :line_number, presence: true
    validates :error_message, presence: true
  end
end
