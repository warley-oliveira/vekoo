# Os cards do banco de referências que a busca ofereceu ao agente neste turno
# (no modo `shadow`, os que teria oferecido). Coluna interna: nenhum
# serializer a devolve — o assinante nunca vê o banco. É dela que sai a
# medida de "oferecido × usado" (`pieces.reference_ids`).
class AddOfferedReferenceIdsToAgentTurns < ActiveRecord::Migration[8.1]
  def change
    add_column :agent_turns, :offered_reference_ids, :uuid, array: true, default: [], null: false
  end
end
