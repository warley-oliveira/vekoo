# A conversa de criação: a pessoa descreve o que quer, o agente escolhe o
# motor e preenche o manifesto, o sistema renderiza.
#
# Uma conversa por pedido em andamento (ela guarda o fio: "agora deixa o fundo
# mais escuro" precisa saber do que veio antes). Cada `agent_turn` é uma
# chamada ao modelo — com o que ela custou, porque é dessa soma que sai o
# controle de OPEX e, amanhã, o limite por plano.
#
# Retenção de 30 dias: a conversa é andaime, a peça é obra. `PurgeAgentConversationsJob`
# apaga as antigas e as peças ficam (`agent_turn_id` vira nulo).
class CreateAgentConversations < ActiveRecord::Migration[8.1]
  def change
    create_table :agent_conversations, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.references :brand_core, null: false, foreign_key: true, type: :uuid
      t.references :account, foreign_key: { on_delete: :nullify }, type: :uuid
      t.string :title, null: false
      t.datetime :last_turn_at

      t.timestamps
    end

    add_index :agent_conversations, [ :brand_core_id, :last_turn_at ]

    create_table :agent_turns, id: :uuid do |t|
      t.references :agent_conversation, null: false, foreign_key: true, type: :uuid
      # A organização também mora aqui, e não só na conversa: a soma de custo
      # do mês é a consulta mais quente do teto de OPEX, e ela não deveria
      # precisar de um join para acontecer.
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.references :account, foreign_key: { on_delete: :nullify }, type: :uuid

      t.string :kind, null: false, default: "create"
      t.string :status, null: false, default: "thinking"
      t.text :prompt, null: false
      # De que peça o ajuste partiu. Sem foreign key: a peça pode ser apagada e
      # o turno continua contando na conta do mês.
      t.uuid :base_piece_id
      # Ids de `BrandAsset` que a pessoa anexou ao pedido.
      t.jsonb :attachments, null: false, default: []

      # A decisão do agente, já validada contra os manifestos.
      t.jsonb :plan, null: false, default: {}
      # O que o agente perguntou quando faltou um dado essencial.
      t.text :question
      t.jsonb :error

      t.string :model
      t.jsonb :usage, null: false, default: {}
      # Custo em milionésimos de dólar: inteiro, para somar sem erro de ponto
      # flutuante. Uma geração fica na casa dos 40.000 (US$ 0,04).
      t.integer :cost_micro_usd, null: false, default: 0
      t.integer :credits_charged, null: false, default: 0

      t.timestamps
    end

    add_index :agent_turns, [ :agent_conversation_id, :created_at ]
    add_index :agent_turns, [ :organization_id, :created_at ]

    # A peça lembra de que pedido nasceu — e sobrevive à faxina da conversa.
    add_reference :pieces, :agent_turn, type: :uuid,
      foreign_key: { on_delete: :nullify }, index: true
  end
end
