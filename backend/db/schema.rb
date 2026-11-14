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

ActiveRecord::Schema[8.1].define(version: 2026_11_13_120000) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "vector"

  create_table "access_roles", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "name", null: false
    t.jsonb "permissions", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "name"], name: "index_access_roles_on_organization_id_and_name", unique: true
    t.index ["organization_id"], name: "index_access_roles_on_organization_id"
  end

  create_table "accounts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "role", default: "member", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "access_role_id"
    t.datetime "revoked_at"
    t.datetime "last_seen_at"
    t.boolean "setup_only", default: false, null: false
    t.uuid "user_id", null: false
    t.boolean "support", default: false, null: false
    t.bigserial "number", null: false
    t.index ["access_role_id"], name: "index_accounts_on_access_role_id"
    t.index ["number"], name: "index_accounts_on_number", unique: true
    t.index ["organization_id"], name: "index_accounts_on_organization_id"
    t.index ["user_id", "organization_id"], name: "index_accounts_on_user_id_and_organization_id", unique: true
  end

  create_table "active_storage_attachments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "name", null: false
    t.string "record_type", null: false
    t.uuid "record_id", null: false
    t.uuid "blob_id", null: false
    t.datetime "created_at", null: false
    t.index ["blob_id"], name: "index_active_storage_attachments_on_blob_id"
    t.index ["record_type", "record_id", "name", "blob_id"], name: "index_active_storage_attachments_uniqueness", unique: true
  end

  create_table "active_storage_blobs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "key", null: false
    t.string "filename", null: false
    t.string "content_type"
    t.text "metadata"
    t.string "service_name", null: false
    t.bigint "byte_size", null: false
    t.string "checksum"
    t.datetime "created_at", null: false
    t.index ["key"], name: "index_active_storage_blobs_on_key", unique: true
  end

  create_table "active_storage_variant_records", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "blob_id", null: false
    t.string "variation_digest", null: false
    t.index ["blob_id", "variation_digest"], name: "index_active_storage_variant_records_uniqueness", unique: true
  end

  create_table "agent_conversations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "brand_core_id", null: false
    t.uuid "account_id"
    t.string "title", null: false
    t.datetime "last_turn_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "purpose", default: "create", null: false
    t.index ["account_id"], name: "index_agent_conversations_on_account_id"
    t.index ["brand_core_id", "last_turn_at"], name: "index_agent_conversations_on_brand_core_id_and_last_turn_at"
    t.index ["brand_core_id"], name: "index_agent_conversations_on_brand_core_id"
    t.index ["brand_core_id"], name: "index_agent_conversations_one_onboarding_per_brand", unique: true, where: "((purpose)::text = 'onboarding'::text)"
    t.index ["organization_id"], name: "index_agent_conversations_on_organization_id"
  end

  create_table "agent_turns", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "agent_conversation_id", null: false
    t.uuid "organization_id", null: false
    t.uuid "account_id"
    t.string "kind", default: "create", null: false
    t.string "status", default: "thinking", null: false
    t.text "prompt", null: false
    t.uuid "base_piece_id"
    t.jsonb "attachments", default: [], null: false
    t.jsonb "plan", default: {}, null: false
    t.text "question"
    t.jsonb "error"
    t.string "model"
    t.jsonb "usage", default: {}, null: false
    t.integer "cost_micro_usd", default: 0, null: false
    t.integer "credits_charged", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "steps", default: [], null: false
    t.uuid "offered_reference_ids", default: [], null: false, array: true
    t.index ["account_id"], name: "index_agent_turns_on_account_id"
    t.index ["agent_conversation_id", "created_at"], name: "index_agent_turns_on_agent_conversation_id_and_created_at"
    t.index ["agent_conversation_id"], name: "index_agent_turns_on_agent_conversation_id"
    t.index ["organization_id", "created_at"], name: "index_agent_turns_on_organization_id_and_created_at"
    t.index ["organization_id"], name: "index_agent_turns_on_organization_id"
  end

  create_table "attachments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "name", null: false
    t.string "description"
    t.string "file_name"
    t.boolean "private", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "private", "created_at"], name: "idx_on_organization_id_private_created_at_ce6b95c8f9"
  end

  create_table "brand_assets", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "brand_core_id", null: false
    t.uuid "organization_id", null: false
    t.uuid "account_id"
    t.string "kind", null: false
    t.string "variant"
    t.string "filename", null: false
    t.string "content_type", null: false
    t.bigint "byte_size", null: false
    t.integer "width"
    t.integer "height"
    t.boolean "transparent"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "generated", default: false, null: false
    t.uuid "logo_id"
    t.jsonb "meta", default: {}, null: false
    t.text "description"
    t.string "shows", default: [], null: false, array: true
    t.datetime "described_at"
    t.integer "description_cost_micro_usd", default: 0, null: false
    t.index ["account_id"], name: "index_brand_assets_on_account_id"
    t.index ["brand_core_id", "kind", "created_at"], name: "index_brand_assets_on_brand_core_id_and_kind_and_created_at"
    t.index ["brand_core_id", "logo_id"], name: "index_brand_assets_on_brand_core_id_and_logo_id"
    t.index ["brand_core_id"], name: "index_brand_assets_on_brand_core_id"
    t.index ["organization_id"], name: "index_brand_assets_on_organization_id"
  end

  create_table "brand_core_versions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "brand_core_id", null: false
    t.uuid "account_id"
    t.integer "number", null: false
    t.jsonb "snapshot", default: {}, null: false
    t.jsonb "change_list", default: [], null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_brand_core_versions_on_account_id"
    t.index ["brand_core_id", "number"], name: "index_brand_core_versions_on_brand_core_id_and_number", unique: true
    t.index ["brand_core_id"], name: "index_brand_core_versions_on_brand_core_id"
  end

  create_table "brand_cores", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "status", default: "draft", null: false
    t.jsonb "document", default: {}, null: false
    t.jsonb "published_document"
    t.jsonb "progress", default: {}, null: false
    t.integer "current_version", default: 0, null: false
    t.datetime "published_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "created_at"], name: "index_brand_cores_on_organization_id_and_created_at"
  end

  create_table "carousels", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "folder_id"
    t.string "title", null: false
    t.string "format", default: "4:5", null: false
    t.text "caption"
    t.boolean "favorite", default: false, null: false
    t.jsonb "theme", default: {}, null: false
    t.jsonb "cards", default: [], null: false
    t.datetime "edited_at", null: false
    t.datetime "trashed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "brand_core_id"
    t.uuid "brand_core_version_id"
    t.index ["brand_core_id"], name: "index_carousels_on_brand_core_id"
    t.index ["brand_core_version_id"], name: "index_carousels_on_brand_core_version_id"
    t.index ["folder_id"], name: "index_carousels_on_folder_id"
    t.index ["organization_id", "favorite"], name: "index_carousels_on_organization_id_and_favorite"
    t.index ["organization_id", "trashed_at", "edited_at"], name: "idx_on_organization_id_trashed_at_edited_at_28a7be86a4"
    t.index ["organization_id"], name: "index_carousels_on_organization_id"
  end

  create_table "chat_views", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "account_id", null: false
    t.string "name", null: false
    t.jsonb "payload", default: [], null: false
    t.boolean "personal", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_chat_views_on_account_id"
    t.index ["organization_id", "personal"], name: "index_chat_views_on_organization_id_and_personal"
  end

  create_table "contact_import_rows", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "contact_import_id", null: false
    t.string "name", null: false
    t.string "phone", null: false
    t.jsonb "additional_data", default: {}, null: false
    t.string "status", default: "pending", null: false
    t.text "error_message"
    t.datetime "processed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["contact_import_id", "status"], name: "index_contact_import_rows_on_contact_import_id_and_status"
  end

  create_table "contact_imports", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "account_id"
    t.string "connector_id", null: false
    t.string "file_name"
    t.integer "total_contacts", null: false
    t.integer "imported_contacts_count", default: 0, null: false
    t.integer "errors_count", default: 0, null: false
    t.boolean "include_country_code", default: false, null: false
    t.integer "batch_index"
    t.integer "total_batches"
    t.string "status", default: "pending", null: false
    t.datetime "started_at"
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_contact_imports_on_account_id"
    t.index ["organization_id", "created_at"], name: "index_contact_imports_on_organization_id_and_created_at"
    t.index ["status", "updated_at"], name: "index_contact_imports_on_status_and_updated_at"
  end

  create_table "daily_chat_stats", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.date "day", null: false
    t.jsonb "metrics", default: {}, null: false
    t.jsonb "hourly_breakdown", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["metrics"], name: "index_daily_chat_stats_on_metrics", using: :gin
    t.index ["organization_id", "day"], name: "index_daily_chat_stats_on_organization_id_and_day", unique: true
  end

  create_table "flow_execution_logs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "flow_execution_id", null: false
    t.string "node_id", null: false
    t.string "node_type", null: false
    t.jsonb "input", default: {}, null: false
    t.jsonb "output", default: {}, null: false
    t.integer "duration_ms"
    t.string "status", default: "success", null: false
    t.text "error_message"
    t.datetime "executed_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["executed_at"], name: "index_flow_execution_logs_on_executed_at"
    t.index ["flow_execution_id", "executed_at"], name: "index_flow_execution_logs_on_flow_execution_id_and_executed_at"
  end

  create_table "flow_executions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "flow_id", null: false
    t.uuid "flow_version_id", null: false
    t.uuid "organization_id", null: false
    t.string "chat_id"
    t.string "contact_id"
    t.string "current_node_id"
    t.string "status", default: "pending", null: false
    t.jsonb "context", default: {}, null: false
    t.boolean "playground", default: false, null: false
    t.datetime "started_at"
    t.datetime "completed_at"
    t.text "error_message"
    t.string "run_token"
    t.datetime "locked_at"
    t.string "resume_token"
    t.datetime "resume_at"
    t.string "idempotency_key"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["flow_id", "chat_id"], name: "index_flow_executions_one_active_per_chat", unique: true, where: "((playground = false) AND (chat_id IS NOT NULL) AND ((status)::text = ANY ((ARRAY['pending'::character varying, 'running'::character varying, 'waiting'::character varying, 'waiting_for_message'::character varying])::text[])))"
    t.index ["flow_id", "playground", "created_at"], name: "index_flow_executions_on_flow_id_and_playground_and_created_at"
    t.index ["idempotency_key"], name: "index_flow_executions_on_idempotency_key", unique: true, where: "(idempotency_key IS NOT NULL)"
    t.index ["organization_id", "chat_id", "status"], name: "idx_on_organization_id_chat_id_status_1ff079db0a"
    t.index ["status", "updated_at"], name: "index_flow_executions_on_status_and_updated_at"
  end

  create_table "flow_versions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "flow_id", null: false
    t.integer "version_number", null: false
    t.jsonb "definition", default: {"edges" => [], "nodes" => [], "viewport" => {}}, null: false
    t.datetime "published_at"
    t.uuid "created_by_account_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["flow_id", "version_number"], name: "index_flow_versions_on_flow_id_and_version_number", unique: true
  end

  create_table "flows", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "name", null: false
    t.text "description"
    t.string "status", default: "draft", null: false
    t.string "trigger_type", null: false
    t.jsonb "connector_filter", default: {}, null: false
    t.uuid "published_version_id"
    t.uuid "created_by_account_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "status", "trigger_type"], name: "index_flows_on_organization_id_and_status_and_trigger_type"
    t.index ["organization_id", "updated_at"], name: "index_flows_on_organization_id_and_updated_at"
  end

  create_table "folders", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "name", null: false
    t.string "color", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "brand_core_id"
    t.index ["brand_core_id"], name: "index_folders_on_brand_core_id"
    t.index ["organization_id", "name"], name: "index_folders_on_organization_id_and_name"
    t.index ["organization_id"], name: "index_folders_on_organization_id"
  end

  create_table "funnel_stages", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "funnel_id", null: false
    t.string "name", null: false
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["funnel_id", "position"], name: "index_funnel_stages_on_funnel_id_and_position"
  end

  create_table "funnels", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "name", null: false
    t.text "description"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "organization_id, lower((name)::text)", name: "index_funnels_on_organization_and_lower_name", unique: true
  end

  create_table "hook_actions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "hook_id", null: false
    t.string "type", null: false
    t.jsonb "config", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["hook_id", "created_at"], name: "index_hook_actions_on_hook_id_and_created_at"
  end

  create_table "hooks", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "uid", null: false
    t.string "name", null: false
    t.string "slug"
    t.string "status", default: "test", null: false
    t.bigint "total_request", default: 0, null: false
    t.jsonb "received_payload", default: [], null: false
    t.boolean "signature_enabled", default: false, null: false
    t.text "signing_secret_ciphertext"
    t.string "signing_secret_last_four", limit: 4
    t.datetime "signing_secret_generated_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "created_at"], name: "index_hooks_on_organization_id_and_created_at"
    t.index ["uid"], name: "index_hooks_on_uid", unique: true
  end

  create_table "image_generations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "brand_core_id", null: false
    t.uuid "account_id"
    t.text "prompt", null: false
    t.string "aspect_ratio", null: false
    t.integer "count", null: false
    t.uuid "reference_asset_id"
    t.string "origin", default: "studio", null: false
    t.string "status", default: "queued", null: false
    t.string "model"
    t.jsonb "asset_ids", default: [], null: false
    t.integer "credits_charged", default: 0, null: false
    t.bigint "cost_micro_usd", default: 0, null: false
    t.jsonb "error"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "agent_turn_id"
    t.index ["account_id"], name: "index_image_generations_on_account_id"
    t.index ["agent_turn_id"], name: "index_image_generations_on_agent_turn_id"
    t.index ["brand_core_id", "created_at"], name: "index_image_generations_on_brand_core_id_and_created_at"
    t.index ["brand_core_id"], name: "index_image_generations_on_brand_core_id"
    t.index ["organization_id", "created_at"], name: "index_image_generations_on_organization_id_and_created_at"
    t.index ["organization_id"], name: "index_image_generations_on_organization_id"
  end

  create_table "library_images", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "key", null: false
    t.string "base", null: false
    t.jsonb "layers", default: [], null: false
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_library_images_on_key", unique: true
  end

  create_table "notifications", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "key", null: false
    t.boolean "read", default: false, null: false
    t.datetime "notified_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "notified_at"], name: "index_notifications_on_organization_id_and_notified_at"
    t.index ["organization_id"], name: "index_notifications_on_organization_id"
  end

  create_table "oauth_credentials", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "key_name", null: false
    t.string "endpoint", null: false
    t.string "client_id", null: false
    t.text "client_secret", null: false
    t.datetime "expires_at"
    t.text "token_data"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "key_name"], name: "index_oauth_credentials_on_organization_id_and_key_name", unique: true
  end

  create_table "onboarding_events", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "brand_core_id"
    t.uuid "account_id"
    t.string "step", null: false
    t.string "action", null: false
    t.jsonb "payload", default: {}, null: false
    t.string "model"
    t.jsonb "usage", default: {}, null: false
    t.integer "cost_micro_usd", default: 0, null: false
    t.datetime "created_at", null: false
    t.index ["account_id"], name: "index_onboarding_events_on_account_id"
    t.index ["brand_core_id", "created_at"], name: "index_onboarding_events_on_brand_core_id_and_created_at"
    t.index ["brand_core_id"], name: "index_onboarding_events_on_brand_core_id"
    t.index ["organization_id", "created_at"], name: "index_onboarding_events_on_organization_id_and_created_at"
    t.index ["organization_id"], name: "index_onboarding_events_on_organization_id"
    t.index ["step", "action"], name: "index_onboarding_events_on_step_and_action"
  end

  create_table "organization_alerts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "category", null: false
    t.string "severity", default: "error", null: false
    t.string "origin_type", null: false
    t.string "origin_id", null: false
    t.string "origin_name"
    t.string "code", null: false
    t.string "message"
    t.jsonb "metadata", default: {}, null: false
    t.datetime "resolved_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "category"], name: "index_organization_alerts_on_organization_id_and_category"
    t.index ["organization_id", "origin_type", "origin_id", "code"], name: "idx_organization_alerts_one_active_per_origin", unique: true, where: "(resolved_at IS NULL)"
    t.index ["organization_id", "resolved_at"], name: "index_organization_alerts_on_organization_id_and_resolved_at"
  end

  create_table "organizations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "name", null: false
    t.string "plan", default: "free", null: false
    t.integer "credits_total", default: 50, null: false
    t.integer "credits_used", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "features", default: {}, null: false
    t.jsonb "settings", default: {}, null: false
    t.string "timezone", default: "America/Sao_Paulo", null: false
    t.boolean "internal", default: false, null: false
    t.index ["name", "id"], name: "index_organizations_on_name_and_id"
    t.check_constraint "credits_used >= 0 AND credits_used <= credits_total", name: "organizations_credits_within_total"
  end

  create_table "palette_colors", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "group", null: false
    t.string "key"
    t.string "value", null: false
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["group", "position"], name: "index_palette_colors_on_group_and_position"
    t.index ["group", "value"], name: "index_palette_colors_on_group_and_value", unique: true
  end

  create_table "password_resets", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "token_digest", null: false
    t.datetime "expires_at", null: false
    t.datetime "used_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["token_digest"], name: "index_password_resets_on_token_digest", unique: true
    t.index ["user_id"], name: "index_password_resets_on_user_id"
  end

  create_table "piece_renders", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "piece_version_id", null: false
    t.string "slide_id", null: false
    t.integer "position", null: false
    t.string "renderer", null: false
    t.string "checksum", null: false
    t.integer "width", null: false
    t.integer "height", null: false
    t.datetime "rendered_at", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.jsonb "legibility"
    t.index ["checksum", "renderer"], name: "index_piece_renders_on_checksum_and_renderer"
    t.index ["piece_version_id", "renderer", "position"], name: "idx_on_piece_version_id_renderer_position_bd065ebbad", unique: true
    t.index ["piece_version_id"], name: "index_piece_renders_on_piece_version_id"
  end

  create_table "piece_versions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "piece_id", null: false
    t.uuid "account_id"
    t.uuid "base_version_id"
    t.jsonb "document", default: {}, null: false
    t.string "source", null: false
    t.string "summary"
    t.datetime "created_at", null: false
    t.index ["account_id"], name: "index_piece_versions_on_account_id"
    t.index ["piece_id", "created_at"], name: "index_piece_versions_on_piece_id_and_created_at"
    t.index ["piece_id"], name: "index_piece_versions_on_piece_id"
  end

  create_table "pieces", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "brand_core_id", null: false
    t.uuid "brand_core_version_id"
    t.uuid "account_id"
    t.string "engine_id"
    t.string "format", null: false
    t.string "title", null: false
    t.jsonb "values", default: {}, null: false
    t.string "status", default: "queued", null: false
    t.jsonb "error"
    t.jsonb "provenance", default: {}, null: false
    t.datetime "rendered_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "agent_turn_id"
    t.uuid "current_version_id"
    t.uuid "reference_ids", default: [], null: false, array: true
    t.index ["account_id"], name: "index_pieces_on_account_id"
    t.index ["agent_turn_id"], name: "index_pieces_on_agent_turn_id"
    t.index ["brand_core_id"], name: "index_pieces_on_brand_core_id"
    t.index ["brand_core_version_id"], name: "index_pieces_on_brand_core_version_id"
    t.index ["current_version_id"], name: "index_pieces_on_current_version_id"
    t.index ["organization_id", "created_at"], name: "index_pieces_on_organization_id_and_created_at"
    t.index ["organization_id", "engine_id"], name: "index_pieces_on_organization_id_and_engine_id"
    t.index ["organization_id"], name: "index_pieces_on_organization_id"
    t.index ["reference_ids"], name: "index_pieces_on_reference_ids", using: :gin
  end

  create_table "pipeline_board_templates", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "name", null: false
    t.text "description"
    t.string "template_key", null: false
    t.jsonb "stages_config", default: [], null: false
    t.jsonb "custom_fields_config", default: [], null: false
    t.jsonb "triggers_config", default: [], null: false
    t.string "icon"
    t.string "color"
    t.string "default_board_type", default: "standard", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["template_key"], name: "index_pipeline_board_templates_on_template_key", unique: true
  end

  create_table "pipeline_boards", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "name", null: false
    t.text "description"
    t.integer "position", default: 0, null: false
    t.string "color"
    t.string "icon"
    t.string "template_key"
    t.boolean "archived", default: false, null: false
    t.string "board_type", default: "standard", null: false
    t.integer "auto_archive_days"
    t.string "deal_close_behavior", default: "manual", null: false
    t.integer "deal_close_archive_days"
    t.integer "deal_rotting_days", default: 7
    t.string "lead_score_field_key"
    t.integer "lead_score_low", default: 30, null: false
    t.integer "lead_score_high", default: 70, null: false
    t.boolean "require_fields_on_deal_won", default: false, null: false
    t.boolean "require_fields_on_deal_lost", default: false, null: false
    t.string "card_visibility", default: "all", null: false
    t.uuid "card_visibility_bypass_role_ids", default: [], null: false, array: true
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "archived", "position"], name: "idx_on_organization_id_archived_position_42b324d257"
  end

  create_table "pipeline_card_activities", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "card_id", null: false
    t.uuid "account_id"
    t.string "action", null: false
    t.jsonb "details", default: {}, null: false
    t.datetime "created_at", null: false
    t.index ["account_id"], name: "index_pipeline_card_activities_on_account_id"
    t.index ["card_id", "action", "created_at"], name: "index_pipeline_card_activities_on_card_action_time", order: { created_at: :desc }
    t.index ["card_id", "created_at"], name: "index_pipeline_card_activities_on_card_id_and_created_at", order: { created_at: :desc }
  end

  create_table "pipeline_card_attachments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "card_id", null: false
    t.uuid "account_id"
    t.string "file_name"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_pipeline_card_attachments_on_account_id"
    t.index ["card_id"], name: "index_pipeline_card_attachments_on_card_id"
  end

  create_table "pipeline_card_labels", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "card_id", null: false
    t.uuid "label_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["card_id", "label_id"], name: "index_pipeline_card_labels_on_card_id_and_label_id", unique: true
    t.index ["label_id"], name: "index_pipeline_card_labels_on_label_id"
  end

  create_table "pipeline_card_stage_checks", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "card_id", null: false
    t.uuid "pipeline_stage_checklist_item_id", null: false
    t.boolean "completed", default: false, null: false
    t.datetime "completed_at"
    t.uuid "completed_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["card_id", "pipeline_stage_checklist_item_id"], name: "index_pipeline_card_stage_checks_unique", unique: true
    t.index ["pipeline_stage_checklist_item_id"], name: "index_pipeline_card_stage_checks_on_item"
  end

  create_table "pipeline_card_watchers", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "card_id", null: false
    t.uuid "account_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_pipeline_card_watchers_on_account_id"
    t.index ["card_id", "account_id"], name: "index_pipeline_card_watchers_on_card_id_and_account_id", unique: true
  end

  create_table "pipeline_cards", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "stage_id", null: false
    t.string "title", null: false
    t.text "description"
    t.jsonb "description_json"
    t.string "audience_id"
    t.string "status"
    t.string "priority"
    t.datetime "due_date"
    t.integer "position"
    t.uuid "assigned_to_id"
    t.uuid "created_by_id"
    t.jsonb "custom_field_values", default: {}, null: false
    t.string "tags", default: [], null: false, array: true
    t.string "color_label"
    t.string "chat_id"
    t.boolean "archived", default: false, null: false
    t.datetime "completed_at"
    t.decimal "deal_value", precision: 12, scale: 2
    t.integer "deal_probability"
    t.string "company_name"
    t.string "contact_email"
    t.string "contact_phone"
    t.datetime "won_at"
    t.datetime "lost_at"
    t.string "lost_reason"
    t.date "expected_close_date"
    t.datetime "stage_entered_at", default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.datetime "sla_notified_at"
    t.datetime "due_notified_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["assigned_to_id"], name: "index_pipeline_cards_on_assigned_to_id"
    t.index ["created_by_id"], name: "index_pipeline_cards_on_created_by_id"
    t.index ["due_date"], name: "index_pipeline_cards_on_open_due_date", where: "((due_date IS NOT NULL) AND (archived = false) AND (completed_at IS NULL))"
    t.index ["organization_id", "chat_id"], name: "index_pipeline_cards_on_organization_id_and_chat_id", where: "(chat_id IS NOT NULL)"
    t.index ["stage_id", "archived", "position"], name: "index_pipeline_cards_on_stage_id_and_archived_and_position"
    t.index ["stage_id", "won_at"], name: "index_pipeline_cards_on_stage_id_and_won_at", where: "(won_at IS NOT NULL)"
    t.index ["tags"], name: "index_pipeline_cards_on_tags", using: :gin
  end

  create_table "pipeline_checklist_items", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "pipeline_checklist_id", null: false
    t.string "title", null: false
    t.boolean "completed", default: false, null: false
    t.integer "position"
    t.uuid "assigned_to_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["assigned_to_id"], name: "index_pipeline_checklist_items_on_assigned_to_id"
    t.index ["pipeline_checklist_id"], name: "index_pipeline_checklist_items_on_pipeline_checklist_id"
  end

  create_table "pipeline_checklists", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "card_id", null: false
    t.string "name", null: false
    t.integer "position"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["card_id"], name: "index_pipeline_checklists_on_card_id"
  end

  create_table "pipeline_comment_attachments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "pipeline_comment_id", null: false
    t.string "file_name"
    t.string "content_type"
    t.bigint "file_size"
    t.datetime "created_at", null: false
    t.index ["pipeline_comment_id"], name: "index_pipeline_comment_attachments_on_pipeline_comment_id"
  end

  create_table "pipeline_comment_reactions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "pipeline_comment_id", null: false
    t.uuid "account_id", null: false
    t.string "emoji", limit: 20, null: false
    t.datetime "created_at", null: false
    t.index ["account_id"], name: "index_pipeline_comment_reactions_on_account_id"
    t.index ["pipeline_comment_id", "account_id", "emoji"], name: "index_pipeline_comment_reactions_unique", unique: true
  end

  create_table "pipeline_comments", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "card_id", null: false
    t.uuid "account_id"
    t.string "automation_source"
    t.text "body", null: false
    t.datetime "edited_at"
    t.uuid "parent_id"
    t.boolean "pinned", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_pipeline_comments_on_account_id"
    t.index ["card_id", "created_at"], name: "index_pipeline_comments_on_card_id_and_created_at"
    t.index ["card_id", "pinned", "created_at"], name: "index_pipeline_comments_on_card_id_and_pinned_and_created_at"
    t.index ["parent_id"], name: "index_pipeline_comments_on_parent_id"
  end

  create_table "pipeline_custom_fields", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "board_id", null: false
    t.uuid "stage_id"
    t.string "name", null: false
    t.string "key", null: false
    t.string "field_type", null: false
    t.string "scope", default: "board", null: false
    t.integer "position"
    t.boolean "required", default: false, null: false
    t.boolean "required_to_leave_stage", default: false, null: false
    t.jsonb "options"
    t.string "default_value"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["board_id", "key"], name: "index_pipeline_custom_fields_on_board_id_and_key", unique: true
    t.index ["board_id", "position"], name: "index_pipeline_custom_fields_on_board_id_and_position"
    t.index ["stage_id"], name: "index_pipeline_custom_fields_on_stage_id"
  end

  create_table "pipeline_goals", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "board_id", null: false
    t.string "scope", null: false
    t.uuid "assigned_account_id"
    t.date "period_month", null: false
    t.string "metric", default: "revenue", null: false
    t.decimal "target_value", precision: 12, scale: 2, null: false
    t.uuid "created_by_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["assigned_account_id"], name: "index_pipeline_goals_on_assigned_account_id"
    t.index ["board_id", "scope", "assigned_account_id", "period_month"], name: "index_pipeline_goals_unique", unique: true, nulls_not_distinct: true
  end

  create_table "pipeline_labels", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "name", null: false
    t.string "color", default: "#607D8B", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index "organization_id, lower((name)::text)", name: "index_pipeline_labels_on_organization_and_lower_name", unique: true
  end

  create_table "pipeline_saved_filter_favorites", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id", null: false
    t.uuid "pipeline_saved_filter_id"
    t.string "preset_key"
    t.uuid "board_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id", "board_id", "preset_key"], name: "index_pipeline_filter_favorites_on_preset", unique: true, where: "(preset_key IS NOT NULL)"
    t.index ["account_id", "pipeline_saved_filter_id"], name: "index_pipeline_filter_favorites_on_saved", unique: true, where: "(pipeline_saved_filter_id IS NOT NULL)"
    t.index ["account_id"], name: "index_pipeline_saved_filter_favorites_on_account_id"
    t.index ["board_id"], name: "index_pipeline_saved_filter_favorites_on_board_id"
    t.index ["pipeline_saved_filter_id"], name: "index_pipeline_filter_favorites_on_filter"
    t.check_constraint "(pipeline_saved_filter_id IS NULL) <> (preset_key IS NULL)", name: "pipeline_filter_favorite_target_xor"
  end

  create_table "pipeline_saved_filters", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "board_id", null: false
    t.uuid "account_id"
    t.string "name", null: false
    t.string "visibility", default: "private", null: false
    t.jsonb "definition", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_pipeline_saved_filters_on_account_id"
    t.index ["board_id", "account_id"], name: "index_pipeline_saved_filters_on_board_id_and_account_id"
    t.index ["board_id", "visibility"], name: "index_pipeline_saved_filters_on_board_id_and_visibility"
    t.index ["organization_id"], name: "index_pipeline_saved_filters_on_organization_id"
  end

  create_table "pipeline_stage_checklist_items", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "stage_id", null: false
    t.string "title", null: false
    t.integer "position"
    t.boolean "required", default: true, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["stage_id"], name: "index_pipeline_stage_checklist_items_on_stage_id"
  end

  create_table "pipeline_stages", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "board_id", null: false
    t.string "name", null: false
    t.integer "position"
    t.string "color"
    t.integer "wip_limit"
    t.integer "sla_hours"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["board_id", "position"], name: "index_pipeline_stages_on_board_id_and_position"
    t.index ["sla_hours"], name: "index_pipeline_stages_on_sla_hours", where: "(sla_hours IS NOT NULL)"
  end

  create_table "pipeline_trigger_executions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "pipeline_trigger_id", null: false
    t.uuid "card_id", null: false
    t.string "status", default: "success", null: false
    t.jsonb "executed_actions", default: [], null: false
    t.text "error_message"
    t.datetime "executed_at", default: -> { "CURRENT_TIMESTAMP" }, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["card_id"], name: "index_pipeline_trigger_executions_on_card_id"
    t.index ["executed_at"], name: "index_pipeline_trigger_executions_on_executed_at"
    t.index ["pipeline_trigger_id", "executed_at"], name: "idx_on_pipeline_trigger_id_executed_at_4f4f7562ea"
  end

  create_table "pipeline_triggers", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "board_id", null: false
    t.uuid "stage_id"
    t.string "name", null: false
    t.string "event_type", null: false
    t.jsonb "conditions", default: {}, null: false
    t.jsonb "actions", default: [], null: false
    t.boolean "active", default: true, null: false
    t.integer "last_round_robin_index", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["board_id", "event_type"], name: "index_pipeline_triggers_on_board_id_and_event_type"
    t.index ["event_type", "active"], name: "index_pipeline_triggers_on_event_type_and_active"
    t.index ["stage_id"], name: "index_pipeline_triggers_on_stage_id"
  end

  create_table "product_categories", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "parent_id"
    t.string "name", null: false
    t.string "slug", null: false
    t.string "path", null: false
    t.integer "position", default: 0, null: false
    t.integer "items_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "parent_id", "position"], name: "index_product_categories_on_organization_parent_position"
    t.index ["organization_id", "path"], name: "index_product_categories_on_organization_id_and_path", unique: true, opclass: { path: :text_pattern_ops }
    t.index ["parent_id"], name: "index_product_categories_on_parent_id"
  end

  create_table "product_embeddings", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "product_item_id", null: false
    t.uuid "organization_id", null: false
    t.vector "embedding", limit: 512
    t.string "source_hash", null: false
    t.string "model", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "product_item_id"], name: "index_product_embeddings_on_organization_and_item"
    t.index ["product_item_id"], name: "index_product_embeddings_on_product_item_id", unique: true
  end

  create_table "product_field_definitions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "name", null: false
    t.string "key", null: false
    t.string "description"
    t.string "value_type", null: false
    t.string "option_values", default: [], null: false, array: true
    t.string "default_value"
    t.boolean "required", default: false, null: false
    t.boolean "searchable", default: true, null: false
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "key"], name: "index_product_field_definitions_on_organization_and_key", unique: true
    t.index ["organization_id", "position"], name: "index_product_field_definitions_on_organization_and_position"
  end

  create_table "product_images", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "product_item_id", null: false
    t.string "source_url"
    t.string "alt"
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["product_item_id", "position"], name: "index_product_images_on_product_item_id_and_position"
  end

  create_table "product_import_rows", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "product_import_id", null: false
    t.integer "line_number", null: false
    t.string "error_message", null: false
    t.jsonb "raw", default: {}, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["product_import_id", "line_number"], name: "index_product_import_rows_on_product_import_id_and_line_number"
  end

  create_table "product_imports", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "account_id"
    t.string "status", default: "pending", null: false
    t.string "filename"
    t.string "delimiter"
    t.jsonb "mapping", default: {}, null: false
    t.jsonb "options", default: {}, null: false
    t.integer "total_rows", default: 0, null: false
    t.integer "processed_rows", default: 0, null: false
    t.integer "created_count", default: 0, null: false
    t.integer "updated_count", default: 0, null: false
    t.integer "error_count", default: 0, null: false
    t.jsonb "error_sample", default: [], null: false
    t.datetime "started_at"
    t.datetime "completed_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_product_imports_on_account_id"
    t.index ["organization_id", "created_at"], name: "index_product_imports_on_organization_id_and_created_at"
    t.index ["organization_id", "status"], name: "index_product_imports_on_organization_id_and_status"
    t.index ["status", "updated_at"], name: "index_product_imports_on_status_and_updated_at"
  end

  create_table "product_item_categories", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "product_item_id", null: false
    t.uuid "product_category_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["product_category_id"], name: "index_product_item_categories_on_product_category_id"
    t.index ["product_item_id", "product_category_id"], name: "index_product_item_categories_uniqueness", unique: true
  end

  create_table "product_items", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "title", limit: 300, null: false
    t.string "summary", limit: 1500
    t.text "description"
    t.string "external_id"
    t.string "url"
    t.boolean "active", default: true, null: false
    t.jsonb "custom_fields", default: {}, null: false
    t.string "tags", default: [], null: false, array: true
    t.text "index_text_primary"
    t.text "index_text_secondary"
    t.virtual "search_document", type: :tsvector, as: "(setweight(to_tsvector('portuguese'::regconfig, COALESCE(index_text_primary, ''::text)), 'A'::\"char\") || setweight(to_tsvector('portuguese'::regconfig, COALESCE(index_text_secondary, ''::text)), 'B'::\"char\"))", stored: true
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["custom_fields"], name: "index_product_items_on_custom_fields", opclass: :jsonb_path_ops, using: :gin
    t.index ["organization_id", "active"], name: "index_product_items_on_organization_id_and_active"
    t.index ["organization_id", "created_at"], name: "index_product_items_on_organization_id_and_created_at"
    t.index ["organization_id", "external_id"], name: "index_product_items_on_organization_and_external_id", unique: true
    t.index ["search_document"], name: "index_product_items_on_search_document", using: :gin
    t.index ["tags"], name: "index_product_items_on_tags", using: :gin
  end

  create_table "push_devices", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.text "endpoint", null: false
    t.text "p256dh_key", null: false
    t.text "auth_key", null: false
    t.text "user_agent"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["endpoint"], name: "index_push_devices_on_endpoint", unique: true
    t.index ["user_id"], name: "index_push_devices_on_user_id"
  end

  create_table "quick_replies", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "name", null: false
    t.string "trigger", null: false
    t.text "content", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "name"], name: "index_quick_replies_on_organization_id_and_name"
    t.index ["organization_id", "trigger"], name: "index_quick_replies_on_organization_id_and_trigger", unique: true
  end

  create_table "reference_candidates", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "reference_import_account_id", null: false
    t.string "ig_media_id", null: false
    t.string "media_type", null: false
    t.string "product_type"
    t.text "permalink"
    t.text "preview_url"
    t.integer "like_count"
    t.integer "comments_count"
    t.decimal "relative_engagement", precision: 8, scale: 2
    t.datetime "posted_at"
    t.integer "children_count", default: 0, null: false
    t.boolean "partial", default: false, null: false
    t.string "status", default: "pending", null: false
    t.uuid "reference_card_id"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["ig_media_id"], name: "index_reference_candidates_on_ig_media_id"
    t.index ["reference_card_id"], name: "index_reference_candidates_on_reference_card_id"
    t.index ["reference_import_account_id"], name: "index_reference_candidates_on_reference_import_account_id"
  end

  create_table "reference_cards", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "status", default: "draft", null: false
    t.string "origin", default: "external", null: false
    t.string "niche"
    t.string "size"
    t.string "archetypes", default: [], null: false, array: true
    t.string "objective"
    t.string "format"
    t.string "suggested_layout_id"
    t.jsonb "analysis", default: {}, null: false
    t.jsonb "source", default: {}, null: false
    t.vector "embedding", limit: 768
    t.string "hook_type"
    t.integer "replicability"
    t.decimal "relative_engagement", precision: 8, scale: 2
    t.uuid "curated_by_id"
    t.integer "version", default: 1, null: false
    t.text "archived_reason"
    t.datetime "published_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.string "analysis_status", default: "pending", null: false
    t.jsonb "analysis_error"
    t.string "analysis_model"
    t.jsonb "analysis_usage", default: {}, null: false
    t.bigint "analysis_cost_micro_usd", default: 0, null: false
    t.datetime "analyzed_at"
    t.datetime "embedded_at"
    t.string "copy_shingles", default: [], null: false, array: true
    t.boolean "partial_analysis", default: false, null: false
    t.string "requires", default: [], null: false, array: true
    t.index "((source ->> 'igMediaId'::text))", name: "index_reference_cards_on_ig_media_id", unique: true, where: "(source ? 'igMediaId'::text)"
    t.index ["analysis_status"], name: "index_reference_cards_on_analysis_status"
    t.index ["archetypes"], name: "index_reference_cards_on_archetypes", using: :gin
    t.index ["curated_by_id"], name: "index_reference_cards_on_curated_by_id"
    t.index ["niche"], name: "index_reference_cards_on_niche"
    t.index ["status", "format", "replicability"], name: "index_reference_cards_on_status_and_format_and_replicability"
  end

  create_table "reference_eval_pairs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "round", null: false
    t.integer "position", null: false
    t.uuid "brand_core_id", null: false
    t.string "request_key", null: false
    t.text "request_text", null: false
    t.string "objective"
    t.boolean "control", default: false, null: false
    t.string "left_arm", null: false
    t.string "right_arm", null: false
    t.uuid "left_piece_ids", default: [], null: false, array: true
    t.uuid "right_piece_ids", default: [], null: false, array: true
    t.integer "left_cost_micro_usd", default: 0, null: false
    t.integer "right_cost_micro_usd", default: 0, null: false
    t.string "verdict"
    t.integer "usable_left"
    t.integer "usable_right"
    t.string "reasons", default: [], null: false, array: true
    t.string "copied_sides", default: [], null: false, array: true
    t.text "notes"
    t.uuid "decided_by_id"
    t.datetime "decided_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["brand_core_id"], name: "index_reference_eval_pairs_on_brand_core_id"
    t.index ["decided_by_id"], name: "index_reference_eval_pairs_on_decided_by_id"
    t.index ["round", "position"], name: "index_reference_eval_pairs_on_round_and_position", unique: true
  end

  create_table "reference_import_accounts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "reference_import_id", null: false
    t.string "username", null: false
    t.string "status", default: "pending", null: false
    t.string "error_code"
    t.datetime "retry_at"
    t.string "name"
    t.integer "followers_count"
    t.integer "fetched_count"
    t.integer "eligible_count"
    t.decimal "baseline_median", precision: 12, scale: 2
    t.datetime "fetched_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["reference_import_id", "username"], name: "idx_on_reference_import_id_username_b26fadea2f", unique: true
    t.index ["reference_import_id"], name: "index_reference_import_accounts_on_reference_import_id"
  end

  create_table "reference_imports", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "curated_by_id"
    t.string "niche"
    t.string "size"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_reference_imports_on_created_at"
    t.index ["curated_by_id"], name: "index_reference_imports_on_curated_by_id"
  end

  create_table "sessions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "token_digest", null: false
    t.string "user_agent"
    t.string "ip_address"
    t.datetime "expires_at", null: false
    t.datetime "last_used_at"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.uuid "user_id", null: false
    t.index ["token_digest"], name: "index_sessions_on_token_digest", unique: true
    t.index ["user_id"], name: "index_sessions_on_user_id"
  end

  create_table "support_accesses", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "user_id", null: false
    t.uuid "organization_id", null: false
    t.uuid "account_id"
    t.string "ip_address"
    t.string "user_agent"
    t.datetime "created_at", null: false
    t.index ["account_id"], name: "index_support_accesses_on_account_id"
    t.index ["created_at"], name: "index_support_accesses_on_created_at"
    t.index ["organization_id"], name: "index_support_accesses_on_organization_id"
    t.index ["user_id"], name: "index_support_accesses_on_user_id"
  end

  create_table "team_memberships", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "team_id", null: false
    t.uuid "account_id", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_team_memberships_on_account_id"
    t.index ["team_id", "account_id"], name: "index_team_memberships_on_team_id_and_account_id", unique: true
    t.index ["team_id"], name: "index_team_memberships_on_team_id"
  end

  create_table "teams", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.string "name", null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "active", default: true, null: false
    t.index ["organization_id", "name"], name: "index_teams_on_organization_id_and_name", unique: true
    t.index ["organization_id"], name: "index_teams_on_organization_id"
  end

  create_table "theme_presets", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "key", null: false
    t.jsonb "theme", null: false
    t.integer "position", default: 0, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["key"], name: "index_theme_presets_on_key", unique: true
  end

  create_table "uploads", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "organization_id", null: false
    t.uuid "account_id"
    t.string "filename", null: false
    t.string "content_type", null: false
    t.bigint "byte_size", null: false
    t.integer "width"
    t.integer "height"
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_uploads_on_account_id"
    t.index ["organization_id", "created_at"], name: "index_uploads_on_organization_id_and_created_at"
    t.index ["organization_id"], name: "index_uploads_on_organization_id"
  end

  create_table "users", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "email", null: false
    t.string "password_digest", null: false
    t.string "name", null: false
    t.string "phone"
    t.string "locale"
    t.boolean "master", default: false, null: false
    t.datetime "created_at", null: false
    t.datetime "updated_at", null: false
    t.boolean "staff", default: false, null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  add_foreign_key "access_roles", "organizations", on_delete: :cascade
  add_foreign_key "accounts", "access_roles", on_delete: :nullify
  add_foreign_key "accounts", "organizations"
  add_foreign_key "accounts", "users"
  add_foreign_key "active_storage_attachments", "active_storage_blobs", column: "blob_id"
  add_foreign_key "active_storage_variant_records", "active_storage_blobs", column: "blob_id"
  add_foreign_key "agent_conversations", "accounts", on_delete: :nullify
  add_foreign_key "agent_conversations", "brand_cores"
  add_foreign_key "agent_conversations", "organizations"
  add_foreign_key "agent_turns", "accounts", on_delete: :nullify
  add_foreign_key "agent_turns", "agent_conversations"
  add_foreign_key "agent_turns", "organizations"
  add_foreign_key "attachments", "organizations", on_delete: :cascade
  add_foreign_key "brand_assets", "accounts", on_delete: :nullify
  add_foreign_key "brand_assets", "brand_cores"
  add_foreign_key "brand_assets", "organizations"
  add_foreign_key "brand_core_versions", "accounts", on_delete: :nullify
  add_foreign_key "brand_core_versions", "brand_cores"
  add_foreign_key "brand_cores", "organizations"
  add_foreign_key "carousels", "brand_core_versions", on_delete: :nullify
  add_foreign_key "carousels", "brand_cores"
  add_foreign_key "carousels", "folders", on_delete: :nullify
  add_foreign_key "carousels", "organizations"
  add_foreign_key "chat_views", "accounts", on_delete: :cascade
  add_foreign_key "chat_views", "organizations", on_delete: :cascade
  add_foreign_key "contact_import_rows", "contact_imports", on_delete: :cascade
  add_foreign_key "contact_imports", "accounts", on_delete: :nullify
  add_foreign_key "contact_imports", "organizations", on_delete: :cascade
  add_foreign_key "daily_chat_stats", "organizations", on_delete: :cascade
  add_foreign_key "flow_execution_logs", "flow_executions", on_delete: :cascade
  add_foreign_key "flow_executions", "flow_versions", on_delete: :cascade
  add_foreign_key "flow_executions", "flows", on_delete: :cascade
  add_foreign_key "flow_executions", "organizations", on_delete: :cascade
  add_foreign_key "flow_versions", "flows", on_delete: :cascade
  add_foreign_key "flows", "flow_versions", column: "published_version_id", on_delete: :nullify
  add_foreign_key "flows", "organizations", on_delete: :cascade
  add_foreign_key "folders", "brand_cores"
  add_foreign_key "folders", "organizations"
  add_foreign_key "funnel_stages", "funnels", on_delete: :cascade
  add_foreign_key "funnels", "organizations", on_delete: :cascade
  add_foreign_key "hook_actions", "hooks", on_delete: :cascade
  add_foreign_key "hooks", "organizations", on_delete: :cascade
  add_foreign_key "image_generations", "accounts", on_delete: :nullify
  add_foreign_key "image_generations", "agent_turns", on_delete: :nullify
  add_foreign_key "image_generations", "brand_cores"
  add_foreign_key "image_generations", "organizations"
  add_foreign_key "notifications", "organizations"
  add_foreign_key "oauth_credentials", "organizations", on_delete: :cascade
  add_foreign_key "onboarding_events", "accounts", on_delete: :nullify
  add_foreign_key "onboarding_events", "brand_cores", on_delete: :nullify
  add_foreign_key "onboarding_events", "organizations"
  add_foreign_key "organization_alerts", "organizations", on_delete: :cascade
  add_foreign_key "password_resets", "users"
  add_foreign_key "piece_renders", "piece_versions"
  add_foreign_key "piece_versions", "accounts", on_delete: :nullify
  add_foreign_key "piece_versions", "pieces"
  add_foreign_key "pieces", "accounts", on_delete: :nullify
  add_foreign_key "pieces", "agent_turns", on_delete: :nullify
  add_foreign_key "pieces", "brand_core_versions", on_delete: :nullify
  add_foreign_key "pieces", "brand_cores"
  add_foreign_key "pieces", "organizations"
  add_foreign_key "pipeline_boards", "organizations", on_delete: :cascade
  add_foreign_key "pipeline_card_activities", "accounts", on_delete: :nullify
  add_foreign_key "pipeline_card_activities", "pipeline_cards", column: "card_id", on_delete: :cascade
  add_foreign_key "pipeline_card_attachments", "accounts", on_delete: :nullify
  add_foreign_key "pipeline_card_attachments", "pipeline_cards", column: "card_id", on_delete: :cascade
  add_foreign_key "pipeline_card_labels", "pipeline_cards", column: "card_id", on_delete: :cascade
  add_foreign_key "pipeline_card_labels", "pipeline_labels", column: "label_id", on_delete: :cascade
  add_foreign_key "pipeline_card_stage_checks", "accounts", column: "completed_by_id", on_delete: :nullify
  add_foreign_key "pipeline_card_stage_checks", "pipeline_cards", column: "card_id", on_delete: :cascade
  add_foreign_key "pipeline_card_stage_checks", "pipeline_stage_checklist_items", on_delete: :cascade
  add_foreign_key "pipeline_card_watchers", "accounts", on_delete: :cascade
  add_foreign_key "pipeline_card_watchers", "pipeline_cards", column: "card_id", on_delete: :cascade
  add_foreign_key "pipeline_cards", "accounts", column: "assigned_to_id", on_delete: :nullify
  add_foreign_key "pipeline_cards", "accounts", column: "created_by_id", on_delete: :nullify
  add_foreign_key "pipeline_cards", "organizations", on_delete: :cascade
  add_foreign_key "pipeline_cards", "pipeline_stages", column: "stage_id", on_delete: :cascade
  add_foreign_key "pipeline_checklist_items", "accounts", column: "assigned_to_id", on_delete: :nullify
  add_foreign_key "pipeline_checklist_items", "pipeline_checklists", on_delete: :cascade
  add_foreign_key "pipeline_checklists", "pipeline_cards", column: "card_id", on_delete: :cascade
  add_foreign_key "pipeline_comment_attachments", "pipeline_comments", on_delete: :cascade
  add_foreign_key "pipeline_comment_reactions", "accounts", on_delete: :cascade
  add_foreign_key "pipeline_comment_reactions", "pipeline_comments", on_delete: :cascade
  add_foreign_key "pipeline_comments", "accounts", on_delete: :nullify
  add_foreign_key "pipeline_comments", "pipeline_cards", column: "card_id", on_delete: :cascade
  add_foreign_key "pipeline_comments", "pipeline_comments", column: "parent_id", on_delete: :cascade
  add_foreign_key "pipeline_custom_fields", "pipeline_boards", column: "board_id", on_delete: :cascade
  add_foreign_key "pipeline_custom_fields", "pipeline_stages", column: "stage_id", on_delete: :cascade
  add_foreign_key "pipeline_goals", "accounts", column: "assigned_account_id", on_delete: :cascade
  add_foreign_key "pipeline_goals", "accounts", column: "created_by_id", on_delete: :nullify
  add_foreign_key "pipeline_goals", "pipeline_boards", column: "board_id", on_delete: :cascade
  add_foreign_key "pipeline_labels", "organizations", on_delete: :cascade
  add_foreign_key "pipeline_saved_filter_favorites", "accounts", on_delete: :cascade
  add_foreign_key "pipeline_saved_filter_favorites", "pipeline_boards", column: "board_id", on_delete: :cascade
  add_foreign_key "pipeline_saved_filter_favorites", "pipeline_saved_filters", on_delete: :cascade
  add_foreign_key "pipeline_saved_filters", "accounts", on_delete: :nullify
  add_foreign_key "pipeline_saved_filters", "organizations", on_delete: :cascade
  add_foreign_key "pipeline_saved_filters", "pipeline_boards", column: "board_id", on_delete: :cascade
  add_foreign_key "pipeline_stage_checklist_items", "pipeline_stages", column: "stage_id", on_delete: :cascade
  add_foreign_key "pipeline_stages", "pipeline_boards", column: "board_id", on_delete: :cascade
  add_foreign_key "pipeline_trigger_executions", "pipeline_cards", column: "card_id", on_delete: :cascade
  add_foreign_key "pipeline_trigger_executions", "pipeline_triggers", on_delete: :cascade
  add_foreign_key "pipeline_triggers", "pipeline_boards", column: "board_id", on_delete: :cascade
  add_foreign_key "pipeline_triggers", "pipeline_stages", column: "stage_id", on_delete: :cascade
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
  add_foreign_key "push_devices", "users", on_delete: :cascade
  add_foreign_key "quick_replies", "organizations", on_delete: :cascade
  add_foreign_key "reference_candidates", "reference_cards", on_delete: :nullify
  add_foreign_key "reference_candidates", "reference_import_accounts", on_delete: :cascade
  add_foreign_key "reference_cards", "accounts", column: "curated_by_id", on_delete: :nullify
  add_foreign_key "reference_eval_pairs", "accounts", column: "decided_by_id", on_delete: :nullify
  add_foreign_key "reference_eval_pairs", "brand_cores", on_delete: :cascade
  add_foreign_key "reference_import_accounts", "reference_imports", on_delete: :cascade
  add_foreign_key "reference_imports", "accounts", column: "curated_by_id", on_delete: :nullify
  add_foreign_key "sessions", "users"
  add_foreign_key "support_accesses", "accounts", on_delete: :nullify
  add_foreign_key "support_accesses", "organizations", on_delete: :cascade
  add_foreign_key "support_accesses", "users", on_delete: :cascade
  add_foreign_key "team_memberships", "accounts", on_delete: :cascade
  add_foreign_key "team_memberships", "teams", on_delete: :cascade
  add_foreign_key "teams", "organizations", on_delete: :cascade
  add_foreign_key "uploads", "accounts", on_delete: :nullify
  add_foreign_key "uploads", "organizations"
end
