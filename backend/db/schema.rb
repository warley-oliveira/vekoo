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

ActiveRecord::Schema[8.1].define(version: 2026_11_01_190001) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"
  enable_extension "vector"

  create_table "accounts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "name", null: false
    t.uuid "organization_id", null: false
    t.string "password_digest", null: false
    t.string "role", default: "member", null: false
    t.boolean "staff", default: false, null: false
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

  create_table "agent_conversations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id"
    t.uuid "brand_core_id", null: false
    t.datetime "created_at", null: false
    t.datetime "last_turn_at"
    t.uuid "organization_id", null: false
    t.string "purpose", default: "create", null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_agent_conversations_on_account_id"
    t.index ["brand_core_id", "last_turn_at"], name: "index_agent_conversations_on_brand_core_id_and_last_turn_at"
    t.index ["brand_core_id"], name: "index_agent_conversations_on_brand_core_id"
    t.index ["brand_core_id"], name: "index_agent_conversations_one_onboarding_per_brand", unique: true, where: "((purpose)::text = 'onboarding'::text)"
    t.index ["organization_id"], name: "index_agent_conversations_on_organization_id"
  end

  create_table "agent_turns", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id"
    t.uuid "agent_conversation_id", null: false
    t.jsonb "attachments", default: [], null: false
    t.uuid "base_piece_id"
    t.integer "cost_micro_usd", default: 0, null: false
    t.datetime "created_at", null: false
    t.integer "credits_charged", default: 0, null: false
    t.jsonb "error"
    t.string "kind", default: "create", null: false
    t.string "model"
    t.uuid "offered_reference_ids", default: [], null: false, array: true
    t.uuid "organization_id", null: false
    t.jsonb "plan", default: {}, null: false
    t.text "prompt", null: false
    t.text "question"
    t.string "status", default: "thinking", null: false
    t.jsonb "steps", default: [], null: false
    t.datetime "updated_at", null: false
    t.jsonb "usage", default: {}, null: false
    t.index ["account_id"], name: "index_agent_turns_on_account_id"
    t.index ["agent_conversation_id", "created_at"], name: "index_agent_turns_on_agent_conversation_id_and_created_at"
    t.index ["agent_conversation_id"], name: "index_agent_turns_on_agent_conversation_id"
    t.index ["organization_id", "created_at"], name: "index_agent_turns_on_organization_id_and_created_at"
    t.index ["organization_id"], name: "index_agent_turns_on_organization_id"
  end

  create_table "brand_assets", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id"
    t.uuid "brand_core_id", null: false
    t.bigint "byte_size", null: false
    t.string "content_type", null: false
    t.datetime "created_at", null: false
    t.datetime "described_at"
    t.text "description"
    t.integer "description_cost_micro_usd", default: 0, null: false
    t.string "filename", null: false
    t.boolean "generated", default: false, null: false
    t.integer "height"
    t.string "kind", null: false
    t.uuid "logo_id"
    t.jsonb "meta", default: {}, null: false
    t.uuid "organization_id", null: false
    t.string "shows", default: [], null: false, array: true
    t.boolean "transparent"
    t.datetime "updated_at", null: false
    t.string "variant"
    t.integer "width"
    t.index ["account_id"], name: "index_brand_assets_on_account_id"
    t.index ["brand_core_id", "kind", "created_at"], name: "index_brand_assets_on_brand_core_id_and_kind_and_created_at"
    t.index ["brand_core_id", "logo_id"], name: "index_brand_assets_on_brand_core_id_and_logo_id"
    t.index ["brand_core_id"], name: "index_brand_assets_on_brand_core_id"
    t.index ["organization_id"], name: "index_brand_assets_on_organization_id"
  end

  create_table "brand_core_versions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id"
    t.uuid "brand_core_id", null: false
    t.jsonb "change_list", default: [], null: false
    t.datetime "created_at", null: false
    t.integer "number", null: false
    t.jsonb "snapshot", default: {}, null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_brand_core_versions_on_account_id"
    t.index ["brand_core_id", "number"], name: "index_brand_core_versions_on_brand_core_id_and_number", unique: true
    t.index ["brand_core_id"], name: "index_brand_core_versions_on_brand_core_id"
  end

  create_table "brand_cores", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "current_version", default: 0, null: false
    t.jsonb "document", default: {}, null: false
    t.uuid "organization_id", null: false
    t.jsonb "progress", default: {}, null: false
    t.datetime "published_at"
    t.jsonb "published_document"
    t.string "status", default: "draft", null: false
    t.datetime "updated_at", null: false
    t.index ["organization_id", "created_at"], name: "index_brand_cores_on_organization_id_and_created_at"
  end

  create_table "carousels", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "brand_core_id"
    t.uuid "brand_core_version_id"
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
    t.index ["brand_core_id"], name: "index_carousels_on_brand_core_id"
    t.index ["brand_core_version_id"], name: "index_carousels_on_brand_core_version_id"
    t.index ["folder_id"], name: "index_carousels_on_folder_id"
    t.index ["organization_id", "favorite"], name: "index_carousels_on_organization_id_and_favorite"
    t.index ["organization_id", "trashed_at", "edited_at"], name: "idx_on_organization_id_trashed_at_edited_at_28a7be86a4"
    t.index ["organization_id"], name: "index_carousels_on_organization_id"
  end

  create_table "folders", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "brand_core_id"
    t.string "color", null: false
    t.datetime "created_at", null: false
    t.string "name", null: false
    t.uuid "organization_id", null: false
    t.datetime "updated_at", null: false
    t.index ["brand_core_id"], name: "index_folders_on_brand_core_id"
    t.index ["organization_id", "name"], name: "index_folders_on_organization_id_and_name"
    t.index ["organization_id"], name: "index_folders_on_organization_id"
  end

  create_table "image_generations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id"
    t.uuid "agent_turn_id"
    t.string "aspect_ratio", null: false
    t.jsonb "asset_ids", default: [], null: false
    t.uuid "brand_core_id", null: false
    t.bigint "cost_micro_usd", default: 0, null: false
    t.integer "count", null: false
    t.datetime "created_at", null: false
    t.integer "credits_charged", default: 0, null: false
    t.jsonb "error"
    t.string "model"
    t.uuid "organization_id", null: false
    t.string "origin", default: "studio", null: false
    t.text "prompt", null: false
    t.uuid "reference_asset_id"
    t.string "status", default: "queued", null: false
    t.datetime "updated_at", null: false
    t.index ["account_id"], name: "index_image_generations_on_account_id"
    t.index ["agent_turn_id"], name: "index_image_generations_on_agent_turn_id"
    t.index ["brand_core_id", "created_at"], name: "index_image_generations_on_brand_core_id_and_created_at"
    t.index ["brand_core_id"], name: "index_image_generations_on_brand_core_id"
    t.index ["organization_id", "created_at"], name: "index_image_generations_on_organization_id_and_created_at"
    t.index ["organization_id"], name: "index_image_generations_on_organization_id"
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

  create_table "onboarding_events", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id"
    t.string "action", null: false
    t.uuid "brand_core_id"
    t.integer "cost_micro_usd", default: 0, null: false
    t.datetime "created_at", null: false
    t.string "model"
    t.uuid "organization_id", null: false
    t.jsonb "payload", default: {}, null: false
    t.string "step", null: false
    t.jsonb "usage", default: {}, null: false
    t.index ["account_id"], name: "index_onboarding_events_on_account_id"
    t.index ["brand_core_id", "created_at"], name: "index_onboarding_events_on_brand_core_id_and_created_at"
    t.index ["brand_core_id"], name: "index_onboarding_events_on_brand_core_id"
    t.index ["organization_id", "created_at"], name: "index_onboarding_events_on_organization_id_and_created_at"
    t.index ["organization_id"], name: "index_onboarding_events_on_organization_id"
    t.index ["step", "action"], name: "index_onboarding_events_on_step_and_action"
  end

  create_table "organizations", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "credits_total", default: 50, null: false
    t.integer "credits_used", default: 0, null: false
    t.boolean "internal", default: false, null: false
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

  create_table "piece_renders", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.string "checksum", null: false
    t.datetime "created_at", null: false
    t.integer "height", null: false
    t.jsonb "legibility"
    t.uuid "piece_version_id", null: false
    t.integer "position", null: false
    t.datetime "rendered_at", null: false
    t.string "renderer", null: false
    t.string "slide_id", null: false
    t.datetime "updated_at", null: false
    t.integer "width", null: false
    t.index ["checksum", "renderer"], name: "index_piece_renders_on_checksum_and_renderer"
    t.index ["piece_version_id", "renderer", "position"], name: "idx_on_piece_version_id_renderer_position_bd065ebbad", unique: true
    t.index ["piece_version_id"], name: "index_piece_renders_on_piece_version_id"
  end

  create_table "piece_versions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id"
    t.uuid "base_version_id"
    t.datetime "created_at", null: false
    t.jsonb "document", default: {}, null: false
    t.uuid "piece_id", null: false
    t.string "source", null: false
    t.string "summary"
    t.index ["account_id"], name: "index_piece_versions_on_account_id"
    t.index ["piece_id", "created_at"], name: "index_piece_versions_on_piece_id_and_created_at"
    t.index ["piece_id"], name: "index_piece_versions_on_piece_id"
  end

  create_table "pieces", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id"
    t.uuid "agent_turn_id"
    t.uuid "brand_core_id", null: false
    t.uuid "brand_core_version_id"
    t.datetime "created_at", null: false
    t.uuid "current_version_id"
    t.string "engine_id"
    t.jsonb "error"
    t.string "format", null: false
    t.uuid "organization_id", null: false
    t.jsonb "provenance", default: {}, null: false
    t.uuid "reference_ids", default: [], null: false, array: true
    t.datetime "rendered_at"
    t.string "status", default: "queued", null: false
    t.string "title", null: false
    t.datetime "updated_at", null: false
    t.jsonb "values", default: {}, null: false
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

  create_table "reference_candidates", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.integer "children_count", default: 0, null: false
    t.integer "comments_count"
    t.datetime "created_at", null: false
    t.string "ig_media_id", null: false
    t.integer "like_count"
    t.string "media_type", null: false
    t.boolean "partial", default: false, null: false
    t.text "permalink"
    t.datetime "posted_at"
    t.text "preview_url"
    t.string "product_type"
    t.uuid "reference_card_id"
    t.uuid "reference_import_account_id", null: false
    t.decimal "relative_engagement", precision: 8, scale: 2
    t.string "status", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.index ["ig_media_id"], name: "index_reference_candidates_on_ig_media_id"
    t.index ["reference_card_id"], name: "index_reference_candidates_on_reference_card_id"
    t.index ["reference_import_account_id"], name: "index_reference_candidates_on_reference_import_account_id"
  end

  create_table "reference_cards", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.jsonb "analysis", default: {}, null: false
    t.bigint "analysis_cost_micro_usd", default: 0, null: false
    t.jsonb "analysis_error"
    t.string "analysis_model"
    t.string "analysis_status", default: "pending", null: false
    t.jsonb "analysis_usage", default: {}, null: false
    t.datetime "analyzed_at"
    t.string "archetypes", default: [], null: false, array: true
    t.text "archived_reason"
    t.string "copy_shingles", default: [], null: false, array: true
    t.datetime "created_at", null: false
    t.uuid "curated_by_id"
    t.datetime "embedded_at"
    t.vector "embedding", limit: 768
    t.string "format"
    t.string "hook_type"
    t.string "niche"
    t.string "objective"
    t.string "origin", default: "external", null: false
    t.boolean "partial_analysis", default: false, null: false
    t.datetime "published_at"
    t.decimal "relative_engagement", precision: 8, scale: 2
    t.integer "replicability"
    t.string "requires", default: [], null: false, array: true
    t.string "size"
    t.jsonb "source", default: {}, null: false
    t.string "status", default: "draft", null: false
    t.string "suggested_layout_id"
    t.datetime "updated_at", null: false
    t.integer "version", default: 1, null: false
    t.index "((source ->> 'igMediaId'::text))", name: "index_reference_cards_on_ig_media_id", unique: true, where: "(source ? 'igMediaId'::text)"
    t.index ["analysis_status"], name: "index_reference_cards_on_analysis_status"
    t.index ["archetypes"], name: "index_reference_cards_on_archetypes", using: :gin
    t.index ["curated_by_id"], name: "index_reference_cards_on_curated_by_id"
    t.index ["niche"], name: "index_reference_cards_on_niche"
    t.index ["status", "format", "replicability"], name: "index_reference_cards_on_status_and_format_and_replicability"
  end

  create_table "reference_eval_pairs", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "brand_core_id", null: false
    t.boolean "control", default: false, null: false
    t.string "copied_sides", default: [], null: false, array: true
    t.datetime "created_at", null: false
    t.datetime "decided_at"
    t.uuid "decided_by_id"
    t.string "left_arm", null: false
    t.integer "left_cost_micro_usd", default: 0, null: false
    t.uuid "left_piece_ids", default: [], null: false, array: true
    t.text "notes"
    t.string "objective"
    t.integer "position", null: false
    t.string "reasons", default: [], null: false, array: true
    t.string "request_key", null: false
    t.text "request_text", null: false
    t.string "right_arm", null: false
    t.integer "right_cost_micro_usd", default: 0, null: false
    t.uuid "right_piece_ids", default: [], null: false, array: true
    t.string "round", null: false
    t.datetime "updated_at", null: false
    t.integer "usable_left"
    t.integer "usable_right"
    t.string "verdict"
    t.index ["brand_core_id"], name: "index_reference_eval_pairs_on_brand_core_id"
    t.index ["decided_by_id"], name: "index_reference_eval_pairs_on_decided_by_id"
    t.index ["round", "position"], name: "index_reference_eval_pairs_on_round_and_position", unique: true
  end

  create_table "reference_import_accounts", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.decimal "baseline_median", precision: 12, scale: 2
    t.datetime "created_at", null: false
    t.integer "eligible_count"
    t.string "error_code"
    t.datetime "fetched_at"
    t.integer "fetched_count"
    t.integer "followers_count"
    t.string "name"
    t.uuid "reference_import_id", null: false
    t.datetime "retry_at"
    t.string "status", default: "pending", null: false
    t.datetime "updated_at", null: false
    t.string "username", null: false
    t.index ["reference_import_id", "username"], name: "idx_on_reference_import_id_username_b26fadea2f", unique: true
    t.index ["reference_import_id"], name: "index_reference_import_accounts_on_reference_import_id"
  end

  create_table "reference_imports", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.datetime "created_at", null: false
    t.uuid "curated_by_id"
    t.string "niche"
    t.string "size"
    t.datetime "updated_at", null: false
    t.index ["created_at"], name: "index_reference_imports_on_created_at"
    t.index ["curated_by_id"], name: "index_reference_imports_on_curated_by_id"
  end

  create_table "sessions", id: :uuid, default: -> { "gen_random_uuid()" }, force: :cascade do |t|
    t.uuid "account_id", null: false
    t.uuid "acting_organization_id"
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "ip_address"
    t.datetime "last_used_at"
    t.string "token_digest", null: false
    t.datetime "updated_at", null: false
    t.string "user_agent"
    t.index ["account_id"], name: "index_sessions_on_account_id"
    t.index ["acting_organization_id"], name: "index_sessions_on_acting_organization_id"
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
  add_foreign_key "agent_conversations", "accounts", on_delete: :nullify
  add_foreign_key "agent_conversations", "brand_cores"
  add_foreign_key "agent_conversations", "organizations"
  add_foreign_key "agent_turns", "accounts", on_delete: :nullify
  add_foreign_key "agent_turns", "agent_conversations"
  add_foreign_key "agent_turns", "organizations"
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
  add_foreign_key "folders", "brand_cores"
  add_foreign_key "folders", "organizations"
  add_foreign_key "image_generations", "accounts", on_delete: :nullify
  add_foreign_key "image_generations", "agent_turns", on_delete: :nullify
  add_foreign_key "image_generations", "brand_cores"
  add_foreign_key "image_generations", "organizations"
  add_foreign_key "notifications", "organizations"
  add_foreign_key "onboarding_events", "accounts", on_delete: :nullify
  add_foreign_key "onboarding_events", "brand_cores", on_delete: :nullify
  add_foreign_key "onboarding_events", "organizations"
  add_foreign_key "password_resets", "accounts"
  add_foreign_key "piece_renders", "piece_versions"
  add_foreign_key "piece_versions", "accounts", on_delete: :nullify
  add_foreign_key "piece_versions", "pieces"
  add_foreign_key "pieces", "accounts", on_delete: :nullify
  add_foreign_key "pieces", "agent_turns", on_delete: :nullify
  add_foreign_key "pieces", "brand_core_versions", on_delete: :nullify
  add_foreign_key "pieces", "brand_cores"
  add_foreign_key "pieces", "organizations"
  add_foreign_key "reference_candidates", "reference_cards", on_delete: :nullify
  add_foreign_key "reference_candidates", "reference_import_accounts", on_delete: :cascade
  add_foreign_key "reference_cards", "accounts", column: "curated_by_id", on_delete: :nullify
  add_foreign_key "reference_eval_pairs", "accounts", column: "decided_by_id", on_delete: :nullify
  add_foreign_key "reference_eval_pairs", "brand_cores", on_delete: :cascade
  add_foreign_key "reference_import_accounts", "reference_imports", on_delete: :cascade
  add_foreign_key "reference_imports", "accounts", column: "curated_by_id", on_delete: :nullify
  add_foreign_key "sessions", "accounts"
  add_foreign_key "sessions", "organizations", column: "acting_organization_id", on_delete: :nullify
  add_foreign_key "uploads", "accounts", on_delete: :nullify
  add_foreign_key "uploads", "organizations"
end
