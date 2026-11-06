# Manifesto da migração

O que sai de `ancient-app` + `aiva-frontend` e entra no Vekoo, por fase. Cada linha é uma frente isolada, executada por um sub-agent em worktree próprio; as frentes de uma mesma fase rodam ao mesmo tempo. Regras em [CONVENTIONS.md](CONVENTIONS.md).

**Princípio:** o back-end é **reciclado** (`recycle.rb` + adaptação + specs). O front-end é **recriado** com a estética nova, mantendo as funcionalidades. Por isso a maior parte do trabalho está nas fases 3 e 4.

Legenda: ⬜ a fazer · 🔄 em andamento · ✅ integrado

## Menu final

```
INÍCIO             Dashboard                                     /dashboard
INTELIGÊNCIA ART.  Fluxos (substitui Assistentes)                /flows, /flows/:id, /tools
PRODUTIVIDADE      Calendário                                    /calendar…
                   Pipelines (lista de quadros)                  /pipelines/:boardId/:view
ATENDIMENTO        Chat                                          /chat, /chat/:chatId
                   Contatos                                      /contacts
                   Catálogo                                      /catalog, /catalog/categories, /catalog/fields, /catalog/:itemId
                   Funis                                         /funnels
                   Campanhas                                     /campaigns, /campaigns/new, /campaigns/:id
CRIAÇÃO            Carrosséis, Modelos, Marcas, Lixeira, Pastas  (o Vekoo de hoje: /carousels…)
SISTEMA            Configurações                                 /settings/…
                     Usuários (+ Departamentos, Grupos)          /settings/users, /settings/teams, /settings/access-roles
                     Integrações                                 /settings/integrations, /settings/integrations/:id
                     Webhooks                                    /settings/webhooks
                     Mensagens Rápidas                           /settings/quick-replies
                     Anexos                                      /settings/attachments
                     Campos personalizados                       /settings/custom-fields
```

## Fora do escopo

| Recurso | Motivo |
|---|---|
| **Assistentes** (`/assistants`, `Admin::Organization`, prompts, steps, Q&A, web scraping, triggers de assistente, playground, onboarding wizard) | Substituídos por **Fluxos**, por pedido |
| **Marketing Pro** (`/agents`, `/dna`, `/knowledge-library`, `Agent*`, `CompanyDna`, `KnowledgeFile`) | Por pedido |
| Billing, planos, pacotes, Stripe, Asaas, pools de crédito | Não estão no menu pedido; o Vekoo tem créditos próprios |
| Painéis internos (`workspace-insights`, `tools-catalog` admin, `package-types`, `plans`), `super_user` | Administração interna da origem |
| Multi-workspace (uma pessoa em várias organizações) | O Vekoo tem um `Account` por organização; `CLAUDE.md` já prevê para etapa futura |
| RabbitMQ | Eventos do Evolution chegam por webhook, sem novo serviço de infraestrutura |
| Migração de **dados** | Só código. Nada é copiado dos bancos da origem |
| Chat de suporte, script agent, agente de dashboard | Comentado na origem, ou preso a assistente |

## Decisões de arquitetura

1. **Funis sem assistente.** Na origem as colunas do funil vêm das `classification_steps` do assistente. Aqui nasce o modelo `Funnel` (Postgres: nome + etapas), e a posição da conversa fica em `Chat#funnel_stages` (`{ funnel_id => stage_id }`), alterável manualmente na tela e por bloco de fluxo.
2. **Fluxos substituem assistentes** no caminho da mensagem recebida: `Flows::InboundDispatcher` é o único ponto de automação.
3. **Sessão por organização:** sem `:ca_hashid` nas URLs. Na tela, sem `/:workspaceId`.
4. **Copiloto do chat** (`Aiva::ChatAssistant`) entra, sobre a camada `Ai::` do Vekoo (Anthropic), cobrando créditos.
5. **Tudo em uma branch:** `platform-migration`. O `main` fica intacto até a decisão de levar.

---

## Fase 0 — Fundação ✅ (feita pelo integrador)

Mongo + pgvector no compose; Mongoid; `Current`; `PlatformController` (sessão, permissão, paginação, camelCase); ActionCable autenticado; rotas/locale/seed/schedule por domínio; `AccessRole`/`Team`; `StringEnum`/`EncryptedField`; `recycle.rb`; `worktree-setup.sh`; deps de front; primitivas shadcn novas.

## Fase 1 — Núcleo e casca (5 frentes simultâneas)

| # | Frente | Domínio de arquivos | Status |
|---|---|---|---|
| 1 | **be-core**: conectores + chat base | `connectors` | ✅ |
| 2 | **be-access**: pessoas, avisos, push | `access` | ✅ |
| 3 | **be-products**: catálogo | `products` | ✅ |
| 4 | **fe-shell**: menu, rotas, mobile, PWA | casca | ✅ |
| 5 | **fe-kit**: componentes compartilhados | `components/shared` | ✅ |

### 1. be-core (agente 1)

Modelos: `Conversation`, `MessageHistory::*`, `ConversationTag`, `Integration::*` exceto `GoogleCalendar`, que é da agenda (inclusive `whatsapp_api/providers/*`), `Integration::DisconnectionLog`, `IntegrationEvent`, `MessageTemplate`, `Proxy`, `Audience`, `Contact`, `Oauth2Token`, `DailyConversationStat` (só o modelo). Concerns: `MetaMessagingConcern`, `PublicMediaUrl`, `CsvExportable`, `BusinessWorkWindow`, `Alertable` (em conjunto com o be-access: só o concern).
Libs: `lib/meta_api_client*`, `lib/zapi_client*`, `lib/lead_chat_api`, `lib/br_phone_variants.rb`, `lib/content_processing`.
Entrada (webhooks → `/inbound/...`): `v1/whatsapp_business`, `v1/zapi`, `v1/wapi`, `v1/meta_messaging`, `v1/leadchat`, `app/consumers/evolution/event_handler.rb` (por webhook, sem RabbitMQ).
Saída/processamento: `app/sidekiq/{base_message_job,base_message_helper,text_message_job,image_message_job,audio_message_job,enable_contact_job,instances_reload_jobs,waba_status_retry_job,instagram_token_refresh_job}`, `app/services/{message_handling,post_message_service,post_message_v2_service,waba_error_handler,waba_status_update_service,integration_event_service}`, `app/services/{messages,media,conversations}/`.
API: `platform/integrations_controller` → `/connectors` (templates, perfil WABA, números, Instagram, conexão/reconexão), `platform/media_downloads_controller`.
Tempo real: `ConversationChannel`, `ConversationListChannel`, `IntegrationsChannel`.
Corte do assistente: a mensagem recebida persiste, transmite e chama `Flows::InboundDispatcher` (crie só um stub com o método `.call` e no-op; o be-automation o substitui). Geração de resposta por LLM dentro de `TextMessageJob` sai.
Specs correspondentes em `spec/{models,requests,services,sidekiq,lib,channels}`.
Não inclui: API de listagem do chat, contatos, etiquetas (Fase 2, be-inbox). Inclui o modelo `ChatTag`, porque `Chat` depende dele. Web widget (`widget/`, `Widget::`): inclua `Connector::WebWidget` e a API `/widget/v1`, o tempo real do widget e os serviços; o bundle embutível `aiva-frontend/widget` fica fora (ver pendências).

### 2. be-access (agente 2)

`platform/users_controller`, `departments_controller`, `authorization_roles_controller`, `workspace_controller` (→ `/organization`), `workspace_alerts_controller` (→ `/alerts`), `notifications_controller`, `push_subscriptions_controller` (→ `/push-devices`), `account/profile_controller` (→ `/profile`).
Modelos: `Notification` da origem (Mongo; aqui `AccountNotice`, unificado na lista de `GET /notifications` com o `Notification` key-based já existente), `WorkspaceAlert`, `PushSubscription`. Serviços: `push_notification_service`, `workspace_alert_service`. Canais: `NotificationsChannel`, `WorkspaceAlertsChannel`. `AccessRole`/`Team`/`Account` já existem (Fase 0): faça a API, regras (convite/criação de usuário, senha, revogar, grupos, departamentos, `check-email`) e specs. VAPID por ENV.

### 3. be-products (agente 3)

`platform/catalog/*` → `/products/...`; modelos `Catalog*` → `Products::*`; `app/services/catalog/`; `app/sidekiq/catalog/`; `CatalogImportChannel`; busca semântica com pgvector (`neighbor`) e embeddings. Specs e semente.

### 4. fe-shell (agente 4)

Sidebar agrupada conforme o "Menu final", recolhível, com sub-itens e badges de alerta (`/alerts`); quadros de pipeline como sub-itens; menu da conta e seletor de idioma existentes mantidos; `AppShell` com topbar por rota. Rotas lazy por domínio com placeholder (`src/routes/<dominio>/index.tsx`) e `/` → `/dashboard`, carrosséis em `/carousels`. Shell mobile (`layout/Dashboard/MobileShell`, `mobile-header`): barra inferior, painel "Mais", modo imersivo. `useCan`/`RequirePermission`. Cable (`lib/cable.ts`, `use-channel`). **PWA**: `vite-plugin-pwa` nas mesmas regras da origem (`generateSW`, `registerType: 'prompt'`, sem `skipWaiting`/`clientsClaim`, `importScripts: sw-push.js`, `globIgnores` do opus, manifest com identidade Vekoo e ícones), `PWAUpdateScreen`, push (`usePushNotifications`, `sw-push.js`, `useNotificationPermission`), viewport (`use-visual-viewport`, `visual-viewport-bridge`, `mobile-viewport-meta`), `_headers` (CSP com `wss:`, `worker-src`, microfone liberado para áudio do chat). i18n por domínio (glob em `lib/i18n.ts`). Centro de notificações no topo (`Notification.jsx`).

### 5. fe-kit (agente 5)

`src/components/shared/`: `PageHeader`, `PageBody`, `DataTable` (TanStack: cabeçalho fixo, ordenação, filtro por coluna, densidade, paginação, ações, loading/vazio), `FilterBar`, `SearchInput`, `FacetedFilter`, `SortMenu`, `StatTile`, `StatusBadge`, `ConfirmDialog`, `UserAvatar`, `AvatarStack`, `TagChip`, `ColorPicker`, `FileDropzone`, `DateRangePicker`, `ResponsiveDialog` (Dialog no desktop, Sheet no celular), `SidePanel`, `SegmentedControl`, `InfiniteList`, skeletons, `Field` para RHF, `lib/motion.ts`, hooks utilitários reaproveitados da origem (`use-debounce`, `use-local-storage`, `use-media-query`, `use-boolean`, `use-long-press`, `use-unsaved-changes`), utilitários (`format-phone`, `tag-color`, `format-number`, `date-format`). README do kit com exemplos. Página de vitrine interna em `/dev/kit` só em desenvolvimento.

---

## Fase 2 — Back-end dos domínios

Dividida em duas levas, para cada frente poder testar de verdade o que usa, em vez de programar contra código que não existe no worktree dela:

- **2a (paralelo):** o que só depende do núcleo já integrado.
- **2b (depois da 2a):** quem depende do motor de scripts ou lê dados de vários domínios.

| # | Leva | Frente | Domínio | Status |
|---|---|---|---|---|
| 6 | 2a | **be-inbox**: API do chat, contatos, etiquetas, visões, mensagens rápidas, anexos, campos, importação, copiloto | `inbox` | ✅ |
| 8 | 2a | **be-agenda**: calendários, agendamentos, turmas, sequências, Google, ações agendadas da conversa | `agenda` | ✅ |
| 9 | 2a | **be-outreach**: campanhas, Apify, Sheets | `outreach` | ✅ |
| 28 | 2a | **be-engine**: motor de scripts (núcleo e extensões genéricas) | `lib/mini_racer_engine` | ✅ |
| 7 | 2b | **be-pipelines**: quadros, cards, gatilhos, metas, filtros, extensão `kanban` do motor | `pipelines` | 🔄 |
| 10 | 2b | **be-automation**: fluxos, runtime, ferramentas, webhooks de saída, extensões `scheduling` do motor | `automation` | 🔄 |
| 11 | 2b | **be-insights**: dashboard, funis, dashboards personalizados | `insights` | ✅ |

- **be-inbox:** `v1/conversations_controller` (→ `/chats`), `v2/conversations`, `v2/unified_contacts`, `v1/contacts` (→ `/contacts`, filtros, exportação, ações em lote), `platform/{conversations,chat_snippets,chat_filters,attachments,definitions}`, `ContactsExportJob`, `ProcessContactImportJob`, `ImportedContact`, `ContactImportBatch`, `ChatAttachment`, `AudioAttachment`, `ChatFilter`, `ChatSnippet`, `InstanceVariable::*`, `app/services/custom_attributes/`, `Aiva::ChatAssistant` + `ChatAssistantChannel` + `ChatAssistantConversation` + `ChatAssistantJob` (Copiloto), `ContactsExportChannel`.
- **be-pipelines:** `platform/kanban/*`, `platform/kanban_controller`, `Kanban*`, `app/services/kanban/`, `app/jobs/kanban/`, `concerns/kanban/`, `KanbanBoardChannel`, code runner dos gatilhos (`triggers/code_runner_job`), extensão `kanban` do motor (`lib/mini_racer_engine/workers/kanban.rb`).
- **be-agenda:** `platform/{calendar,calendars,collaborators,services,class_groups,class_sessions,class_enrollments,class_attendances,attendance_sequences,contact_notification_previews}`, `Scheduling::*`, `app/services/scheduling/`, `appointment_service`, `app/sidekiq/{scheduling/*,notification_*,google_calendar_*,active_google_event_job}`, `Integration::GoogleCalendar`, `v1/google_calendar`, `CalendarChannel`, `ScheduledAutomation` + `platform/scheduled_automations` + `app/services/scheduled_automations/` (sem follow-up de assistente, só o que sobra sem ele), `calendar_stats` do `dashboard_controller`.
- **be-outreach:** `platform/{campaigns,apify_extractions}`, `Campaign::*`, `Apify::Extraction`, `app/services/campaigns/`, `app/sidekiq/{campaign_*,apify_extraction_job}`, `ApifyExtractionChannel`.
- **be-automation:** `platform/{flows,flows/*,flow_templates,workspace_tools,tool_catalog,webhooks,webhook_logs}`, `Flow*`, `Tool`, `ToolInstallation`, `FunctionAction::*`, `Webhook`, `WebhookAction::*`, `WebhookLog`, `lib/flow_runtime`, `lib/flow_engine`, `app/services/{flows,tools,webhooks}/`, `app/sidekiq/flows/`, `FlowPlaygroundChannel`, `FlowChatSandboxChannel`, `v1/webhook_controller`, extensões `scheduling` e `class_group_scheduling` do motor. `WebhookAction::AssignAutomation` vira "iniciar fluxo". Blocos de IA sobre `Ai::`.
- **be-engine:** `lib/mini_racer_engine` (núcleo, `console`, `fetch`, `web_apis`, `contact`, `contact_storage`, `tag`, `maps`, `dynamic_table`, `catalog`), `app/services/mini_racer_service.rb`, `DynamicTable`, `DynamicRecord`. Fora: `register_follow_up` e `semantic_search`, presos a assistente.
- **be-insights:** `platform/{dashboard,pipeline,custom_dashboards}`, `app/services/{metrics,rollups,custom_dashboards}/`, `conversation_{analytics,funnel,stats}`, `dashboard_backfill_job`, `CustomDashboard*`, `DataSource` só se for do dashboard; modelo novo `Funnel` (decisão 1), CRUD de funis e movimento de conversa entre etapas.

## Fase 3 — Front-end, parte 1 (cada frente começa assim que o back-end dela estiver integrado)

| # | Frente | Origem principal | Status |
|---|---|---|---|
| 12 | **fe-settings-people**: usuários, departamentos, grupos, perfil, notificações | `components/{users,departments,authorization-roles,profile}`, `pages/settings/*`, `NotificationSettingsPage`, `PushNotificationSettings`, `Profile/*` | ✅ |
| 13 | **fe-settings-content**: mensagens rápidas, anexos, campos personalizados | `components/{chat-snippets,attachments,custom-fields,definitions}`, `pages/settings/{chat-snippets,attachments,custom-fields}` | ✅ |
| 14 | **fe-connectors**: integrações, detalhes, templates, conexão | `components/integrations`, `pages/settings/integration*`, `useIntegrations`, `useIntegrationDetails` | ✅ |
| 15 | **fe-chat-core**: lista, abas, filtros, conversa, composer, mídia, reações, tempo real | `sections/apps/chat`, `components/chat`, `api/chat/*`, `pages/apps/chat*`, stores do chat | 🔄 |
| 16 | **fe-catalog**: catálogo, categorias, campos, importação | `pages/catalog`, `components/catalog`, `use-catalog-import` | ✅ |
| 27 | **fe-contacts**: lista de contatos, filtros, ações em lote, exportação, importação | `pages/contacts`, `components/contacts`, `useContacts` | 🔄 |
| 17 | **fe-dashboard-funnels**: dashboard + funis | `pages/dashboard`, `sections/dashboard`, `components/{cards/dashboard,dashboard-page,pipeline}`, `pages/pipeline` | 🔄 |
| 18 | **fe-automation**: fluxos, editor, playground, ferramentas, webhooks + logs | `pages/flows`, `components/{flow-builder,tools,webhooks,webhook-logs,code-editor}`, `pages/settings/webhooks` | ⬜ |

## Fase 4 — Front-end, parte 2 (8 frentes)

| # | Frente | Origem principal | Status |
|---|---|---|---|
| 19 | **fe-chat-details**: painel do contato, atribuição, etiquetas, notas, templates, agendados, copiloto, ações em lote | `sections/apps/chat/{UserDetails,…}`, `components/{chat-assistant,chat}` | ⬜ |
| 20 | **fe-chat-mobile**: experiência móvel completa do chat | `sections/apps/chat-mobile`, `pages/apps/chat-mobile` | ⬜ |
| 21 | **fe-pipelines-board**: quadro, lista, card, comentários, checklist, arrastar | `components/kanban-v2/{board,column,card}`, `pages/apps/kanban-v2` | ⬜ |
| 22 | **fe-pipelines-admin**: gatilhos, metas, campos, filtros salvos, modelos, métricas, arquivados | `components/kanban-v2/{trigger,goals,filter}`, `use-kanban-*` | ⬜ |
| 23 | **fe-calendar**: agenda, eventos, turmas, serviços, colaboradores, sequências, Google | `sections/apps/calendar`, `pages/apps/calendar*`, `pages/assistants/apps/scheduling`, `components/appointments` | 🔄 |
| 24 | **fe-campaigns-list**: lista, KPIs, monitor, extrações | `pages/campaigns/{list,monitor,shared}`, `apify-contacts-tab` | ⬜ |
| 25 | **fe-campaigns-wizard**: assistente de campanha, importações, Sheets, Apify | `pages/campaigns/wizard` | ⬜ |
| 26 | **fe-custom-dashboards**: construtor de dashboards | `components/custom-dashboards`, `pages/custom-dashboards`, `formula-engine` | ⬜ |

## Fase 5 — Integração e qualidade (integrador)

Juntar frentes, regenerar `schema.rb`, suíte completa, build e lint, semente completa, varredura visual de todas as rotas (desktop e 390 px), revisão de segurança, `CLAUDE.md`, `DEPLOY.md` (Mongo em produção, VAPID, `MONGODB_URI`, CSP), `bin/setup`/`bin/dev`.
