#!/usr/bin/env ruby
# frozen_string_literal: true

# Recicla um arquivo do ancient-app para o backend do Vekoo aplicando o mapa de
# nomes de docs/migration/CONVENTIONS.md, para todo domínio renomear do mesmo jeito.
#
#   ruby docs/migration/tools/recycle.rb <origem> [destino]
#   ruby docs/migration/tools/recycle.rb --stdin < arquivo        (imprime o resultado)
#
#   <origem>  relativo a /home/warley/sandbox/ancient-app (ou absoluto)
#   [destino] relativo a backend/ no worktree atual; sem ele, o caminho é derivado
#
# O resultado NÃO está pronto: é o ponto de partida. O script lista o que exige
# decisão humana (ver `ATTENTION`), e a regra é só dar o arquivo por portado depois
# de resolver tudo, principalmente `legacy_assistant`.

SOURCE_ROOT = '/home/warley/sandbox/ancient-app'
BACKEND_ROOT = File.expand_path('../../../backend', __dir__)

# A ordem importa e é deliberada:
#  1. No ancient-app, "organization" é o ASSISTENTE (fora do escopo). Vira o marcador
#     `legacy_assistant` ANTES de qualquer coisa, senão se confundiria com o passo 2.
#  2. "core_account"/"workspace" é o que o Vekoo chama de Organization.
#  3. Depois vêm os domínios, do nome mais específico para o mais genérico.
RENAMES = [
  # --- 1. assistente (Admin::Organization) -> marcador a eliminar -------------
  [/Admin::Organization\b/, 'LegacyAssistant'],
  [/Admin::Current\.organization\b/, 'Current.legacy_assistant'],
  [/\badmin_organization_ids\b/, 'legacy_assistant_ids'],
  [/\badmin_organization_id\b/, 'legacy_assistant_id'],
  [/\bcurrent_organization_id\b/, 'legacy_assistant_id'],
  [/\bactive_organization_id\b/, 'legacy_assistant_id'],
  [/\badmin_organizations\b/, 'legacy_assistants'],
  [/\badmin_organization\b/, 'legacy_assistant'],
  [/\bcurrent_organization\b/, 'legacy_assistant'],
  [/\borganization_uuids\b/, 'legacy_assistant_uuids'],
  [/\borganization_uuid\b/, 'legacy_assistant_uuid'],
  [/\borg_uuid\b/, 'legacy_assistant_uuid'],
  [/\borganization_ids\b/, 'legacy_assistant_ids'],
  [/\borganization_id\b/, 'legacy_assistant_id'],
  [/\borganizations\b/, 'legacy_assistants'],
  [/\borganization\b/, 'legacy_assistant'],
  [/\bautomation_id\b/, 'legacy_assistant_uuid'],

  # --- avisos e push (antes de "workspace") -----------------------------------
  [/WorkspaceAlertService/, 'OrganizationAlertService'],
  [/WorkspaceAlertsChannel/, 'OrganizationAlertsChannel'],
  [/WorkspaceAlert/, 'OrganizationAlert'],
  [/workspace_alerts/, 'organization_alerts'],
  [/workspace_alert/, 'organization_alert'],
  [/PushNotificationService/, 'Push::Delivery'],
  # O `Notification` da origem é o aviso por pessoa. O do Vekoo é outra coisa.
  [/\bNotification\b/, 'AccountNotice'],
  [/PushSubscription/, 'PushDevice'],
  [/push_subscriptions/, 'push_devices'],
  [/push_subscription/, 'push_device'],

  # --- 2. workspace -> Organization -------------------------------------------
  [/Admin::Current\.core_account\b/, 'Current.organization'],
  [/Admin::Current\.user\b/, 'Current.account'],
  [/Admin::Current\b/, 'Current'],
  [/Admin::CoreAccount\b/, 'Organization'],
  [/\badmin_core_account_hashid\b/, 'organization_id'],
  [/\badmin_core_account_id\b/, 'organization_id'],
  [/\badmin_core_accounts\b/, 'organizations'],
  [/\badmin_core_account\b/, 'organization'],
  [/\bcurrent_core_account\b/, 'current_organization'],
  [/\bcore_account_id\b/, 'organization_id'],
  [/\bcore_accounts\b/, 'organizations'],
  [/\bcore_account\b/, 'organization'],
  [/\bCoreAccount\b/, 'Organization'],
  [/\bworkspace_id\b/, 'organization_id'],
  [/\bworkspaces\b/, 'organizations'],
  [/\bworkspace\b/, 'organization'],

  # --- pessoas e permissões ---------------------------------------------------
  [/Admin::UserDepartment\b/, 'TeamMembership'],
  [/Admin::UserAccess\b/, 'LegacyUserAccess'],
  [/\badmin_user_accesses\b/, 'legacy_user_accesses'],
  [/\buser_accesses\b/, 'legacy_user_accesses'],
  [/\buser_access\b/, 'legacy_user_access'],
  [/Admin::User\b/, 'Account'],
  [/\badmin_user_ids\b/, 'account_ids'],
  [/\badmin_user_id\b/, 'account_id'],
  [/\badmin_users\b/, 'accounts'],
  [/\badmin_user\b/, 'account'],
  [/\bcurrent_user\b/, 'current_account'],
  [/\bcreated_by_user_id\b/, 'created_by_account_id'],
  [/\bupdated_by_user_id\b/, 'updated_by_account_id'],
  [/\bupdated_by_user\b/, 'updated_by_account'],
  [/\bassigned_user_id\b/, 'assigned_account_id'],
  [/\bassigned_user\b/, 'assigned_account'],
  [/\buser_ids\b/, 'account_ids'],
  [/\buser_id\b/, 'account_id'],
  [/Admin::AuthorizationRole\b/, 'AccessRole'],
  [/AuthorizationRole/, 'AccessRole'],
  [/authorization_roles/, 'access_roles'],
  [/authorization_role/, 'access_role'],
  [/\bauth_map\b/, 'permissions'],
  [/Admin::Department\b/, 'Team'],
  [/\badmin_department_id\b/, 'team_id'],
  [/\bassign_department_id\b/, 'team_id'],
  [/\bdepartment_ids\b/, 'team_ids'],
  [/\bdepartment_id\b/, 'team_id'],
  [/UserDepartment/, 'TeamMembership'],
  [/user_departments/, 'team_memberships'],
  [/Departments/, 'Teams'],
  [/Department/, 'Team'],
  [/departments/, 'teams'],
  [/department/, 'team'],
  [/Admin::ApplicationRecord\b/, 'ApplicationRecord'],

  # --- copiloto do chat (antes de "conversation") ------------------------------
  [/ChatAssistantConversation/, 'CopilotThread'],
  [/chat_assistant_conversations/, 'copilot_threads'],
  [/Aiva::ChatAssistant::LlmClient/, 'Ai::LlmClient'],
  [/Aiva::ChatAssistant/, 'Copilot'],
  [/ChatAssistant/, 'Copilot'],
  [/chat_assistant/, 'copilot'],

  # --- conectores (Integration) ------------------------------------------------
  [/Integration::WhatsappBusiness/, 'Connector::WhatsappCloud'],
  [/Integration::WhatsappApi/, 'Connector::WhatsappWeb'],
  [/Integration::WebBubble/, 'Connector::WebWidget'],
  [/Integration::/, 'Connector::'],
  [/WhatsappBusiness/, 'WhatsappCloud'],
  [/whatsapp_business/, 'whatsapp_cloud'],
  [/WebBubble/, 'WebWidget'],
  [/web_bubble/, 'web_widget'],
  [/IntegrationEventService/, 'ConnectorEventService'],
  [/IntegrationEvent/, 'ConnectorEvent'],
  [/integration_events/, 'connector_events'],
  [/integration_event/, 'connector_event'],
  [/IntegrationsChannel/, 'ConnectorsChannel'],
  [/\bintegration_ids\b/, 'connector_ids'],
  [/\bintegration_id\b/, 'connector_id'],
  [/Integrations/, 'Connectors'],
  [/Integration/, 'Connector'],
  [/integrations/, 'connectors'],
  [/integration/, 'connector'],
  [/MessageTemplate/, 'WhatsappTemplate'],
  [/message_templates/, 'whatsapp_templates'],
  [/message_template/, 'whatsapp_template'],
  [/Oauth2Token/, 'OauthCredential'],
  [/oauth2_tokens/, 'oauth_credentials'],
  [/oauth2_token/, 'oauth_credential'],

  # --- chat (Conversation / MessageHistory) ------------------------------------
  [/MessageHistory::TextMessage/, 'ChatMessage::Text'],
  [/MessageHistory::ImageMessage/, 'ChatMessage::Image'],
  [/MessageHistory::AudioMessage/, 'ChatMessage::Audio'],
  [/MessageHistory::MediaMessage/, 'ChatMessage::Media'],
  [/MessageHistory/, 'ChatMessage'],
  [/message_history_bases/, 'chat_message_bases'],
  [/message_history/, 'chat_messages'],
  [/ConversationTag/, 'ChatTag'],
  [/conversation_tag_ids/, 'chat_tag_ids'],
  [/conversation_tags/, 'chat_tags'],
  [/conversation_tag/, 'chat_tag'],
  [/ConversationListChannel/, 'ChatListChannel'],
  [/ConversationChannel/, 'ChatChannel'],
  [/Conversations::/, 'Chats::'],
  [/Conversations/, 'Chats'],
  [/Conversation/, 'Chat'],
  [/conversation_ids/, 'chat_ids'],
  [/conversation_id/, 'chat_id'],
  [/conversations/, 'chats'],
  [/conversation/, 'chat'],
  [/CONVERSATION/, 'CHAT'],
  [/ChatSnippet/, 'QuickReply'],
  [/chat_snippets/, 'quick_replies'],
  [/chat_snippet/, 'quick_reply'],
  [/ChatAttachment/, 'Attachment'],
  [/chat_attachments/, 'attachments'],
  [/chat_attachment/, 'attachment'],
  [/ChatFilter/, 'ChatView'],
  [/chat_filters/, 'chat_views'],
  [/chat_filter/, 'chat_view'],
  [/InstanceVariable::Definition/, 'CustomField'],
  [/InstanceVariable::Value/, 'CustomFieldValue'],
  [/ImportedContact/, 'ContactImportRow'],
  [/imported_contacts/, 'contact_import_rows'],
  [/imported_contact/, 'contact_import_row'],
  [/ContactImportBatch/, 'ContactImport'],
  [/contact_import_batches/, 'contact_imports'],
  [/contact_import_batch/, 'contact_import'],
  [/ScheduledAutomation/, 'ScheduledAction'],
  [/scheduled_automations/, 'scheduled_actions'],
  [/scheduled_automation/, 'scheduled_action'],

  # --- funil (o antigo "pipeline" é o Funil; precisa vir ANTES de kanban) -------
  [/PipelineController/, 'FunnelsController'],
  [/\bpipeline_enabled\b/, 'funnel_enabled'],
  [/\bPipeline\b/, 'Funnel'],
  [/\bpipeline\b/, 'funnel'],
  [/ConversationFunnel/, 'ChatFunnel'],

  # --- pipelines (Kanban) --------------------------------------------------------
  [/KanbanBoardChannel/, 'PipelineBoardChannel'],
  [/KanbanBoardTemplate/, 'Pipelines::BoardTemplate'],
  [/KanbanBoard/, 'Pipelines::Board'],
  [/KanbanColumnChecklistItem/, 'Pipelines::StageChecklistItem'],
  [/KanbanColumn/, 'Pipelines::Stage'],
  [/KanbanCardColumnCheck/, 'Pipelines::CardStageCheck'],
  [/KanbanCardActivity/, 'Pipelines::CardActivity'],
  [/KanbanCardAttachment/, 'Pipelines::CardAttachment'],
  [/KanbanCardLabel/, 'Pipelines::CardLabel'],
  [/KanbanCardWatcher/, 'Pipelines::CardWatcher'],
  [/KanbanCard/, 'Pipelines::Card'],
  [/KanbanChecklistItem/, 'Pipelines::ChecklistItem'],
  [/KanbanChecklist/, 'Pipelines::Checklist'],
  [/KanbanCommentAttachment/, 'Pipelines::CommentAttachment'],
  [/KanbanCommentReaction/, 'Pipelines::CommentReaction'],
  [/KanbanComment/, 'Pipelines::Comment'],
  [/KanbanCustomFieldDefinition/, 'Pipelines::CustomField'],
  [/KanbanGoal/, 'Pipelines::Goal'],
  [/KanbanLabel/, 'Pipelines::Label'],
  [/KanbanSavedFilterFavorite/, 'Pipelines::SavedFilterFavorite'],
  [/KanbanSavedFilter/, 'Pipelines::SavedFilter'],
  [/KanbanTriggerExecution/, 'Pipelines::TriggerExecution'],
  [/KanbanTrigger/, 'Pipelines::Trigger'],
  [/Kanban::/, 'Pipelines::'],
  [/Kanban/, 'Pipelines'],
  [/kanban_column_checklist_items/, 'pipeline_stage_checklist_items'],
  [/kanban_card_column_checks/, 'pipeline_card_stage_checks'],
  [/kanban_columns/, 'pipeline_stages'],
  [/kanban_column_id/, 'stage_id'],
  [/kanban_column/, 'pipeline_stage'],
  [/kanban_board_id/, 'board_id'],
  [/kanban_card_id/, 'card_id'],
  [/kanban_label_id/, 'label_id'],
  [/kanban_(\w+)/, 'pipeline_\1'],
  [/kanban/, 'pipelines'],

  # --- agenda (Scheduling) --------------------------------------------------------
  [/Scheduling::Appointment/, 'Agenda::Booking'],
  [/Scheduling::Collaborator/, 'Agenda::Professional'],
  [/Scheduling::Service/, 'Agenda::Offering'],
  [/Scheduling::SchedulingRule/, 'Agenda::Rule'],
  [/Scheduling::/, 'Agenda::'],
  [/AppointmentService/, 'Agenda::BookingService'],
  [/CalendarChannel/, 'AgendaChannel'],
  [/Appointments/, 'Bookings'],
  [/Appointment/, 'Booking'],
  [/appointments/, 'bookings'],
  [/appointment/, 'booking'],
  [/Collaborators/, 'Professionals'],
  [/Collaborator/, 'Professional'],
  [/collaborators/, 'professionals'],
  [/collaborator/, 'professional'],

  # --- catálogo -> products (GET /catalog já é o acervo da ferramenta) -----------
  [/CatalogImportChannel/, 'ProductImportChannel'],
  [/CatalogItemEmbedding/, 'Products::Embedding'],
  [/CatalogItemCategory/, 'Products::ItemCategory'],
  [/CatalogItem/, 'Products::Item'],
  [/CatalogCategory/, 'Products::Category'],
  [/CatalogFieldDefinition/, 'Products::FieldDefinition'],
  [/CatalogImportRow/, 'Products::ImportRow'],
  [/CatalogImport/, 'Products::Import'],
  [/CatalogImage/, 'Products::Image'],
  [/Catalog::/, 'Products::'],
  [/catalog_item_embeddings/, 'product_embeddings'],
  [/catalog_item_categories/, 'product_item_categories'],
  [/catalog_items/, 'product_items'],
  [/catalog_item/, 'product_item'],
  [/catalog_categories/, 'product_categories'],
  [/catalog_category/, 'product_category'],
  [/catalog_field_definitions/, 'product_field_definitions'],
  [/catalog_field_definition/, 'product_field_definition'],
  [/catalog_import_rows/, 'product_import_rows'],
  [/catalog_import/, 'product_import'],
  [/catalog_images/, 'product_images'],
  [/catalog_image/, 'product_image'],

  # --- campanhas -> outreach ------------------------------------------------------
  [/Campaign::Base/, 'Outreach::Campaign'],
  [/Campaign::Batch/, 'Outreach::Batch'],
  [/Campaign::Recipient/, 'Outreach::Recipient'],
  [/Campaign::ActivityLog/, 'Outreach::ActivityLog'],
  [/Campaigns::/, 'Outreach::'],
  [/CampaignSendJob/, 'Outreach::SendJob'],
  [/CampaignBatchJob/, 'Outreach::BatchJob'],
  [/CampaignRecoveryJob/, 'Outreach::RecoveryJob'],
  [/CampaignScheduledLaunchJob/, 'Outreach::ScheduledLaunchJob'],
  [/Apify::Extraction/, 'Outreach::PlaceExtraction'],
  [/ApifyExtractionJob/, 'Outreach::PlaceExtractionJob'],
  [/ApifyExtractionChannel/, 'PlaceExtractionChannel'],
  [/apify_extractions/, 'place_extractions'],
  [/apify_extraction/, 'place_extraction'],

  # --- webhooks de saída -> Hook ---------------------------------------------------
  [/WebhookAction/, 'HookAction'],
  [/WebhookLog/, 'HookLog'],
  [/webhook_actions/, 'hook_actions'],
  [/webhook_logs/, 'hook_logs'],
  [/webhook_log/, 'hook_log'],
  [/webhook_id/, 'hook_id'],
  [/Webhooks::/, 'Hooks::'],
  [/\bWebhook\b/, 'Hook'],

  # --- ferramentas ---------------------------------------------------------------
  [/FunctionAction::/, 'ToolFunction::'],
  [/FunctionAction/, 'ToolFunction'],
  [/function_actions/, 'tool_functions'],
  [/function_action/, 'tool_function'],

  # --- métricas -------------------------------------------------------------------
  [/Metrics::/, 'Insights::'],
  [/Rollups::/, 'Insights::Rollups::'],

  # --- API, jobs e casca ----------------------------------------------------------
  [/ApplicationApiController/, 'PlatformController'],
  [/Api::Platform::/, ''],
  [/Api::V1::/, ''],
  [/Api::V2::/, ''],
  [%r|"/api/platform/\#\{[^}]+\}/|, '"/'],
  [%r|'/api/platform/\#\{[^}]+\}/|, "'/"],
  [/\bbefore_action :set_core_account\b.*\n/, ''],
  [/\bbefore_action :set_organization\b.*\n/, ''],
  [/^(\s*)include Sidekiq::(?:Job|Worker)\s*\n/, ''],
  [/\.perform_async\(/, '.perform_later('],
  [/\.perform_in\(\s*([^,\n]+),\s*/, '.set(wait: \1).perform_later('],
  [/\.perform_at\(\s*([^,\n]+),\s*/, '.set(wait_until: \1).perform_later('],
  [/\bcreate\(:organization\b/, 'create(:organization']
].freeze

# Tudo isto exige olhar humano — o script aponta, não decide.
ATTENTION = {
  /legacy_assistant|LegacyAssistant/ => 'assistente: remover ou trocar pelo equivalente em fluxos/organização',
  /LegacyUserAccess|legacy_user_access/ => 'acesso: aqui a pessoa pertence direto à organização (Account)',
  /Admin::/ => 'namespace Admin não existe no Vekoo',
  /ca_hashid|hashid/i => 'o hashid do Vekoo é do vínculo (Account#hashid, X-Account), nunca da organização',
  /sidekiq_options|Sidekiq::Status|Sidekiq::Job/ => 'usar ActiveJob (ApplicationJob); cancelamento por token, sem Sidekiq::Status',
  /Aiva::|OpenAI::Client|Anthropic::Client/ => 'LLM: usar a camada Ai:: do Vekoo',
  /\bStripe|Packages::|PlanLimit|plan_gated|package_enforced|BillingProfile|CreditPool/ => 'billing/planos fora do escopo: remover',
  /AiCredits|CreditUsage/ => 'créditos: usar Organization#consume_credits',
  /render json: \{ *errors?:/ => 'erro: usar render_error/render_invalid',
  /as_json|to_json/ => 'serialização: usar serializer explícito (camelCase + epoch_ms)',
  /\.first\b|\.last\b/ => 'Mongo em coleção grande: preferir .take / order_by explícito',
  /ActionCable\.server\.broadcast/ => 'transmissão: escopar pela organização',
  /\bRabbit|Bunny/ => 'RabbitMQ fora do escopo: eventos do Evolution chegam por webhook'
}.freeze

def recycle(text)
  RENAMES.reduce(text) { |current, (pattern, replacement)| current.gsub(pattern, replacement) }
end

def derive_destination(source)
  relative = source.delete_prefix("#{SOURCE_ROOT}/")
  relative = relative.sub(%r{\Aapp/sidekiq/}, 'app/jobs/')
                     .sub(%r{\Aapp/controllers/api/(platform|v1|v2)/}, 'app/controllers/')
                     .sub(%r{\Aspec/sidekiq/}, 'spec/jobs/')
                     .sub(%r{\Aspec/requests/api/(platform|v1|v2)/}, 'spec/requests/')
  recycle(relative)
end

if ARGV.first == '--stdin'
  print recycle($stdin.read)
  exit 0
end

abort 'uso: recycle.rb <origem> [destino]' if ARGV.empty?

source = ARGV[0].start_with?('/') ? ARGV[0] : File.join(SOURCE_ROOT, ARGV[0])
abort "não encontrei #{source}" unless File.file?(source)

destination = File.join(BACKEND_ROOT, ARGV[1] || derive_destination(source))
result = recycle(File.read(source))

require 'fileutils'
FileUtils.mkdir_p(File.dirname(destination))
File.write(destination, result)

puts "#{source.delete_prefix("#{SOURCE_ROOT}/")} -> #{destination.delete_prefix("#{BACKEND_ROOT}/")}"
ATTENTION.each do |pattern, note|
  hits = result.lines.each_with_index.select { |line, _| line.match?(pattern) }
  next if hits.empty?

  puts "  ! #{note}: linhas #{hits.first(12).map { |_, index| index + 1 }.join(', ')}#{hits.size > 12 ? ' …' : ''}"
end
