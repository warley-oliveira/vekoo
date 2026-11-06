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

ActiveRecord::Schema[8.1].define(version: 2026_11_07_000309) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "vector"

  create_table "access_roles", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.uuid "organization_id", null: false
    t.jsonb "permissions", default: {}, null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "name"], name: "index_access_roles_on_organization_id_and_name", unique: true
    t.index ["organization_id"], name: "index_access_roles_on_organization_id"
  end

  create_table "accounts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "access_role_id"
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.datetime "last_seen_at"
    t.string "locale"
    t.string "name", null: false
    t.uuid "organization_id", null: false
    t.string "password_digest", null: false
    t.string "phone"
    t.datetime "revoked_at"
    t.string "role", default: "member", null: false
    t.boolean "setup_only", default: false, null: false
    t.datetime "updated_at", null: false
    t.index ["access_role_id"], name: "index_accounts_on_access_role_id"
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

  create_table "daily_chat_stats", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.date "day", null: false
    t.jsonb "hourly_breakdown", default: {}, null: false
    t.jsonb "metrics", default: {}, null: false
    t.uuid "organization_id", null: false
    t.datetime "updated_at", null: false
    t.index ["metrics"], name: "index_daily_chat_stats_on_metrics", using: :gin
    t.index ["organization_id", "day"], name: "index_daily_chat_stats_on_organization_id_and_day", unique: true
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

  create_table "oauth_credentials", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "client_id", null: false
    t.text "client_secret", null: false
    t.datetime "created_at", null: false
    t.string "endpoint", null: false
    t.datetime "expires_at"
    t.string "key_name", null: false
    t.uuid "organization_id", null: false
    t.text "token_data"
    t.datetime "updated_at", null: false
    t.index ["organization_id", "key_name"], name: "index_oauth_credentials_on_organization_id_and_key_name", unique: true
  end

  create_table "organization_alerts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "category", null: false
    t.string "code", null: false
    t.datetime "created_at", null: false
    t.string "message"
    t.jsonb "metadata", default: {}, null: false
    t.uuid "organization_id", null: false
    t.string "origin_id", null: false
    t.string "origin_name"
    t.string "origin_type", null: false
    t.datetime "resolved_at"
    t.string "severity", default: "error", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "category"], name: "index_organization_alerts_on_organization_id_and_category"
    t.index ["organization_id", "origin_type", "origin_id", "code"], name: "idx_organization_alerts_one_active_per_origin", unique: true, where: "(resolved_at IS NULL)"
    t.index ["organization_id", "resolved_at"], name: "index_organization_alerts_on_organization_id_and_resolved_at"
  end

  create_table "organizations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "credits_total", default: 50, null: false
    t.integer "credits_used", default: 0, null: false
    t.jsonb "features", default: {}, null: false
    t.string "name", null: false
    t.string "plan", default: "free", null: false
    t.jsonb "settings", default: {}, null: false
    t.string "timezone", default: "America/Sao_Paulo", null: false
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

  create_table "product_categories", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "items_count", default: 0, null: false
    t.string "name", null: false
    t.uuid "organization_id", null: false
    t.uuid "parent_id"
    t.string "path", null: false
    t.integer "position", default: 0, null: false
    t.string "slug", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "parent_id", "position"], name: "index_product_categories_on_organization_parent_position"
    t.index ["organization_id", "path"], name: "index_product_categories_on_organization_id_and_path", unique: true, opclass: { path: :text_pattern_ops }
    t.index ["parent_id"], name: "index_product_categories_on_parent_id"
  end

  create_table "product_embeddings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.vector "embedding", limit: 512
    t.string "model", null: false
    t.uuid "organization_id", null: false
    t.uuid "product_item_id", null: false
    t.string "source_hash", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "product_item_id"], name: "index_product_embeddings_on_organization_and_item"
    t.index ["product_item_id"], name: "index_product_embeddings_on_product_item_id", unique: true
  end

  create_table "product_field_definitions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "default_value"
    t.string "description"
    t.string "key", null: false
    t.string "name", null: false
    t.string "option_values", default: [], null: false, array: true
    t.uuid "organization_id", null: false
    t.integer "position", default: 0, null: false
    t.boolean "required", default: false, null: false
    t.boolean "searchable", default: true, null: false
    t.datetime "updated_at", null: false
    t.string "value_type", null: false
    t.index ["organization_id", "key"], name: "index_product_field_definitions_on_organization_and_key", unique: true
    t.index ["organization_id", "position"], name: "index_product_field_definitions_on_organization_and_position"
  end

  create_table "product_images", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "alt"
    t.datetime "created_at", null: false
    t.integer "position", default: 0, null: false
    t.uuid "product_item_id", null: false
    t.string "source_url"
    t.datetime "updated_at", null: false
    t.index ["product_item_id", "position"], name: "index_product_images_on_product_item_id_and_position"
  end

  create_table "product_import_rows", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "error_message", null: false
    t.integer "line_number", null: false
    t.uuid "product_import_id", null: false
    t.jsonb "raw", default: {}, null: false
    t.datetime "updated_at", null: false
    t.index ["product_import_id", "line_number"], name: "index_product_import_rows_on_product_import_id_and_line_number"
  end

  create_table "product_imports", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id"
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.integer "created_count", default: 0, null: false
    t.string "delimiter"
    t.integer "error_count", default: 0, null: false
    t.jsonb "error_sample", default: [], null: false
    t.string "filename"
    t.jsonb "mapping", default: {}, null: false
    t.jsonb "options", default: {}, null: false
    t.uuid "organization_id", null: false
    t.integer "processed_rows", default: 0, null: false
    t.datetime "started_at"
    t.string "status", default: "pending", null: false
    t.integer "total_rows", default: 0, null: false
    t.datetime "updated_at", null: false
    t.integer "updated_count", default: 0, null: false
    t.index ["account_id"], name: "index_product_imports_on_account_id"
    t.index ["organization_id", "created_at"], name: "index_product_imports_on_organization_id_and_created_at"
    t.index ["organization_id", "status"], name: "index_product_imports_on_organization_id_and_status"
    t.index ["status", "updated_at"], name: "index_product_imports_on_status_and_updated_at"
  end

  create_table "product_item_categories", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.uuid "product_category_id", null: false
    t.uuid "product_item_id", null: false
    t.datetime "updated_at", null: false
    t.index ["product_category_id"], name: "index_product_item_categories_on_product_category_id"
    t.index ["product_item_id", "product_category_id"], name: "index_product_item_categories_uniqueness", unique: true
  end

  create_table "product_items", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.jsonb "custom_fields", default: {}, null: false
    t.text "description"
    t.string "external_id"
    t.text "index_text_primary"
    t.text "index_text_secondary"
    t.uuid "organization_id", null: false
    t.virtual "search_document", type: :tsvector, as: "(setweight(to_tsvector('portuguese'::regconfig, COALESCE(index_text_primary, ''::text)), 'A'::\"char\") || setweight(to_tsvector('portuguese'::regconfig, COALESCE(index_text_secondary, ''::text)), 'B'::\"char\"))", stored: true
    t.string "summary", limit: 1500
    t.string "tags", default: [], null: false, array: true
    t.string "title", limit: 300, null: false
    t.datetime "updated_at", null: false
    t.string "url"
    t.index ["custom_fields"], name: "index_product_items_on_custom_fields", opclass: :jsonb_path_ops, using: :gin
    t.index ["organization_id", "active"], name: "index_product_items_on_organization_id_and_active"
    t.index ["organization_id", "created_at"], name: "index_product_items_on_organization_id_and_created_at"
    t.index ["organization_id", "external_id"], name: "index_product_items_on_organization_and_external_id", unique: true
    t.index ["search_document"], name: "index_product_items_on_search_document", using: :gin
    t.index ["tags"], name: "index_product_items_on_tags", using: :gin
  end

  create_table "push_devices", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id", null: false
    t.text "auth_key", null: false
    t.datetime "created_at", null: false
    t.text "endpoint", null: false
    t.uuid "organization_id", null: false
    t.text "p256dh_key", null: false
    t.datetime "updated_at", null: false
    t.text "user_agent"
    t.index ["account_id"], name: "index_push_devices_on_account_id"
    t.index ["endpoint"], name: "index_push_devices_on_endpoint", unique: true
    t.index ["organization_id"], name: "index_push_devices_on_organization_id"
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

  create_table "team_memberships", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id", null: false
    t.datetime "created_at", null: false
    t.uuid "team_id", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_team_memberships_on_account_id"
    t.index ["team_id", "account_id"], name: "index_team_memberships_on_team_id_and_account_id", unique: true
    t.index ["team_id"], name: "index_team_memberships_on_team_id"
  end

  create_table "teams", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.boolean "active", default: true, null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.uuid "organization_id", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "name"], name: "index_teams_on_organization_id_and_name", unique: true
    t.index ["organization_id"], name: "index_teams_on_organization_id"
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

  add_foreign_key "access_roles", "organizations", on_delete: :cascade
  add_foreign_key "accounts", "access_roles", on_delete: :nullify
  add_foreign_key "accounts", "organizations"
  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "carousels", "folders", on_delete: :nullify
  add_foreign_key "carousels", "organizations"
  add_foreign_key "daily_chat_stats", "organizations", on_delete: :cascade
  add_foreign_key "folders", "organizations"
  add_foreign_key "notifications", "organizations"
  add_foreign_key "oauth_credentials", "organizations", on_delete: :cascade
  add_foreign_key "organization_alerts", "organizations", on_delete: :cascade
  add_foreign_key "password_resets", "accounts"
  add_foreign_key "product_categories", "organizations", on_delete: :cascade
  add_foreign_key "product_categories", "product_categories", column: "parent_id", on_delete: :cascade
  add_foreign_key "product_embeddings", "organizations", on_delete: :cascade
  add_foreign_key "product_embeddings", "product_items", on_delete: :cascade
  add_foreign_key "product_field_definitions", "organizations", on_delete: :cascade
  add_foreign_key "product_images", "product_items", on_delete: :cascade
  add_foreign_key "product_import_rows", "product_imports", on_delete: :cascade
  add_foreign_key "product_imports", "accounts", on_delete: :nullify
  add_foreign_key "product_imports", "organizations", on_delete: :cascade
  add_foreign_key "product_item_categories", "product_categories", on_delete: :cascade
  add_foreign_key "product_item_categories", "product_items", on_delete: :cascade
  add_foreign_key "product_items", "organizations", on_delete: :cascade
  add_foreign_key "push_devices", "accounts", on_delete: :cascade
  add_foreign_key "push_devices", "organizations", on_delete: :cascade
  add_foreign_key "sessions", "accounts"
  add_foreign_key "team_memberships", "accounts", on_delete: :cascade
  add_foreign_key "team_memberships", "teams", on_delete: :cascade
  add_foreign_key "teams", "organizations", on_delete: :cascade
  add_foreign_key "uploads", "accounts", on_delete: :nullify
  add_foreign_key "uploads", "organizations"
end
