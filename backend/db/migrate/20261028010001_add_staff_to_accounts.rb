# Conta da Vekoo: quem cura o banco de referências e entra na área `/admin`.
# Não é papel da organização (`role`) — é de quem opera a plataforma, e por
# isso nenhuma tela do assinante liga ou desliga isto (`bin/rails staff:grant`).
class AddStaffToAccounts < ActiveRecord::Migration[8.1]
  def change
    add_column :accounts, :staff, :boolean, null: false, default: false
  end
end
