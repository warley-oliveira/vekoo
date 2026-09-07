# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_09_07_190200) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "accounts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "name", null: false
    t.uuid "organization_id", null: false
    t.string "password_digest", null: false
    t.string "role", default: "member", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_accounts_on_email", unique: true
    t.index ["organization_id"], name: "index_accounts_on_organization_id"
  end

  create_table "active_storage_attachments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "blob_id", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.uuid "record_id", null: false
    t.string "record_type", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.string "content_type"
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.string "key", null: false
    t.text "metadata"
    t.string "service_name", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "carousels", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "caption"
    t.jsonb "cards", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "edited_at", null: false
    t.boolean "favorite", default: false, null: false
    t.uuid "folder_id"
    t.string "format", default: "4:5", null: false
    t.uuid "organization_id", null: false
    t.jsonb "theme", default: {}, null: false
    t.string "title", null: false
    t.datetime "trashed_at"
    t.datetime "updated_at", null: false
    t.index ["folder_id"], name: "index_carousels_on_folder_id"
    t.index ["organization_id", "favorite"], name: "index_carousels_on_organization_id_and_favorite"
    t.index ["organization_id", "trashed_at", "edited_at"], name: "idx_on_organization_id_trashed_at_edited_at_28a7be86a4"
    t.index ["organization_id"], name: "index_carousels_on_organization_id"
  end

  create_table "folders", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "color", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.uuid "organization_id", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "name"], name: "index_folders_on_organization_id_and_name"
    t.index ["organization_id"], name: "index_folders_on_organization_id"
  end

  create_table "library_images", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "base", null: false
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.jsonb "layers", default: [], null: false
    t.integer "position", default: 0, null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_library_images_on_key", unique: true
  end

  create_table "notifications", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.datetime "notified_at", null: false
    t.uuid "organization_id", null: false
    t.boolean "read", default: false, null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "notified_at"], name: "index_notifications_on_organization_id_and_notified_at"
    t.index ["organization_id"], name: "index_notifications_on_organization_id"
  end

  create_table "organizations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "credits_total", default: 50, null: false
    t.integer "credits_used", default: 0, null: false
    t.string "name", null: false
    t.string "plan", default: "free", null: false
    t.datetime "updated_at", null: false
    t.check_constraint "credits_used >= 0 AND credits_used <= credits_total", name: "organizations_credits_within_total"
  end

  create_table "palette_colors", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "group", null: false
    t.string "key"
    t.integer "position", default: 0, null: false
    t.datetime "updated_at", null: false
    t.string "value", null: false
    t.index ["group", "position"], name: "index_palette_colors_on_group_and_position"
    t.index ["group", "value"], name: "index_palette_colors_on_group_and_value", unique: true
  end

  create_table "password_resets", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id", null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "token_digest", null: false
    t.datetime "updated_at", null: false
    t.datetime "used_at"
    t.index ["account_id"], name: "index_password_resets_on_account_id"
    t.index ["token_digest"], name: "index_password_resets_on_token_digest", unique: true
  end

  create_table "sessions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id", null: false
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "ip_address"
    t.datetime "last_used_at"
    t.string "token_digest", null: false
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.index ["account_id"], name: "index_sessions_on_account_id"
    t.index ["token_digest"], name: "index_sessions_on_token_digest", unique: true
  end

  create_table "theme_presets", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key", null: false
    t.integer "position", default: 0, null: false
    t.jsonb "theme", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_theme_presets_on_key", unique: true
  end

  create_table "uploads", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id"
    t.bigint "byte_size", null: false
    t.string "content_type", null: false
    t.datetime "created_at", null: false
    t.string "filename", null: false
    t.integer "height"
    t.uuid "organization_id", null: false
    t.datetime "updated_at", null: false
    t.integer "width"
    t.index ["account_id"], name: "index_uploads_on_account_id"
    t.index ["organization_id", "created_at"], name: "index_uploads_on_organization_id_and_created_at"
    t.index ["organization_id"], name: "index_uploads_on_organization_id"
  end

  add_foreign_key "accounts", "organizations"
  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "carousels", "folders", on_delete: :nullify
  add_foreign_key "carousels", "organizations"
  add_foreign_key "folders", "organizations"
  add_foreign_key "notifications", "organizations"
  add_foreign_key "password_resets", "accounts"
  add_foreign_key "sessions", "accounts"
  add_foreign_key "uploads", "accounts", on_delete: :nullify
  add_foreign_key "uploads", "organizations"
end
