# Metas de receita por mês: a do funil inteiro e a de cada pessoa.
class CreatePipelineGoals < ActiveRecord::Migration[8.1]
  def change
    create_table :pipeline_goals, id: :uuid do |t|
      t.references :board, null: false, type: :uuid, index: false,
        foreign_key: { to_table: :pipeline_boards, on_delete: :cascade }
      t.string :scope, null: false
      t.references :assigned_account, type: :uuid, index: true,
        foreign_key: { to_table: :accounts, on_delete: :cascade }
      t.date :period_month, null: false
      t.string :metric, null: false, default: "revenue"
      t.decimal :target_value, precision: 12, scale: 2, null: false
      t.uuid :created_by_id

      t.timestamps
    end

    add_foreign_key :pipeline_goals, :accounts, column: :created_by_id, on_delete: :nullify
    # `nulls_not_distinct`: a meta do funil não tem pessoa, e com o NULL distinto do padrão o índice
    # deixaria duas metas de funil no mesmo mês, numa corrida com a validação.
    add_index :pipeline_goals, %i[board_id scope assigned_account_id period_month], unique: true,
      nulls_not_distinct: true, name: "index_pipeline_goals_unique"
  end
end
