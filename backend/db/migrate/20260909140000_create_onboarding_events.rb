# A telemetria do funil de onboarding — e o custo de IA de cada marca criada.
#
# Uma linha por evento: viu a pergunta, respondeu, pulou, pediu "cria pra mim",
# terminou. É o que responde "em que pergunta as pessoas param" com um GROUP BY
# em vez de uma varredura de jsonb marca a marca, e agrega entre contas.
#
# O custo mora aqui pelo mesmo motivo que mora no `agent_turns`: quem paga a
# conta precisa saber quanto custa criar uma marca, e o número tem que
# sobreviver à marca ser apagada — daí `on_delete: :nullify` na marca.
class CreateOnboardingEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :onboarding_events, id: :uuid do |t|
      t.references :organization, null: false, foreign_key: true, type: :uuid
      t.references :brand_core, foreign_key: { on_delete: :nullify }, type: :uuid
      t.references :account, foreign_key: { on_delete: :nullify }, type: :uuid

      t.string :step, null: false
      t.string :action, null: false
      # `suggest` guarda o que foi proposto (paletas, pares de fonte, vozes) —
      # é o que permite saber, depois, se a pessoa aceitou a primeira opção ou
      # a terceira.
      t.jsonb :payload, null: false, default: {}

      t.string :model
      t.jsonb :usage, null: false, default: {}
      t.integer :cost_micro_usd, null: false, default: 0

      t.datetime :created_at, null: false
    end

    add_index :onboarding_events, [ :organization_id, :created_at ]
    add_index :onboarding_events, [ :brand_core_id, :created_at ]
    add_index :onboarding_events, [ :step, :action ]
  end
end
