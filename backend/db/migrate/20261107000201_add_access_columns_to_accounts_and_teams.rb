# Colunas que a gestão de pessoas da origem usa e a fundação ainda não trazia:
#
#   accounts.setup_only — "não atribuir atendimentos": a pessoa administra, mas
#                         não entra nas listas de atribuição do chat e dos funis.
#   teams.active        — departamento desativado continua existindo, com histórico.
class AddAccessColumnsToAccountsAndTeams < ActiveRecord::Migration[8.1]
  def change
    add_column :accounts, :setup_only, :boolean, null: false, default: false
    add_column :teams, :active, :boolean, null: false, default: true
  end
end
