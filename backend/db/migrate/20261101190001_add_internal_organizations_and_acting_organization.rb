class AddInternalOrganizationsAndActingOrganization < ActiveRecord::Migration[8.1]
  def up
    # Organização interna da Vekoo (hoje, a das marcas de teste): staff pode
    # entrar nela sem trocar de conta.
    add_column :organizations, :internal, :boolean, default: false, null: false
    # A organização em que a sessão de staff está agindo; nula = a da conta.
    add_reference :sessions, :acting_organization, type: :uuid, foreign_key: { to_table: :organizations, on_delete: :nullify }, null: true

    # A organização das marcas de teste já existe no dev e em produção.
    execute "UPDATE organizations SET internal = true WHERE name = 'Vekoo · teste de referências'"
  end

  def down
    remove_reference :sessions, :acting_organization, foreign_key: { to_table: :organizations }
    remove_column :organizations, :internal
  end
end
