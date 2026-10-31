# O que o post exige que a marca tenha (foto do produto, pessoa da marca,
# cliente, espaço, evento, promoção): reflexo de `analysis.replicability.requires`,
# em coluna para a recuperação cruzar com o que a marca tem sem abrir o jsonb.
class AddRequiresToReferenceCards < ActiveRecord::Migration[8.1]
  def change
    add_column :reference_cards, :requires, :string, array: true, default: [], null: false
  end
end
