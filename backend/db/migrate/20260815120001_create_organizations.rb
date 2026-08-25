# A organização é a unidade de cobrança e de posse: todo carrossel, pasta e
# aviso nasce dentro de uma. Quem cria a conta cria a organização e entra como
# dono — é ela que vai receber as pessoas convidadas mais adiante.
class CreateOrganizations < ActiveRecord::Migration[8.1]
  def change
    create_table :organizations, id: :uuid do |t|
      t.string :name, null: false
      t.string :plan, null: false, default: "free"
      # Créditos de geração: o total do plano e o quanto já foi consumido.
      t.integer :credits_total, null: false, default: 50
      t.integer :credits_used, null: false, default: 0

      t.timestamps
    end

    add_check_constraint :organizations,
      "credits_used >= 0 AND credits_used <= credits_total",
      name: "organizations_credits_within_total"
  end
end
