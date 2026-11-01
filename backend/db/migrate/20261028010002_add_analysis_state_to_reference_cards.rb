# O andamento da análise de uma referência (o job que manda as imagens ao
# modelo) separado da curadoria (`status`): o card fica em rascunho enquanto a
# análise espera, roda ou falha, e só vai para revisão quando ela termina.
#
# `copy_shingles` guarda resumos (SHA-256) de cada janela de palavras do texto
# visível no post — nunca o texto. É com eles que a curadoria e a publicação
# conferem que a análise não repete frase do post.
class AddAnalysisStateToReferenceCards < ActiveRecord::Migration[8.1]
  def change
    change_table :reference_cards, bulk: true do |t|
      t.string :analysis_status, null: false, default: "pending"
      t.jsonb :analysis_error
      t.string :analysis_model
      t.jsonb :analysis_usage, null: false, default: {}
      t.bigint :analysis_cost_micro_usd, null: false, default: 0
      t.datetime :analyzed_at
      t.datetime :embedded_at
      t.string :copy_shingles, array: true, null: false, default: []
    end
    add_index :reference_cards, :analysis_status
  end
end
