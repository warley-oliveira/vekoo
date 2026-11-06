# Registro de uma `DynamicTable`. Não tem organização própria: a organização é a da tabela, e
# todo acesso passa por ela. Nunca busque só pelo id do registro.
class DynamicRecord
  include Mongoid::Document

  field :data, type: Hash, default: {}

  belongs_to :dynamic_table

  # O `_id` no índice serve à ordem padrão das consultas (`order_by(_id: 1)`).
  index({ dynamic_table_id: 1, _id: 1 })

  def to_data
    data.merge("id" => id.to_s)
  end
end
