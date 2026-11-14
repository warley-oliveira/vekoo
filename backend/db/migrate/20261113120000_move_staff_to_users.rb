# `staff` (a pessoa da Vekoo que cura o banco de referências e entra no `/admin`) nasceu na `main`
# como coluna de `accounts`, quando a conta ainda era a pessoa. Com a pessoa em `users` e a conta
# virando o vínculo com uma organização, ela é da pessoa: vale em todas as organizações dela.
#
# `sessions.acting_organization_id` (a organização interna em que a sessão de staff agia) sai: a
# organização de cada requisição vem do vínculo em `X-Account`, e staff entra numa organização
# interna pela entrada do suporte (`Support::Entry`), com um vínculo de suporte, como o `master`.
#
# Roda depois de `SplitUsersFromAccounts` em qualquer ordem de chegada: num banco novo as duas da
# `main` vêm antes da separação (timestamps de outubro); num banco que já tinha a separação, elas
# entram agora, antes desta.
class MoveStaffToUsers < ActiveRecord::Migration[8.1]
  def up
    add_column :users, :staff, :boolean, null: false, default: false

    if column_exists?(:accounts, :staff)
      execute "UPDATE users SET staff = true WHERE id IN (SELECT user_id FROM accounts WHERE staff)"
      remove_column :accounts, :staff
    end

    remove_reference :sessions, :acting_organization, type: :uuid, index: true,
      foreign_key: { to_table: :organizations, on_delete: :nullify } if column_exists?(:sessions, :acting_organization_id)
  end

  def down
    add_reference :sessions, :acting_organization, type: :uuid, null: true,
      foreign_key: { to_table: :organizations, on_delete: :nullify }
    add_column :accounts, :staff, :boolean, null: false, default: false
    execute "UPDATE accounts SET staff = true WHERE user_id IN (SELECT id FROM users WHERE staff)"
    remove_column :users, :staff
  end
end
