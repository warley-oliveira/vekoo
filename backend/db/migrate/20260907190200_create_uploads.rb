# A imagem que a pessoa envia no editor.
#
# Tabela própria, e não `has_many_attached` no carrossel, porque a imagem é
# escolhida **antes** de o documento ser salvo, vive dentro do jsonb e é
# reusável entre cards e carrosséis. O upload precisa de id estável e de dono
# desde o primeiro instante.
class CreateUploads < ActiveRecord::Migration[8.1]
  def change
    create_table :uploads, id: :uuid do |t|
      t.references :organization, type: :uuid, null: false, foreign_key: true
      # Quem enviou. Opcional: a conta pode sair da organização sem levar a
      # imagem junto — o carrossel que a usa continua de pé.
      t.references :account, type: :uuid, foreign_key: { on_delete: :nullify }

      t.string :filename, null: false
      t.string :content_type, null: false
      t.bigint :byte_size, null: false
      t.integer :width
      t.integer :height

      t.timestamps
    end

    add_index :uploads, [ :organization_id, :created_at ]
  end
end
