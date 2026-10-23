# Uma logo deixa de ser "o arquivo de tipo logo" e vira um **grupo**: as
# variantes (clara, escura) de um mesmo desenho dividem um `logo_id`. É o que
# permite à marca guardar várias logos — as três opções do logotipo, as
# enviadas — e o documento apontar qual é a principal
# (`document.assets.primaryLogoId`), versionada como o resto.
#
# `meta` guarda de onde a logo veio e, no logotipo, o estilo do desenho.
class AddLogoGroupsToBrandAssets < ActiveRecord::Migration[8.1]
  def up
    add_column :brand_assets, :logo_id, :uuid
    add_column :brand_assets, :meta, :jsonb, default: {}, null: false
    add_index :brand_assets, %i[brand_core_id logo_id]

    # As logos que já existem: o logotipo nosso é um par (claro + escuro); as
    # enviadas viram um par com a primeira de cada variante, e as que sobram,
    # uma logo cada.
    execute(<<~SQL).each { |row| backfill(row["brand_core_id"]) }
      SELECT DISTINCT brand_core_id FROM brand_assets WHERE kind = 'logo'
    SQL
  end

  def down
    remove_index :brand_assets, %i[brand_core_id logo_id]
    remove_column :brand_assets, :meta
    remove_column :brand_assets, :logo_id
  end

  private

  def backfill(brand_core_id)
    rows = select_all(<<~SQL, "logos", [ brand_core_id ]).to_a
      SELECT id, variant, generated FROM brand_assets
      WHERE kind = 'logo' AND brand_core_id = $1 ORDER BY created_at
    SQL

    generated, uploaded = rows.partition { |row| row["generated"] }
    group(generated, "onboarding") if generated.any?

    pair = %w[light dark].filter_map { |variant| uploaded.find { |row| row["variant"] == variant } }
    group(pair, "upload") if pair.any?
    (uploaded - pair).each { |row| group([ row ], "upload") }
  end

  def group(rows, origin)
    logo_id = SecureRandom.uuid
    meta = { "origin" => origin }
    meta["style"] = "asWritten" if origin == "onboarding"
    exec_update(
      "UPDATE brand_assets SET logo_id = $1, meta = $2 WHERE id = ANY($3::uuid[])",
      "logo group",
      [ logo_id, meta.to_json, "{#{rows.map { |row| row["id"] }.join(",")}}" ]
    )
  end
end
