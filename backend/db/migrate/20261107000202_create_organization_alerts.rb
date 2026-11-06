# Inconsistência detectada pelo sistema, escopada à organização (conector caído,
# webhook falhando…). Qualquer domínio cria e resolve pelo concern `Alertable`.
class CreateOrganizationAlerts < ActiveRecord::Migration[8.1]
  def change
    create_table :organization_alerts, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :category, null: false
      t.string :severity, null: false, default: "error"
      t.string :origin_type, null: false
      t.string :origin_id, null: false
      t.string :origin_name
      t.string :code, null: false
      t.string :message
      t.jsonb :metadata, null: false, default: {}
      t.datetime :resolved_at
      t.timestamps

      t.index %i[organization_id category]
      t.index %i[organization_id resolved_at]
      # Um alerta ativo por origem + código. Sem o índice, dois jobs que veem o
      # mesmo erro ao mesmo tempo criariam duas linhas e o badge contaria 2.
      t.index %i[organization_id origin_type origin_id code],
        unique: true,
        where: "resolved_at IS NULL",
        name: "idx_organization_alerts_one_active_per_origin"
    end
  end
end
