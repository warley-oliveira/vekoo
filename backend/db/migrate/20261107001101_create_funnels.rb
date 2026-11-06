# Funil sem assistente (decisão 1 do manifesto): na origem as colunas vinham das
# `classification_steps` do assistente. Aqui o funil é da organização, com etapas próprias, e a posição
# da conversa mora em `Chat#funnel_stages`, no Mongo.
class CreateFunnels < ActiveRecord::Migration[8.1]
  def change
    create_table :funnels, id: :uuid do |t|
      t.references :organization, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :name, null: false
      t.text :description

      t.timestamps
    end

    # O nome identifica o funil na tela e no bloco de fluxo: dois iguais não têm como ser distinguidos.
    add_index :funnels, "organization_id, lower(name)", unique: true, name: "index_funnels_on_organization_and_lower_name"

    create_table :funnel_stages, id: :uuid do |t|
      t.references :funnel, null: false, type: :uuid, foreign_key: { on_delete: :cascade }, index: false
      t.string :name, null: false
      t.integer :position, null: false, default: 0

      t.timestamps
    end

    # Sem unicidade em `position`: reordenar troca duas linhas em sequência, e o índice único
    # recusaria o passo intermediário.
    add_index :funnel_stages, %i[funnel_id position]
  end
end
