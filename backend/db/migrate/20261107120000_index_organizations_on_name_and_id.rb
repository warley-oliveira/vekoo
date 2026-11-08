# A lista "Todas" do suporte anda por cursor em (nome, id): com milhares de organizações, o índice
# é o que deixa cada página no mesmo tempo da primeira.
class IndexOrganizationsOnNameAndId < ActiveRecord::Migration[8.1]
  def change
    add_index :organizations, %i[name id]
  end
end
