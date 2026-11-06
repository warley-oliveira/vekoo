# Quadros e etapas (na origem, `kanban_boards` e `kanban_columns`).
class CreatePipelineBoardsAndStages < ActiveRecord::Migration[8.1]
  def change
    create_table :pipeline_boards, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :name, null: false
      t.text :description
      t.integer :position, null: false, default: 0
      t.string :color
      t.string :icon
      t.string :template_key
      t.boolean :archived, null: false, default: false
      t.string :board_type, null: false, default: "standard"

      # Arquivamento automático: card parado há X dias e negócio fechado há X dias.
      t.integer :auto_archive_days
      t.string :deal_close_behavior, null: false, default: "manual"
      t.integer :deal_close_archive_days
      t.integer :deal_rotting_days, default: 7

      t.string :lead_score_field_key
      t.integer :lead_score_low, null: false, default: 30
      t.integer :lead_score_high, null: false, default: 70
      t.boolean :require_fields_on_deal_won, null: false, default: false
      t.boolean :require_fields_on_deal_lost, null: false, default: false

      # `assigned`: cada pessoa só alcança os cards atribuídos a ela, salvo os grupos daqui.
      t.string :card_visibility, null: false, default: "all"
      t.uuid :card_visibility_bypass_role_ids, array: true, null: false, default: []

      t.timestamps
    end

    add_index :pipeline_boards, %i[organization_id archived position]

    create_table :pipeline_stages, id: :uuid do |t|
      t.references :board, null: false, type: :uuid, index: false,
        foreign_key: { to_table: :pipeline_boards, on_delete: :cascade }
      t.string :name, null: false
      t.integer :position
      t.string :color
      t.integer :wip_limit
      t.integer :sla_hours

      t.timestamps
    end

    add_index :pipeline_stages, %i[board_id position]
    # A varredura de SLA só olha as etapas que têm SLA.
    add_index :pipeline_stages, :sla_hours, where: "sla_hours IS NOT NULL"

    # Modelos de quadro: globais, sem organização, como na origem.
    create_table :pipeline_board_templates, id: :uuid do |t|
      t.string :name, null: false
      t.text :description
      t.string :template_key, null: false
      t.jsonb :stages_config, null: false, default: []
      t.jsonb :custom_fields_config, null: false, default: []
      t.jsonb :triggers_config, null: false, default: []
      t.string :icon
      t.string :color
      t.string :default_board_type, null: false, default: "standard"

      t.timestamps
    end

    add_index :pipeline_board_templates, :template_key, unique: true
  end
end
