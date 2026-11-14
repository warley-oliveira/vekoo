# Marca o ativo que a Vekoo desenhou (hoje, o logotipo tipográfico de quem não
# tem logo). Serve para regerá-lo quando a fonte ou a cor mudam — e para nunca
# apagar por engano um arquivo que a pessoa enviou.
class AddGeneratedToBrandAssets < ActiveRecord::Migration[8.1]
  def change
    add_column :brand_assets, :generated, :boolean, null: false, default: false
  end
end
