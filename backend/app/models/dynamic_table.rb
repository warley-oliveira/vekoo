# Tabela livre criada por um script (`collection.*`). Sempre de uma organização: a mesma
# tabela pode existir em várias, e nenhuma enxerga a da outra.
class DynamicTable
  include Mongoid::Document

  field :name, type: String
  field :organization_id, type: String

  validates :name, presence: true, uniqueness: { scope: :organization_id }
  validates :organization_id, presence: true

  has_many :dynamic_records, dependent: :delete_all

  index({ organization_id: 1, name: 1 }, { unique: true })
end
