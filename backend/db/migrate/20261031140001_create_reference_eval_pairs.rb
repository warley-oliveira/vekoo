# O teste lado a lado da Fase 3: cada par é um pedido gerado duas vezes — com
# e sem os padrões do banco de referências — e mostrado às cegas à curadoria.
# Os lados são sorteados ao criar o par; a tela nunca recebe `*_arm`.
#
# Guarda as peças, e não os turnos: a conversa some em 30 dias (é andaime), a
# peça fica.
class CreateReferenceEvalPairs < ActiveRecord::Migration[8.1]
  def change
    create_table :reference_eval_pairs, id: :uuid do |t|
      t.string :round, null: false
      t.integer :position, null: false
      t.references :brand_core, type: :uuid, null: false, foreign_key: { on_delete: :cascade }
      t.string :request_key, null: false
      t.text :request_text, null: false
      t.string :objective
      # Par de controle: os dois lados sem referência, para medir quanto o
      # modelo varia sozinho.
      t.boolean :control, null: false, default: false
      t.string :left_arm, null: false
      t.string :right_arm, null: false
      t.uuid :left_piece_ids, array: true, null: false, default: []
      t.uuid :right_piece_ids, array: true, null: false, default: []
      t.integer :left_cost_micro_usd, null: false, default: 0
      t.integer :right_cost_micro_usd, null: false, default: 0
      t.string :verdict
      t.integer :usable_left
      t.integer :usable_right
      t.string :reasons, array: true, null: false, default: []
      # Os lados em que alguma peça parece cópia de um post real: barra ligar.
      t.string :copied_sides, array: true, null: false, default: []
      t.text :notes
      t.references :decided_by, type: :uuid, foreign_key: { to_table: :accounts, on_delete: :nullify }
      t.datetime :decided_at
      t.timestamps
    end
    add_index :reference_eval_pairs, %i[round position], unique: true
  end
end
