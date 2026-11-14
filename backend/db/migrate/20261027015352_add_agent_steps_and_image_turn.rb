# A foto virou ferramenta do agente: o turno guarda a trilha do que fez
# enquanto pensava (`steps`, ao vivo na tela) e a geração sabe de que turno
# saiu. `nullify` porque a conversa some em 30 dias e a foto fica na marca.
class AddAgentStepsAndImageTurn < ActiveRecord::Migration[8.1]
  def change
    add_column :agent_turns, :steps, :jsonb, null: false, default: []
    add_reference :image_generations, :agent_turn, type: :uuid, foreign_key: { on_delete: :nullify }, index: true
  end
end
