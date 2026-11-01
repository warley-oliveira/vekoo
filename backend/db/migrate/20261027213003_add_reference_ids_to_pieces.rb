# Que cards do banco de referências o agente usou para compor a peça. É
# registro interno — a API do assinante não mostra — e serve para medir quais
# padrões dão certo. Sem chave estrangeira: card arquivado continua sendo
# história da peça.
class AddReferenceIdsToPieces < ActiveRecord::Migration[8.1]
  def change
    add_column :pieces, :reference_ids, :uuid, array: true, null: false, default: []
    add_index :pieces, :reference_ids, using: :gin
  end
end
