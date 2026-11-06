# Pipelines (`pipelines`): contrato da API

Base: `/pipelines`. Na origem, "Kanban V2": quadros, etapas, cards, comentários, checklists, campos personalizados, gatilhos, metas, filtros salvos, modelos, métricas e tempo real.

Todas as respostas abaixo são reais, capturadas de um Puma, um Sidekiq, um Sidekiq de scripts e um cliente WebSocket de verdade, com a semente carregada (`db/seeds/pipelines.rb`). Listas e ids longos foram encurtados com `…`.

## Regras gerais

| | |
|---|---|
| **Sessão** | `Authorization: Bearer <token>`. Sem ela: `401 unauthorized`. |
| **Permissão** | Recurso `pipelines` em todas as rotas e no canal. Sem ele: `403 forbidden`. |
| **Organização** | Sempre a da sessão. Id de outra organização responde `404`, igual a id que não existe. |
| **Entrada** | camelCase, com **envelope**: `{ board: {…} }`, `{ stage: {…} }`, `{ item: {…} }`, `{ card: {…} }`, `{ comment: {…} }`, `{ checklist: {…} }`, `{ customField: {…} }`, `{ trigger: {…} }`, `{ goal: {…} }`, `{ savedFilter: {…} }`, `{ label: {…} }`. Sem o envelope: `400 parameterMissing`. Ações soltas, sem envelope: ver cada rota. |
| **Saída** | camelCase. Ids são string (UUID). Datas em **milissegundos**, com duas exceções em texto: `expectedCloseDate` (`"2026-12-06"`) e `periodMonth` (`"2026-11"`). |
| **Idioma** | `?locale=` ou `Accept-Language`. Vale para `message`. O `code` nunca muda. |
| **Fuso** | O da organização. "Hoje", "este mês" e a meta do mês valem nele, e não em UTC. |
| **Posição** | `position` começa em **1**, em etapas, cards, itens, checklists e campos. O índice de `move` também. |

### O nome é `stage`

Em tudo que é público, a coluna da origem se chama **etapa**: `stage`, `stages`, `stageId`, `stage_entered_at`, `requiredToLeaveStage`, `stagesConfig`, `scope: "stage"`, evento `stage_created`, token `{{stage.name}}`, campo de filtro `stage_id`. A conversa é **chat**: `chatId`, `chatSummary`.

A única exceção é a API JS `kanban.*`, que é contrato de quem escreve script: lá continuam `kanban_column_id`, `conversation_id`, `columns`, `kanban.listColumns`, `kanban.findCardsForConversation`. Ver [API JS](#api-js-kanban).

| Origem | Aqui |
|---|---|
| `KanbanBoard`, `kanban_boards` | `Pipelines::Board`, `pipeline_boards` |
| `KanbanColumn`, `kanban_columns` | `Pipelines::Stage`, `pipeline_stages` |
| `KanbanCard`, `kanban_cards` | `Pipelines::Card`, `pipeline_cards` |
| `KanbanColumnChecklistItem` | `Pipelines::StageChecklistItem` |
| `KanbanCardColumnCheck` | `Pipelines::CardStageCheck` |
| `KanbanCustomFieldDefinition` | `Pipelines::CustomField` |
| `KanbanComment`, `KanbanTrigger`, `KanbanGoal`, `KanbanLabel`, `KanbanSavedFilter`… | `Pipelines::Comment`, `Pipelines::Trigger`, `Pipelines::Goal`, `Pipelines::Label`, `Pipelines::SavedFilter`… |
| `kanban_column_id`, `conversation_id`, `column_entered_at` | `stage_id`, `chat_id`, `stage_entered_at` |
| `admin_core_account_id` | `organization_id` (também direto em `pipeline_cards`, para não juntar duas tabelas a cada leitura) |

## Quadros

### `GET /pipelines/boards`

É o que o menu lateral consome (`usePipelineBoards`). `cardsCount` só conta o que a pessoa enxerga.

| Parâmetro | Descrição |
|---|---|
| `archived` | `true` traz os arquivados, no lugar dos ativos. |
| `withStages` | `true` inclui as etapas de cada quadro, sem os cards: é o que alimenta os seletores de quadro e etapa. |

```json
{
  "boards": [
    {
      "id": "cd2080ac-…",
      "name": "Pós-venda",
      "description": "O caminho de cada pedido depois da compra: separação, envio, entrega e acompanhamento.",
      "color": "#0891B2",
      "icon": "package-check",
      "templateKey": null,
      "boardType": "standard",
      "archived": false,
      "autoArchiveDays": 60,
      "dealCloseBehavior": "manual",
      "dealCloseArchiveDays": null,
      "dealRottingDays": 7,
      "requireFieldsOnDealWon": false,
      "requireFieldsOnDealLost": false,
      "leadScoreFieldKey": null,
      "leadScoreLow": 30,
      "leadScoreHigh": 70,
      "cardVisibility": "all",
      "cardVisibilityBypassRoleIds": [],
      "createdAt": 1794000633956,
      "updatedAt": 1794000633956,
      "viewerCanViewAllCards": true,
      "cardsCount": 5,
      "stagesCount": 5
    },
    "…"
  ],
  "meta": { "total": 2 }
}
```

Com `withStages=true`:

```json
{
  "boards": [
    {
      "id": "cd2080ac-…",
      "name": "Pós-venda",
      "description": "O caminho de cada pedido depois da compra: separação, envio, entrega e acompanhamento.",
      "color": "#0891B2",
      "icon": "package-check",
      "templateKey": null,
      "boardType": "standard",
      "archived": false,
      "autoArchiveDays": 60,
      "dealCloseBehavior": "manual",
      "dealCloseArchiveDays": null,
      "dealRottingDays": 7,
      "requireFieldsOnDealWon": false,
      "requireFieldsOnDealLost": false,
      "leadScoreFieldKey": null,
      "leadScoreLow": 30,
      "leadScoreHigh": 70,
      "cardVisibility": "all",
      "cardVisibilityBypassRoleIds": [],
      "createdAt": 1794000633956,
      "updatedAt": 1794000633956,
      "viewerCanViewAllCards": true,
      "cardsCount": 5,
      "stagesCount": 5,
      "stages": [
        { "id": "2d61b3f8-…", "name": "Pedido confirmado", "position": 1 },
        "…"
      ]
    },
    "…"
  ]
}
```

### `GET /pipelines/boards/:id`

O quadro inteiro, com etapas, cards ativos, `customFields` e `triggers`. Aceita os mesmos filtros de `GET .../cards` (`savedFilterId`, `presetKey`, `filter`): aí cada etapa traz só os cards que passam, e `appliedFilter` diz qual filtro foi aplicado (`{ "presetKey": "rotten_deals" }`, `{ "savedFilterId": "…" }` ou `{ "inline": true }`).

`viewerCanViewAllCards: false` quer dizer que o quadro está restrito para esta pessoa: ela só recebe os cards atribuídos a ela.

```json
{
  "id": "e4fad388-…",
  "name": "Vendas no atacado",
  "description": "Negociações de revenda e de pedidos para empresas, do primeiro contato ao fechamento.",
  "color": "#1D4ED8",
  "icon": "hand-coins",
  "templateKey": null,
  "boardType": "crm",
  "archived": false,
  "autoArchiveDays": 90,
  "dealCloseBehavior": "auto_archive_days",
  "dealCloseArchiveDays": 30,
  "dealRottingDays": 7,
  "requireFieldsOnDealWon": true,
  "requireFieldsOnDealLost": false,
  "leadScoreFieldKey": "lead_score",
  "leadScoreLow": 30,
  "leadScoreHigh": 70,
  "cardVisibility": "all",
  "cardVisibilityBypassRoleIds": [],
  "createdAt": 1794000634904,
  "updatedAt": 1794000635068,
  "viewerCanViewAllCards": true,
  "stages": [
    {
      "id": "44238844-…",
      "boardId": "e4fad388-…",
      "name": "Novos contatos",
      "position": 1,
      "color": "#90CAF9",
      "wipLimit": null,
      "slaHours": 24,
      "cards": [
        {
          "id": "564a1f1f-…",
          "title": "Patrícia Gomes",
          "description": "Veio pelo anúncio do Instagram. Quer saber da coleção de linho para revender no ateliê.",
          "priority": "medium",
          "status": null,
          "dueDate": null,
          "position": 1,
          "audienceId": null,
          "assignedToId": "1ceab622-…",
          "createdById": "1ceab622-…",
          "chatId": "6aee4111c3b4323f421d2066",
          "stageId": "44238844-…",
          "tags": [],
          "colorLabel": null,
          "customFieldValues": { "pecas": 15, "lead_score": 10, "origem_do_contato": "Anúncio" },
          "archived": false,
          "completedAt": null,
          "createdAt": 1793914235123,
          "updatedAt": 1794000635123,
          "dealValue": 1850,
          "dealProbability": 20,
          "companyName": "Ateliê Gomes",
          "contactEmail": "patricia@ateliegomes.com.br",
          "contactPhone": "5531988887777",
          "wonAt": null,
          "lostAt": null,
          "lostReason": null,
          "stageEnteredAt": 1794000635123,
          "expectedCloseDate": "2026-12-06",
          "assignedTo": {
            "id": "1ceab622-…",
            "name": "Juliana Ferreira",
            "email": "juliana.ferreira@exemplo.com.br",
            "avatarUrl": null
          },
          "createdBy": {
            "id": "1ceab622-…",
            "name": "Juliana Ferreira",
            "email": "juliana.ferreira@exemplo.com.br",
            "avatarUrl": null
          },
          "labels": [
            { "id": "10fe3d6a-…", "name": "Quente", "color": "#DC2626" }
          ],
          "commentsCount": 0,
          "watchersCount": 0,
          "hasChat": true,
          "checklistProgress": { "completed": 0, "total": 0 },
          "stageChecksProgress": { "completed": 0, "total": 0 },
          "isRotting": false,
          "chatSummary": {
            "id": "6aee4111c3b4323f421d2066",
            "contactName": "Patrícia Gomes",
            "contactPhone": "5531988887777",
            "profilePictureUrl": null,
            "status": "open",
            "lastMessageAt": 1793732820000
          }
        },
        "…"
      ]
    },
    "…"
  ],
  "customFields": [
    {
      "id": "0c36747d-…",
      "key": "origem_do_contato",
      "name": "Origem do contato",
      "fieldType": "select",
      "position": 1,
      "required": true,
      "options": [ "WhatsApp", "…" ],
      "defaultValue": null,
      "scope": "board",
      "stageId": null,
      "requiredToLeaveStage": false
    },
    "…"
  ],
  "triggers": [
    {
      "id": "be3a8688-…",
      "name": "Distribuir novos contatos",
      "eventType": "card_created",
      "conditions": {},
      "actions": [
        {
          "type": "assign_user",
          "accountIds": [ "1ceab622-…", "…" ]
        }
      ],
      "active": true,
      "stageId": "44238844-…",
      "createdAt": 1794000636613,
      "updatedAt": 1794000636613
    },
    "…"
  ],
  "appliedFilter": null
}
```

### `POST /pipelines/boards`

```json
{ "board": { "name": "Ao vivo", "description": "Quadro de verificação", "color": "#7C3AED", "icon": "kanban" } }
```

Sem `templateKey`, nasce com as etapas padrão, nomeadas no idioma da requisição. `201` com o mesmo formato do detalhe:

```json
{
  "id": "5689228f-…",
  "name": "Ao vivo",
  "description": "Quadro de verificação",
  "color": "#7C3AED",
  "icon": "kanban",
  "boardType": "standard",
  "stages": [
    {
      "id": "2e473253-…",
      "boardId": "5689228f-…",
      "name": "A fazer",
      "position": 1,
      "color": null,
      "wipLimit": null,
      "slaHours": null,
      "cards": []
    },
    "…"
  ]
}
```

Com `{ "board": { "templateKey": "onboarding", "name": "Ao vivo, de modelo" } }`, nasce com as etapas do modelo. `name` é opcional nesse caso: sem ele, vale o do modelo.

```json
{
  "id": "87b4ef27-…",
  "name": "Ao vivo, de modelo",
  "templateKey": "onboarding",
  "boardType": "standard",
  "stages": [
    {
      "id": "927a54f4-…",
      "boardId": "87b4ef27-…",
      "name": "Cadastro",
      "position": 1,
      "color": "#90CAF9",
      "wipLimit": null,
      "slaHours": null,
      "cards": []
    },
    "…"
  ]
}
```

| Campo | Regra |
|---|---|
| `name` | Obrigatório, até 120 caracteres. |
| `boardType` | `standard` (padrão) ou `crm`. Só `crm` tem gatilhos de negócio. |

### `PATCH /pipelines/boards/:id`

```json
{ "board": { "name": "Ao vivo editado", "autoArchiveDays": 30 } }
```

| Campo | Regra |
|---|---|
| `autoArchiveDays` | Arquiva sozinho o card parado há mais do que isso. `null` desliga. |
| `dealCloseBehavior` | O que acontece ao fechar um negócio: `manual` (nada), `immediate` (arquiva na hora), `auto_archive_days` (arquiva depois de `dealCloseArchiveDays`). |
| `dealRottingDays` | Depois de quantos dias na mesma etapa o negócio aberto vira `isRotting`. |
| `requireFieldsOnDealWon`, `requireFieldsOnDealLost` | Fechar exige os campos obrigatórios (`requiredFieldsIncomplete`). |
| `leadScoreFieldKey` | `key` de um campo do tipo `number` do quadro. Outro valor: `422 invalidLeadScoreField`. |
| `leadScoreLow`, `leadScoreHigh` | 0 a 1000. |
| `cardVisibility` | `all` ou `assigned`. Com `assigned`, cada pessoa só vê os cards dela, e `cardVisibilityBypassRoleIds` precisa de ao menos um grupo. |
| `cardVisibilityBypassRoleIds` | Grupos que continuam vendo tudo. A dona da organização sempre vê tudo. |

Duas travas na visibilidade: quem está restrito não muda a regra (`403 forbidden`), e ninguém salva uma regra que o tranque para fora (`422 visibilityLockout`).

```json
{
  "id": "5689228f-…",
  "name": "Ao vivo editado",
  "cardVisibility": "assigned",
  "cardVisibilityBypassRoleIds": [ "46828810-…" ],
  "viewerCanViewAllCards": true
}
```

### `DELETE /pipelines/boards/:id`

`204`. Leva etapas, cards, gatilhos, metas e filtros, e resolve os alertas dos gatilhos apagados. Quem está restrito ouve `403`: apagaria cards que não enxerga.

### `POST /pipelines/boards/:id/archive`

Sem corpo, arquiva. `{ "undo": true }` tira do arquivo. `200` com o quadro, sem as etapas.

```json
{
  "id": "87b4ef27-…",
  "name": "Ao vivo, de modelo",
  "archived": true,
  "cardVisibility": "all",
  "viewerCanViewAllCards": true
}
```

### `GET /pipelines/boards/:id/metrics`

Respeita a visibilidade: quem está restrito só conta os próprios cards.

- `avgTimePerStage` é o tempo médio, em horas, que os cards passam em cada etapa: as passagens já encerradas, de uma movimentação até a seguinte, mais as que seguem em aberto nos cards ativos. Na origem, a conta media a distância até o `updated_at` do card, agrupada pela etapa atual: qualquer edição mudava o número de todas.
- `dealSummary.conversionRate` é ganhos ÷ (ganhos + perdidos), em %.
- `weightedPipelineValue` soma `dealValue × dealProbability / 100` dos negócios abertos. `forecast` agrupa os negócios abertos por mês de `expectedCloseDate`; lá, sem probabilidade conta 50%.

```json
{
  "cardsPerStage": [
    { "stageId": "44238844-…", "stageName": "Novos contatos", "count": 2, "color": "#90CAF9", "position": 1 },
    "…"
  ],
  "dealValuePerStage": [
    { "stageId": "44238844-…", "stageName": "Novos contatos", "totalValue": 11450, "count": 2 },
    "…"
  ],
  "cardsByPriority": { "medium": 6, "urgent": 1, "high": 4, "low": 2 },
  "overdueCount": 1,
  "dealSummary": {
    "wonCount": 5,
    "wonValue": 56150,
    "lostCount": 2,
    "lostValue": 5300,
    "openCount": 9,
    "openValue": 59780,
    "conversionRate": 71.4
  },
  "avgTimePerStage": [
    { "stageId": "44238844-…", "stageName": "Novos contatos", "avgHours": 70.6 },
    "…"
  ],
  "totalCards": 13,
  "totalDealValue": 71730,
  "weightedPipelineValue": 33491.5,
  "forecast": [
    { "month": "2026-11", "totalValue": 29830, "count": 6, "weightedValue": 18696.5 },
    "…"
  ]
}
```

#### Com período: `?from=YYYY-MM-DD&to=YYYY-MM-DD`

Sem as datas, a resposta é a de cima. Com elas, vem também `period`, com o que aconteceu entre as duas datas, inclusive, no fuso da organização. Até três anos; fora disso, ou com uma data só, `422 invalidPeriod`. O resto da resposta continua sendo a fotografia de agora.

- `previous` é o período imediatamente anterior, do mesmo tamanho, para comparar. `conversionRate` é `null` quando nada fechou.
- `series`: um ponto por dia até 31 dias, por semana (segunda-feira) até 183, por mês depois disso. `bucket` diz qual, e a lista não tem buracos.
- `stageConversion`: dos cards **criados no período** (`cohort`), quantos chegaram a cada etapa ou além (`reached`). Vale o ponto mais avançado por onde o card passou: voltar uma etapa não apaga o que ele alcançou, e pular uma conta como ter passado por ela. `won` é quantos desses foram ganhos.
- `avgTimePerStage`: a mesma conta de cima, só com as passagens que terminaram no período, mais as que seguem em aberto se o período chega até hoje. `passages` é quantas entraram na conta; sem nenhuma, `avgHours` é `null`.
- `ranking`: quem fechou mais no período, até 20 pessoas, pelo valor ganho. Card sem responsável não entra.

```json
{
  "cardsPerStage": [ "…" ],
  "period": {
    "from": "2026-10-08",
    "to": "2026-11-06",
    "previousFrom": "2026-09-08",
    "previousTo": "2026-10-07",
    "bucket": "day",
    "summary": { "createdCount": 6, "wonCount": 2, "wonValue": 8650, "lostCount": 1, "lostValue": 1200, "conversionRate": 66.7 },
    "previous": { "createdCount": 4, "wonCount": 1, "wonValue": 2750, "lostCount": 0, "lostValue": 0, "conversionRate": 100 },
    "series": [
      { "date": "2026-10-08", "createdCount": 0, "wonCount": 0, "wonValue": 0, "lostCount": 0 },
      "…"
    ],
    "stageConversion": {
      "cohort": 6,
      "won": 2,
      "stages": [
        { "stageId": "44238844-…", "stageName": "Novos contatos", "color": "#90CAF9", "position": 1, "reached": 6 },
        "…"
      ]
    },
    "avgTimePerStage": [
      { "stageId": "44238844-…", "stageName": "Novos contatos", "color": "#90CAF9", "avgHours": 70.6, "passages": 8 },
      "…"
    ],
    "ranking": [
      {
        "user": { "id": "1ceab622-…", "name": "Juliana Ferreira", "avatarUrl": null },
        "wonCount": 2,
        "wonValue": 8650,
        "lostCount": 1,
        "conversionRate": 66.7
      }
    ]
  }
}
```

### `GET /pipelines/boards/:id/archived-cards`

Cards fora do quadro: arquivados, ganhos ou perdidos. Parâmetros: `status` (`archived`, `won`, `lost`; sem ele, todos), `search` (no título), `page`, `perPage` (padrão 50).

```json
{
  "cards": [
    {
      "id": "de507036-…",
      "title": "Lucas Oliveira",
      "description": "Primeira compra no atacado. Pagou no Pix.",
      "priority": "medium",
      "status": null,
      "dueDate": null,
      "assignedToId": "1ceab622-…",
      "createdById": "1ceab622-…",
      "chatId": "6aee4111c3b4323f421d2061",
      "stageId": "7f873ec1-…",
      "tags": [],
      "colorLabel": null,
      "archived": false,
      "completedAt": 1793827835952,
      "createdAt": 1792618235949,
      "updatedAt": 1793741435949,
      "dealValue": 2750,
      "dealProbability": 100,
      "companyName": "Oliveira Presentes",
      "contactEmail": "lucas@oliveirapresentes.com.br",
      "contactPhone": "5541991234567",
      "wonAt": 1793827835952,
      "lostAt": null,
      "lostReason": null,
      "assignedTo": {
        "id": "1ceab622-…",
        "name": "Juliana Ferreira",
        "email": "juliana.ferreira@exemplo.com.br",
        "avatarUrl": null
      },
      "createdBy": {
        "id": "1ceab622-…",
        "name": "Juliana Ferreira",
        "email": "juliana.ferreira@exemplo.com.br",
        "avatarUrl": null
      },
      "labels": [
        { "id": "c4d55be4-…", "name": "Indicação", "color": "#059669" }
      ],
      "stageName": "Fechamento",
      "stageColor": "#A5D6A7"
    },
    "…"
  ],
  "meta": { "page": 1, "perPage": 50, "total": 5, "totalPages": 1, "hasMore": false }
}
```

### `GET /pipelines/templates`

Os modelos de quadro, globais e em pt-BR. Nascem no primeiro uso, sem depender da semente. `templateKey` é o que vai em `POST /pipelines/boards`. `icon` é nome de ícone do lucide.

```json
{
  "templates": [
    {
      "id": "63e45bcc-…",
      "name": "Onboarding",
      "description": "Acompanhe a chegada de cada novo cliente, do cadastro ao acompanhamento.",
      "templateKey": "onboarding",
      "icon": "user-plus",
      "color": "#FF9800",
      "defaultBoardType": "standard",
      "stagesConfig": [
        { "name": "Cadastro", "color": "#90CAF9", "position": 0 },
        { "name": "Configuração", "color": "#CE93D8", "position": 1 },
        "…"
      ],
      "customFieldsConfig": [
        {
          "name": "Plano",
          "options": [ "Básico", "…" ],
          "fieldType": "select"
        },
        "…"
      ]
    },
    "…"
  ],
  "meta": { "total": 4 }
}
```

## Etapas

| Rota | Corpo | Resposta |
|---|---|---|
| `POST /pipelines/boards/:boardId/stages` | `{ "stage": { "name", "color", "wipLimit", "slaHours", "position" } }` | `201`, a etapa |
| `PATCH /pipelines/boards/:boardId/stages/:id` | O mesmo | `200`, a etapa |
| `DELETE /pipelines/boards/:boardId/stages/:id` | | `204`. Leva os cards da etapa. Quem está restrito ouve `403`. |
| `POST /pipelines/boards/:boardId/stages/reorder` | `{ "orderedIds": ["…"] }` | `204`. Emite `stages_reordered`. |

`slaHours`: passou disso sem sair da etapa, o responsável é avisado e os gatilhos `sla_breached` rodam, uma vez por passagem. `wipLimit` é informativo: a API não recusa o card que passa do limite, como na origem.

```json
{
  "id": "3e908aae-…",
  "boardId": "e4fad388-…",
  "name": "Ao vivo editada",
  "position": 6,
  "color": "#654321",
  "wipLimit": 3,
  "slaHours": 12
}
```

### Checklist obrigatório da etapa

O que precisa ser feito antes de sair dela. **Trava só para a frente**: voltar uma etapa não exige nada.

| Rota | Corpo | Resposta |
|---|---|---|
| `GET …/stages/:stageId/checklist-items` | | `{ "items": [...], "meta": {...} }` |
| `POST …/stages/:stageId/checklist-items` | `{ "item": { "title", "required", "position" } }` | `201`, o item |
| `PATCH …/stages/:stageId/checklist-items/:id` | O mesmo | `200`, o item |
| `DELETE …/stages/:stageId/checklist-items/:id` | | `204` |
| `POST …/stages/:stageId/checklist-items/reorder` | `{ "orderedIds": ["…"] }` | `204` |

```json
{
  "items": [
    {
      "id": "3fb99c3c-…",
      "stageId": "3e908aae-…",
      "title": "Conferir",
      "position": 1,
      "required": true,
      "createdAt": 1794000658450,
      "updatedAt": 1794000658450
    },
    {
      "id": "b08933f0-…",
      "stageId": "3e908aae-…",
      "title": "Conferir de novo",
      "position": 2,
      "required": false,
      "createdAt": 1794000663268,
      "updatedAt": 1794000663268
    }
  ],
  "meta": { "total": 2 }
}
```

## Cards

### O card

```json
{
  "id": "13b96fc6-…",
  "title": "Fernanda Lima",
  "description": "Quer todo o lote novo de bolsas de palha do Maranhão. Pediu 5% à vista.",
  "priority": "urgent",
  "status": null,
  "dueDate": null,
  "position": 1,
  "audienceId": null,
  "assignedToId": "1ceab622-…",
  "createdById": "1ceab622-…",
  "chatId": "6aee4110c3b4323f421d204d",
  "stageId": "92fd5305-…",
  "tags": [],
  "colorLabel": null,
  "customFieldValues": { "pecas": 70, "lead_score": 80, "origem_do_contato": "WhatsApp" },
  "archived": false,
  "completedAt": null,
  "createdAt": 1793050235657,
  "updatedAt": 1793914235657,
  "dealValue": 5900,
  "dealProbability": 75,
  "companyName": "Empório da Fernanda",
  "contactEmail": "fernanda@emporiodafernanda.com.br",
  "contactPhone": "5531971810932",
  "wonAt": null,
  "lostAt": null,
  "lostReason": null,
  "stageEnteredAt": 1793914235657,
  "expectedCloseDate": "2026-11-13",
  "assignedTo": {
    "id": "1ceab622-…",
    "name": "Juliana Ferreira",
    "email": "juliana.ferreira@exemplo.com.br",
    "avatarUrl": null
  },
  "createdBy": {
    "id": "1ceab622-…",
    "name": "Juliana Ferreira",
    "email": "juliana.ferreira@exemplo.com.br",
    "avatarUrl": null
  },
  "labels": [
    { "id": "10fe3d6a-…", "name": "Quente", "color": "#DC2626" },
    "…"
  ],
  "commentsCount": 1,
  "watchersCount": 0,
  "hasChat": true,
  "checklistProgress": { "completed": 0, "total": 0 },
  "stageChecksProgress": { "completed": 0, "total": 0 },
  "isRotting": false,
  "descriptionJson": null,
  "watchers": [],
  "attachments": [],
  "chatSummary": {
    "id": "6aee4110c3b4323f421d204d",
    "contactName": "Fernanda Lima",
    "contactPhone": "5531971810932",
    "profilePictureUrl": null,
    "status": "open",
    "lastMessageAt": 1793906820000,
    "connectorId": "6aee4110c3b4323f421d2030",
    "connectorType": "Connector::WhatsappWeb",
    "activeSession": false
  },
  "activities": [
    {
      "id": "9c7dea39-…",
      "action": "commented",
      "details": {
        "body": "Dá para dar os 5% à vista? O lote inteiro sai de uma vez.",
        "commentId": "4a249163-…"
      },
      "createdAt": 1794000635747,
      "user": {
        "id": "1ceab622-…",
        "name": "Juliana Ferreira",
        "email": "juliana.ferreira@exemplo.com.br",
        "avatarUrl": null
      }
    },
    "…"
  ]
}
```

- `priority`: `low`, `medium`, `high`, `urgent` ou `null`.
- `chatSummary` só vem se a pessoa enxerga a conversa (`Chat.visible_to`); senão, `null`, com `hasChat: true`. Nos eventos de tempo real ele nunca vem, porque o evento vai para todo mundo no quadro: a tela lê ao abrir o card.
- `descriptionJson`, `watchers`, `attachments` e `activities` só vêm no detalhe (`GET .../cards/:id` e as respostas de escrita).
- Tetos: 50 tags, 500 caracteres de título, 64 KB em `customFieldValues`, 256 KB em `descriptionJson`.

### `GET /pipelines/cards?chatId=`

Os cards de uma conversa, em todos os quadros: é o painel do contato, no chat. Sem esta rota, a tela faria uma requisição por quadro a cada conversa aberta. Conversa que a pessoa não enxerga (`Chat.visible_to`) responde `404`. Ficam de fora o card arquivado, o de quadro arquivado e, em quadro restrito, o que não é da pessoa. Até 50, do mais recente para o mais antigo. Mesmo formato de card, com o nome da etapa e do quadro, porque aqui não há um quadro aberto.

```json
{
  "cards": [
    {
      "id": "1e51dadb-…",
      "title": "Carlos Eduardo Santos",
      "priority": "high",
      "dealValue": 3200.0,
      "wonAt": null,
      "lostAt": null,
      "chatId": "6aee0e5817c01071cdba2bda",
      "stageId": "95af78…",
      "stage": { "id": "95af78…", "name": "Qualificação" },
      "board": { "id": "48014125-…", "name": "Vendas no atacado", "color": "#7C3AED" },
      "…": "…"
    }
  ]
}
```

### `GET /pipelines/boards/:boardId/cards`

Paginado. A leitura principal do quadro é `GET /pipelines/boards/:id`: esta é para listas e buscas.

| Parâmetro | Descrição |
|---|---|
| `page`, `perPage` | Padrão 25 por página, máximo 100. |
| `search` | No título, sem caixa. |
| `priority`, `assignedToId`, `chatId` | Igualdade. |
| `tags[]` | Qualquer uma das tags. |
| `dueDateFrom`, `dueDateTo` | `YYYY-MM-DD`. |
| `overdue` | `true`: prazo vencido e não concluído. |
| `savedFilterId`, `presetKey`, `filter` | Filtro avançado, nessa ordem de precedência. `filter` é a [definição](#filtros) em JSON, como texto. |
| `countOnly` | `1`: responde só `{ "count": N }`. É a prévia do construtor de filtro. |
| `sort`, `direction` | `title`, `stage`, `assignee`, `priority`, `dueDate`, `value`, `probability`, `expectedClose`, `company`, `leadScore`, `createdAt`, `updatedAt`; `asc` (padrão) ou `desc`. Sem valor fica no fim nos dois sentidos, e a ordem do quadro desempata. `priority` vai pela importância; `leadScore`, pelo campo `leadScoreFieldKey`. Nome desconhecido não muda a ordem. |

```json
{
  "cards": [
    {
      "id": "1e51dadb-…",
      "title": "Hotel Serra Azul: enxoval da loja",
      "description": "Contrato em revisão. Falta só a forma de pagamento para fechar.",
      "priority": "medium",
      "status": null,
      "dueDate": null,
      "position": 1,
      "audienceId": null,
      "assignedToId": "1ceab622-…",
      "createdById": "1ceab622-…",
      "chatId": null,
      "stageId": "7f873ec1-…",
      "tags": [],
      "colorLabel": null,
      "customFieldValues": { "origem_do_contato": "Site", "forma_de_pagamento": "Pix" },
      "archived": false,
      "completedAt": 1794000660324,
      "createdAt": 1792791035845,
      "updatedAt": 1794000660325,
      "dealValue": 6200,
      "dealProbability": 90,
      "companyName": "Hotel Serra Azul",
      "contactEmail": "gerencia@serraazul.com.br",
      "contactPhone": "5433310022",
      "wonAt": null,
      "lostAt": 1794000660324,
      "lostReason": "Sem orçamento",
      "stageEnteredAt": 1793914235845,
      "expectedCloseDate": "2026-11-09",
      "assignedTo": {
        "id": "1ceab622-…",
        "name": "Juliana Ferreira",
        "email": "juliana.ferreira@exemplo.com.br",
        "avatarUrl": null
      },
      "createdBy": {
        "id": "1ceab622-…",
        "name": "Juliana Ferreira",
        "email": "juliana.ferreira@exemplo.com.br",
        "avatarUrl": null
      },
      "labels": [
        { "id": "52c3f4a9-…", "name": "Atacado", "color": "#1D4ED8" },
        "…"
      ],
      "commentsCount": 0,
      "watchersCount": 0,
      "hasChat": false,
      "checklistProgress": { "completed": 0, "total": 0 },
      "stageChecksProgress": { "completed": 0, "total": 0 },
      "isRotting": false,
      "chatSummary": null
    }
  ],
  "meta": { "page": 1, "perPage": 2, "total": 1, "totalPages": 1, "hasMore": false }
}
```

`?countOnly=1&filter={"version":1,"all":[{"field":"deal_value","operator":"gte","value":5000}]}`:

```json
{ "count": 5 }
```

### `POST /pipelines/boards/:boardId/cards`

```json
{ "card": { "stageId": "a91f8ac7-…", "title": "Teste ao vivo", "priority": "high", "dealValue": 1234.5, "customFieldValues": { "origem_do_contato": "Site" } } }
```

| Campo | Regra |
|---|---|
| `stageId` | Sem ele, a primeira etapa. De outro quadro: `404`. |
| `title` | Obrigatório, a não ser com `createFromChat`. |
| `assignedToId` | Da mesma organização. Em quadro restrito, sem ele o card fica com quem criou: senão, sumiria da tela na hora. |
| `chatId` | Só uma conversa que a pessoa enxerga. Outra: `404`. |
| `createFromChat` | `true`, com `chatId`: título e descrição vêm do contato, e `priority` nasce `medium`. O que vier no corpo vale mais. |
| `labelIds`, `tags`, `dueDate` (ms ou ISO 8601), `expectedCloseDate`, `dealValue`, `dealProbability` (0 a 100), `companyName`, `contactEmail`, `contactPhone`, `colorLabel`, `status`, `description`, `descriptionJson`, `audienceId`, `customFieldValues` | Opcionais. |

`201` com o card, como em `GET .../cards/:id`.

### `PATCH /pipelines/boards/:boardId/cards/:id`

Os mesmos campos, menos `stageId`: mudar de etapa é `move`, que confere as travas. `labelIds` substitui a lista. `descriptionJson: null` limpa a descrição.

### `DELETE /pipelines/boards/:boardId/cards/:id`

`204`.

### `POST /pipelines/boards/:boardId/cards/:id/move`

Corpo solto: `{ "stageId": "…", "position": 1 }`. `position` é o lugar na lista **que a pessoa vê**, a partir de 1: o back-end leva em conta os arquivados e os cards de outras pessoas. Sem `position`, o card vai para o fim da etapa de destino.

Ao avançar (`stage.position` maior), confere a etapa de origem:

| Trava | Erro | `details` |
|---|---|---|
| Item obrigatório do checklist da etapa | `422 checklistIncomplete` | `pendingItems` |
| Campo com `requiredToLeaveStage` da etapa | `422 requiredFieldsIncomplete` | `pendingFields` |

```json
{
  "error": {
    "code": "checklistIncomplete",
    "message": "Conclua o checklist da etapa para avançar este card.",
    "details": {
      "pendingItems": [ "Confirmar quantidade de peças", "Entender o prazo de entrega" ]
    }
  }
}
```

```json
{
  "error": {
    "code": "requiredFieldsIncomplete",
    "message": "Preencha os campos obrigatórios para continuar.",
    "details": {
      "pendingFields": [ "Validade da proposta" ]
    }
  }
}
```

`200` com o card. Duas movimentações ao mesmo tempo não embaralham as posições: as duas listas ficam travadas até o commit.

### `POST /pipelines/boards/:boardId/cards/reorder`

Corpo solto: `{ "stageId": "…", "orderedIds": ["…"] }`. Só **dentro da etapa**: um id de outra etapa é ignorado. Mudar de etapa é `move`. `204`, e emite `cards_reordered`.

### `POST /pipelines/boards/:boardId/cards/:id/archive`

Sem corpo, arquiva. `{ "undo": true }` tira do arquivo. `200` com o card.

### Negócio: ganho, perdido, reabrir

| Rota | Corpo | Efeito |
|---|---|---|
| `POST …/cards/:id/mark-won` | | `wonAt`, `completedAt`. Etiqueta de sistema `ganho` na conversa. |
| `POST …/cards/:id/mark-lost` | `{ "lostReason": "Sem orçamento" }` | `lostAt`, `lostReason`, `completedAt`. Etiqueta `perdido`. |
| `POST …/cards/:id/reopen` | | Limpa tudo isso, tira do arquivo e tira a etiqueta. |

Com `requireFieldsOnDealWon`/`Lost`, fechar exige os campos `required` do quadro e os da etapa atual:

```json
{
  "error": {
    "code": "requiredFieldsIncomplete",
    "message": "Preencha os campos obrigatórios para continuar.",
    "details": {
      "pendingFields": [ "Forma de pagamento" ],
      "pendingFieldKeys": [ "forma_de_pagamento" ]
    }
  }
}
```

`200` com o card. Com `dealCloseBehavior: "immediate"`, ele já volta `archived: true`.

### `POST /pipelines/boards/:boardId/cards/bulk-update`

Corpo solto: `{ "cardIds": ["…"], "assignedToId", "priority", "status", "archived", "tags" }`. Até 500 ids; mais que isso, `422 tooManyIds`. Só os cards que a pessoa enxerga. Tudo ou nada: um inválido desfaz o lote. `204`.

### `POST` e `DELETE /pipelines/boards/:boardId/cards/:id/watch`

Observar o card: sem corpo, responde `{ "watching": true }` ou `{ "watching": false }`. Idempotente. Rota nova: na origem, os observadores existiam no modelo, mas sem caminho pela API.

### `GET /pipelines/boards/:boardId/cards/:cardId/activities`

| Parâmetro | Descrição |
|---|---|
| `cursor` | `nextCursor` da página anterior. |
| `type` | Uma ação, ou várias separadas por vírgula: `created`, `moved`, `updated`, `assigned`, `commented`, `label_added`, `label_removed`, `archived`, `auto_archived`, `deal_won`, `deal_lost`, `deal_reopened`. Na origem, o filtro não funcionava (`params[:action]` é sempre o nome da ação do controlador). |
| `limit` | 1 a 100. Padrão 30. |

```json
{
  "activities": [
    {
      "id": "9c7dea39-…",
      "action": "commented",
      "details": {
        "body": "Dá para dar os 5% à vista? O lote inteiro sai de uma vez.",
        "commentId": "4a249163-…"
      },
      "createdAt": 1794000635747,
      "user": {
        "id": "1ceab622-…",
        "name": "Juliana Ferreira",
        "email": "juliana.ferreira@exemplo.com.br",
        "avatarUrl": null
      }
    },
    {
      "id": "f9f4b821-…",
      "action": "moved",
      "details": {
        "toStage": "Negociação",
        "fromStage": "Proposta enviada",
        "toStageId": "92fd5305-…",
        "fromStageId": "1eded235-…"
      },
      "createdAt": 1793914235657,
      "user": {
        "id": "1ceab622-…",
        "name": "Juliana Ferreira",
        "email": "juliana.ferreira@exemplo.com.br",
        "avatarUrl": null
      }
    }
  ],
  "hasMore": true,
  "nextCursor": "2026-11-05T21:30:35.656895Z",
  "totalCount": 7
}
```

`user: null` é ação de sistema (job, gatilho, ou pessoa apagada).

### Anexos do card

| Rota | Corpo | Resposta |
|---|---|---|
| `GET …/cards/:cardId/attachments` | | `{ "attachments": [...], "meta": {...} }` |
| `POST …/cards/:cardId/attachments` | Multipart: `file`. Até 25 MB. | `201`, o anexo |
| `DELETE …/cards/:cardId/attachments/:id` | | `204` |

Rota nova: a origem tinha o modelo e o hook (`useItemAttachments`), mas nenhuma rota. `url` é relativa à API, e baixa sem sessão, como os outros arquivos do Active Storage.

```json
{
  "id": "e9fc89b7-…",
  "fileName": "proposta.pdf",
  "contentType": "application/pdf",
  "fileSize": 17,
  "url": "/rails/active_storage/blobs/proxy/eyJfcmFpbHMiOnsiZGF0YSI6IjAwMDRiYzQ0LTUxYzktNDdhOS04N2ViLTdhNzFkNTJhOWUyNCIsInB1ciI6ImJsb2JfaWQifX0=--a27ce9e17f5bae48fec3bf1afe20cae7a79af417/proposta.pdf",
  "createdAt": 1794000656875,
  "uploadedBy": {
    "id": "b56a981d-…",
    "name": "Marina Duarte",
    "email": "marina.duarte@exemplo.com.br",
    "avatarUrl": null
  }
}
```

### Checklists do card

| Rota | Corpo | Resposta |
|---|---|---|
| `GET …/cards/:cardId/checklists` | | `{ "checklists": [...], "meta": {...} }` |
| `POST …/cards/:cardId/checklists` | `{ "checklist": { "name", "position" } }` | `201` |
| `PATCH …/cards/:cardId/checklists/:id` | O mesmo | `200` |
| `DELETE …/cards/:cardId/checklists/:id` | | `204` |
| `POST …/checklists/:checklistId/items` | `{ "item": { "title", "completed", "position", "assignedToId" } }` | `201`, o item |
| `PATCH …/checklists/:checklistId/items/:id` | O mesmo | `200`, o item |
| `POST …/checklists/:checklistId/items/:id/toggle` | | `200`, o item |
| `DELETE …/checklists/:checklistId/items/:id` | | `204` |

Mudar um item emite `card_updated`, porque o `checklistProgress` do card mudou.

```json
{
  "checklists": [
    {
      "id": "75a65169-…",
      "name": "Entrega",
      "position": 1,
      "items": [
        {
          "id": "3f2baab4-…",
          "title": "Conferir endereço",
          "completed": true,
          "position": 1,
          "assignedToId": null,
          "createdAt": 1794000657377,
          "updatedAt": 1794000657442
        }
      ],
      "createdAt": 1794000657295,
      "updatedAt": 1794000657295
    }
  ],
  "meta": { "total": 1 }
}
```

### Checklist da etapa, no card

O que falta marcar para o card sair da etapa em que está.

`GET …/cards/:cardId/stage-checks`:

```json
{
  "checks": [
    {
      "id": "645290b6-…",
      "title": "Confirmar quantidade de peças",
      "position": 1,
      "required": true,
      "completed": false,
      "completedAt": null,
      "completedById": null
    },
    "…"
  ],
  "meta": { "total": 3 }
}
```

`POST …/cards/:cardId/stage-checks/:id/toggle` (`:id` é o id do item do checklist da etapa). Sem corpo:

```json
{
  "checklistItemId": "8fa48474-…",
  "completed": true,
  "completedAt": 1794000655941,
  "completedById": "b56a981d-…"
}
```

## Comentários

### `GET /pipelines/boards/:boardId/cards/:cardId/comments`

Do mais antigo para o mais novo, em páginas que andam para trás: `before` recebe o `nextCursor` da página anterior. `pinned` vem à parte, só na primeira página. A resposta traz as respostas de cada comentário dentro de `replies`.

```json
{
  "pinned": [],
  "comments": [
    {
      "id": "47c6e162-…",
      "cardId": "a63e9ba5-…",
      "body": "Comentário editado",
      "createdAt": 1794000656704,
      "editedAt": 1794000661440,
      "pinned": false,
      "parentId": null,
      "author": {
        "id": "b56a981d-…",
        "name": "Marina Duarte",
        "email": "marina.duarte@exemplo.com.br",
        "avatarUrl": null,
        "type": "user"
      },
      "reactions": [],
      "attachments": [],
      "replyCount": 2,
      "replies": [
        {
          "id": "ca35df98-…",
          "cardId": "a63e9ba5-…",
          "body": "Resposta",
          "createdAt": 1794000661741,
          "editedAt": null,
          "pinned": false,
          "parentId": "47c6e162-…",
          "author": {
            "id": "b56a981d-…",
            "name": "Marina Duarte",
            "email": "marina.duarte@exemplo.com.br",
            "avatarUrl": null,
            "type": "user"
          },
          "reactions": [],
          "attachments": [],
          "replyCount": 0
        },
        "…"
      ]
    },
    "…"
  ],
  "hasMore": false,
  "nextCursor": null,
  "totalCount": 5
}
```

`author` pode ser:

| `type` | Quem | Campos |
|---|---|---|
| `user` | Uma pessoa | `id`, `name`, `email`, `avatarUrl` |
| `automation` | Script ou fluxo. O nome sai no idioma de quem lê. | `source` (`script`, `flow`), `name` |
| `null` | A pessoa foi apagada | |

### Escrever

| Rota | Corpo | Resposta |
|---|---|---|
| `POST …/comments` | `{ "comment": { "body", "parentId" } }`. Com anexo, multipart: `comment[body]`, `comment[parentId]`, `comment[files][]`, até 10 arquivos (senão, `422 tooManyFiles`) de até 25 MB. | `201` |
| `PATCH …/comments/:id` | `{ "comment": { "body" } }`. Só quem escreveu; preenche `editedAt`. | `200` |
| `DELETE …/comments/:id` | Qualquer pessoa com acesso ao card, como na origem. Leva as respostas. | `204` |
| `POST …/comments/:id/pin`, `DELETE …/comments/:id/pin` | | `200` |
| `POST …/comments/:id/reactions` | `{ "emoji": "🎉" }`. Reagir de novo com o mesmo responde `200` e não muda nada. | `201` |
| `DELETE …/comments/:id/reactions` | `{ "emoji": "🎉" }` | `200` |

**Um nível de resposta.** `parentId` apontando para uma resposta entra na mesma conversa: o comentário volta com `parentId` da raiz. Na origem, cada nível custava mais uma consulta por comentário.

`POST .../comments/:id/reactions`:

```json
{
  "id": "47c6e162-…",
  "cardId": "a63e9ba5-…",
  "body": "Comentário de teste",
  "createdAt": 1794000656704,
  "editedAt": null,
  "pinned": false,
  "parentId": null,
  "author": {
    "id": "b56a981d-…",
    "name": "Marina Duarte",
    "email": "marina.duarte@exemplo.com.br",
    "avatarUrl": null,
    "type": "user"
  },
  "reactions": [
    {
      "emoji": "🎉",
      "count": 1,
      "accountIds": [ "b56a981d-…" ]
    }
  ],
  "attachments": [],
  "replyCount": 0,
  "replies": []
}
```

Com anexo:

```json
{
  "id": "c19a34ad-…",
  "cardId": "a63e9ba5-…",
  "body": "Com anexo",
  "createdAt": 1794000657075,
  "editedAt": null,
  "pinned": false,
  "parentId": null,
  "author": {
    "id": "b56a981d-…",
    "name": "Marina Duarte",
    "email": "marina.duarte@exemplo.com.br",
    "avatarUrl": null,
    "type": "user"
  },
  "reactions": [],
  "attachments": [
    {
      "id": "f7afa4dc-…",
      "fileName": "nota.txt",
      "contentType": "text/plain",
      "fileSize": 4,
      "url": "/rails/active_storage/blobs/proxy/eyJfcmFpbHMiOnsiZGF0YSI6ImFmMTZiOGJmLWQ2NjYtNDI0Zi1hNmNjLWVkNmRkODU5MWIxZiIsInB1ciI6ImJsb2JfaWQifX0=--a17714a1dc8aa7a8d21eeeb1b82543d6973124c3/nota.txt"
    }
  ],
  "replyCount": 0,
  "replies": []
}
```

## Campos personalizados

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /pipelines/boards/:boardId/custom-fields` | | `{ "customFields": [...], "meta": {...} }` |
| `POST …/custom-fields` | `{ "customField": { "name", "fieldType", "required", "options", "defaultValue", "scope", "stageId", "requiredToLeaveStage", "position" } }` | `201` |
| `PATCH …/custom-fields/:id` | O mesmo | `200` |
| `DELETE …/custom-fields/:id` | | `204` |
| `POST …/custom-fields/reorder` | `{ "orderedIds": ["…"] }` | `204` |

`fieldType`: `text`, `number`, `date`, `select`, `checkbox`, `url`, `user`. `scope`: `board` ou `stage` (com `stageId`). `key` nasce do nome e **não muda ao renomear**: é por ela que o valor fica no card (`customFieldValues[key]`). Criar, editar, apagar e reordenar emitem `custom_fields_changed`.

| Trava | Quando vale |
|---|---|
| `required` | Ao fechar negócio, se o quadro pedir. |
| `requiredToLeaveStage` | Ao avançar da etapa do campo. |

```json
{
  "customFields": [
    {
      "id": "0c36747d-…",
      "key": "origem_do_contato",
      "name": "Origem do contato",
      "fieldType": "select",
      "position": 1,
      "required": true,
      "options": [ "WhatsApp", "…" ],
      "defaultValue": null,
      "scope": "board",
      "stageId": null,
      "requiredToLeaveStage": false
    },
    "…"
  ],
  "meta": { "total": 5 }
}
```

## Gatilhos

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /pipelines/boards/:boardId/triggers` | | `{ "triggers": [...], "meta": {...} }` |
| `POST …/triggers` | `{ "trigger": { "name", "eventType", "stageId", "active", "conditions", "actions" } }` | `201` |
| `PATCH …/triggers/:id` | O mesmo | `200` |
| `DELETE …/triggers/:id` | Resolve o alerta do gatilho. | `204` |
| `POST …/triggers/:id/toggle` | | `200` |
| `GET /pipelines/boards/:boardId/trigger-executions` | `?page`, `?perPage` (padrão 50), `?status` (`success`, `failure`, `skipped`), `?triggerId`. Guardadas por 90 dias. | `{ "executions": [...], "meta": {...} }` |

Ação com `run_code` exige também a permissão `flows`: é a mesma pessoa que escreve script nos fluxos. Sem ela, `403`.

```json
{
  "id": "05a4d416-…",
  "name": "Ao vivo com código",
  "eventType": "card_updated",
  "conditions": {
    "priority": { "operator": "equals", "value": "urgent" }
  },
  "actions": [
    {
      "type": "run_code",
      "code": "\nconst card = kanban.card(params.card.id);\ncard.addLabel('vinda-do-script');\ncard.addComment('Rodei em V8. Evento: ' + params.event.event_type);\nconst pontos = card.incrementCustomField('Lead Score', 7);\nreturn { pontos,…",
      "timeoutMs": 10000
    }
  ],
  "active": true,
  "stageId": null,
  "createdAt": 1794000658486,
  "updatedAt": 1794000658486
}
```

### Eventos

| `eventType` | Quando |
|---|---|
| `card_created` | Card criado. |
| `card_updated` | Card editado. Mudar só de posição não conta. |
| `card_moved` | Mudou de etapa. |
| `due_date_passed` | O prazo venceu. Uma vez por prazo; mudar o prazo para depois arma de novo. Só vale para o prazo que venceu depois de o gatilho existir: criar um gatilho num quadro com 300 cards atrasados não manda 300 mensagens. |
| `sla_breached` | Passou de `slaHours` na etapa. Uma vez por passagem. |
| `deal_won`, `deal_lost`, `deal_reopened` | Só em quadro `crm`. Em outro, `422`. |

Vale o evento mais significativo de cada gravação: criado, depois ganho/perdido/reaberto, depois movido, depois editado.

**`stageId`** limita o gatilho a uma etapa: em `card_moved`, a de destino; nos outros, aquela em que o card está. Sem ele, vale para o quadro todo.

O que um gatilho muda no card **não dispara outro gatilho**, e o mesmo vale para o script que nasceu de um gatilho: sem isso, um "card movido" que move o card rodaria para sempre.

### Condições

`conditions` é um mapa de chave do contexto para o valor esperado. Todas precisam bater.

```json
{ "priority": "low", "to_stage_name": { "operator": "contains", "value": "Proposta" } }
```

Operadores: `equals` (padrão), `not_equals`, `contains`, `not_contains`, `is_empty`, `is_not_empty`, `greater_than`, `less_than`.

Chaves: `event_type`, `card_id`, `board_id`, `stage_id`, `assigned_to_id`, `priority`, `from_stage_id`, `to_stage_id`, `from_stage_name`, `to_stage_name`. Em negócio, também `deal_value`, `deal_probability`, `company_name`, `contact_email`, `lost_reason`. Em `sla_breached`, `stage_name`, `sla_hours`. Em `due_date_passed`, `due_date`.

### Ações

Até 20 por gatilho. As chaves são camelCase na API, e snake_case no banco.

| `type` | Campos | Observação |
|---|---|---|
| `notify` | `message`, `accountIds` | Aviso (`AccountNotice`). Sem `accountIds`, vai para o responsável e os observadores. |
| `move_card` | `stageId` | Do mesmo quadro. Não confere as travas, como na origem. |
| `assign_user` | `accountIds` | Rodízio, pulando quem perdeu o acesso ou é `setupOnly`. |
| `send_whatsapp_message` | `connectorId`, `message`, `target` (`card_contact`, `specific`), `specificPhone` | |
| `send_whatsapp_template` | `connectorId`, `whatsappTemplateId`, `templateParams`, `target`, `specificPhone` | Só em canal WhatsApp Cloud. `templateParams` é uma lista de textos, um por variável do corpo. |
| `fire_webhook` | `url`, `method`, `headers`, `bodyTemplate` | Passa por `SafeHttp`: endereço interno é recusado. |
| `toggle_automation` | `automationStatus` (`enabled`, `disabled`), `disablePeriod`, `disableTime` | Liga e pausa a automação (fluxo) da conversa do card. |
| `create_card` | `targetBoardId`, `targetStageId`, `cardTitleTemplate`, `cardDescriptionTemplate`, `cardPriority`, `cardColorLabel`, `cardDueDateOffset`, `cardAssignedToId`, `cardInheritAssigned`, `cardInheritLabels`, `cardDealValueTemplate`, `cardCompanyNameTemplate`, `cardContactEmailTemplate`, `cardContactPhoneTemplate`, `cardTags`, `cardLabelIds`, `cardCustomFieldValues` | Da mesma organização. |
| `run_code` | `code` (até 100 mil caracteres), `timeoutMs` (1 a 60 s, padrão 15 s) | Roda em V8, na fila `scripts`. Ver abaixo. |

Nenhuma ação da origem acionava o assistente diretamente, então nenhuma saiu. `run_code` é nova neste gatilho: veio de `TriggerAction::CodeRunner`, que na origem era do gatilho do assistente.

Tokens de `message` e dos modelos de `create_card`: `{{card.title}}`, `{{card.description}}`, `{{card.priority}}`, `{{card.due_date}}`, `{{card.deal_value}}`, `{{card.company_name}}`, `{{card.contact_email}}`, `{{card.contact_phone}}`, `{{card.tags}}`, `{{card.labels}}`, `{{card.assigned_to}}`, `{{card.assigned_to_name}}`, `{{card.assigned_to_id}}`, `{{board.name}}`, `{{stage.name}}`, `{{card.custom_field.<key ou nome>}}`.

Em `bodyTemplate`: `{{card.*}}` (`id`, `title`, `description`, `priority`, `status`, `due_date`, `assigned_to_id`, `chat_id`, `tags`, `deal_value`, `company_name`), `{{board.id}}`, `{{board.name}}`, `{{stage.id}}`, `{{stage.name}}`, `{{stage.position}}`, `{{event}}`. Sem `bodyTemplate`, vai esse contexto inteiro.

### Execuções

Cada ação diz como terminou. Uma falha não impede as seguintes, e a execução sai `failure` se alguma falhou. Na origem, a execução aparecia como sucesso mesmo com a mensagem que não saiu.

```json
{
  "id": "f7967821-…",
  "triggerId": "ba4f382e-…",
  "cardId": "d4c9b02c-…",
  "status": "failure",
  "executedActions": [
    { "type": "create_card", "cardId": "edb0d939-…", "status": "success" },
    { "type": "assign_user", "status": "success", "accountId": "0bb5324b-…" },
    {
      "type": "fire_webhook",
      "error": "O webhook falhou: Esse endereço não pode receber a chamada.",
      "status": "failure"
    }
  ],
  "errorMessage": "O webhook falhou: Esse endereço não pode receber a chamada.",
  "executedAt": 1794000666957,
  "triggerName": "Ao vivo: encadeado",
  "cardTitle": "Origem do encadeado"
}
```

Falhou: fica um alerta `pipelines` no menu (`GET /alerts`, `badges.pipelines`), um por gatilho, até uma execução dar certo ou o gatilho ser apagado.

### `run_code`

O script recebe `params.card` (no formato de `kanban.*`), `params.board`, `params.trigger` e `params.event`, e alcança `kanban.*` e, se o card tem conversa, as extensões de contato. Sem nova tentativa: script não é idempotente.

Um gatilho com código gera **duas execuções**: a de quem enfileirou (`enqueued: true`) e a do resultado. Se o processo de scripts estiver parado, fica só a primeira, e isso é o sinal. O alerta só é resolvido pela segunda.

```js
const card = kanban.card(params.card.id);
card.addLabel('vinda-do-script');
card.addComment('Rodei em V8. Evento: ' + params.event.event_type);
const pontos = card.incrementCustomField('Lead Score', 7);
return { pontos, evento: params.event.event_type, titulo: params.card.title };
```

```json
{
  "id": "e5b14a16-…",
  "triggerId": "05a4d416-…",
  "cardId": "a63e9ba5-…",
  "status": "success",
  "executedActions": [
    {
      "type": "run_code",
      "result": "{\"pontos\":27,\"evento\":\"card_updated\",\"titulo\":\"Teste ao vivo renomeado\"}",
      "status": "success"
    }
  ],
  "errorMessage": null,
  "executedAt": 1794000658872,
  "triggerName": "Ao vivo com código",
  "cardTitle": "Teste ao vivo renomeado"
}
```

Com erro:

```json
{
  "id": "86fd99f2-…",
  "triggerId": "2f7a0140-…",
  "cardId": "a63e9ba5-…",
  "status": "failure",
  "executedActions": [
    { "type": "run_code", "error": "Error: faltou o CPF", "status": "failure" }
  ],
  "errorMessage": "Error: faltou o CPF",
  "executedAt": 1794000659393,
  "triggerName": "Ao vivo com erro",
  "cardTitle": "Teste ao vivo renomeado"
}
```

## Metas

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /pipelines/boards/:boardId/goals` | `?month=YYYY-MM` | `{ "goals": [...], "meta": {...} }` |
| `POST …/goals` | `{ "goal": { "scope", "assignedAccountId", "periodMonth", "targetValue", "metric" } }` | `201` |
| `PATCH …/goals/:id` | O mesmo | `200` |
| `DELETE …/goals/:id` | | `204` |
| `GET …/goals/progress` | `?month=YYYY-MM`. Sem ele, o mês atual da organização. | Abaixo |
| `GET …/goals/history` | `?month=YYYY-MM&months=6` (1 a 24) | Abaixo |

`scope`: `funnel` (uma por mês no quadro) ou `user` (uma por pessoa no mês, com `assignedAccountId`). `metric`: só `revenue`, que é o padrão. `periodMonth`: `YYYY-MM`. Repetida: `422`, com `field` `periodMonth` ou `assignedAccountId`.

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Mês já tem meta do funil",
    "field": "periodMonth",
    "details": {
      "periodMonth": [ "já tem meta do funil" ]
    }
  }
}
```

```json
{
  "id": "bc4fd2b1-…",
  "scope": "user",
  "assignedAccountId": "0bb5324b-…",
  "periodMonth": "2026-12",
  "targetValue": 1000,
  "metric": "revenue"
}
```

```json
{
  "month": "2026-11",
  "funnel": { "goalId": "736681f2-…", "targetValue": 45000, "actualValue": 2750, "progressPercentage": 6.1 },
  "users": [
    {
      "user": { "id": "1ceab622-…", "name": "Juliana Ferreira", "avatarUrl": null },
      "goalId": "6e6016bb-…",
      "targetValue": 22000,
      "actualValue": 2750,
      "progressPercentage": 12.5
    },
    {
      "user": { "id": "0bb5324b-…", "name": "Rafael Nunes", "avatarUrl": null },
      "goalId": "2eaaad19-…",
      "targetValue": 18000,
      "actualValue": 0,
      "progressPercentage": 0
    }
  ],
  "usersWithoutGoal": []
}
```

`usersWithoutGoal`: quem é responsável por algum card do quadro e está sem meta. Em quadro restrito, quem não tem acesso total recebe só a própria linha, em `users` e em `usersWithoutGoal`.

```json
{
  "history": [
    { "month": "2026-09", "targetValue": 38000, "actualValue": 15800 },
    { "month": "2026-10", "targetValue": 40000, "actualValue": 16300 },
    "…"
  ]
}
```

## Filtros

Definição de filtro, usada em `filter`, nos filtros salvos e nos filtros prontos:

```json
{
  "version": 1,
  "all": [{ "field": "priority", "operator": "in", "value": ["high", "urgent"] }],
  "any": [{ "field": "assigned_to_id", "operator": "eq", "value": { "type": "me" } }]
}
```

`all` são condições "e"; `any`, "ou". Até 50 condições. Inválida: `422 invalidFilter`, com a posição do erro em `message`.

| Tipo | Campos | Operadores |
|---|---|---|
| `text` | `title`, `description`, `status`, `company_name`, `contact_email`, `contact_phone`, `lost_reason`, `color_label` | `eq`, `ne`, `contains`, `not_contains`, `starts_with`, `not_starts_with`, `is_empty`, `is_not_empty` |
| `number` | `deal_value`, `deal_probability` | `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `between`, `is_empty`, `is_not_empty` |
| `date` | `due_date`, `expected_close_date`, `created_at`, `updated_at`, `won_at`, `lost_at`, `completed_at`, `stage_entered_at` | `eq`, `before`, `after`, `between`, `within`, `not_within`, `is_empty`, `is_not_empty` |
| `select` | `priority`, `stage_id`, `deal_status` (`open`, `won`, `lost`) | `eq`, `ne`, `in`, `nin`, `is_empty`, `is_not_empty` |
| `user` | `assigned_to_id`, `created_by_id` | `eq`, `ne`, `in`, `nin`, `is_empty`, `is_not_empty` |
| `array` | `tags` | `contains_any`, `contains_all`, `not_contains`, `is_empty`, `is_not_empty` |
| `labels` | `label_ids` | `contains_any`, `contains_all`, `not_contains`, `is_empty`, `is_not_empty` |
| `virtual_bool` | `is_rotting`, `in_first_stage`, `assigned_to_deactivated` | `eq` |
| Do campo | `custom.<key>`, conforme o `fieldType` (`url` é `text`) | Os do tipo |

Valores especiais: `{ "type": "me" }` em campo de pessoa; `{ "type": "relative", "token": "this_week" }` em data. Tokens de intervalo, para `within` e `not_within`: `today`, `yesterday`, `this_week`, `last_week`, `this_month`, `last_month`, `this_quarter`, `this_year`, `last_year`, `last_n_days`. Tokens de instante, para `before` e `after`: `today`, `yesterday`, `now`, `more_than_n_months_ago`, `last_n_days`. `last_n_days` e `more_than_n_months_ago` pedem `"n"`.

### Filtros salvos e prontos

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /pipelines/boards/:boardId/saved-filters` | | Abaixo |
| `POST …/saved-filters` | `{ "savedFilter": { "name", "visibility", "definition" } }` | `201` |
| `PATCH …/saved-filters/:id` | O mesmo. Só quem criou (senão, `403`). | `200` |
| `DELETE …/saved-filters/:id` | Só quem criou. | `204` |
| `POST …/saved-filters/toggle-favorite` | Solto: `{ "savedFilterId" }` ou `{ "presetKey" }` | `{ "favorite": true }` |

`visibility`: `private` (padrão) ou `shared`.

```json
{
  "presets": [
    {
      "key": "open_deals",
      "nameKey": "pipelines.filters.presets.open_deals",
      "section": "quick",
      "definition": {
        "version": 1,
        "all": [
          { "field": "deal_status", "operator": "eq", "value": "open" }
        ],
        "any": []
      },
      "isPreset": true,
      "favorite": false
    },
    "…"
  ],
  "filters": [
    {
      "id": "061483c0-…",
      "name": "Atacado quente",
      "visibility": "private",
      "definition": {
        "all": [
          {
            "field": "label_ids",
            "value": [ "52c3f4a9-…", "10fe3d6a-…" ],
            "operator": "contains_any"
          }
        ],
        "any": [],
        "version": 1
      },
      "isPreset": false,
      "favorite": true,
      "editable": true,
      "owner": { "id": "b56a981d-…", "name": "Marina Duarte" }
    },
    "…"
  ]
}
```

`nameKey` é chave de tradução da tela (`pipelines.filters.presets.<key>`): os filtros prontos vivem no código, não em linhas por organização. Os textos da origem:

| `key` | `section` | pt-BR |
|---|---|---|
| `open_deals` | `quick` | Todos os negócios abertos |
| `won_deals` | `quick` | Todos os negócios ganhos |
| `lost_deals` | `quick` | Todos os negócios perdidos |
| `rotten_deals` | `quick` | Negócios estagnados |
| `my_deals` | `quick` | Meus negócios |
| `won_this_week` | `quick` | Ganhos esta semana |
| `won_this_month` | `quick` | Ganhos este mês |
| `won_this_year` | `quick` | Ganhos este ano |
| `created_this_week` | `quick` | Criados esta semana |
| `older_than_3_months` | `quick` | Mais de 3 meses de idade |
| `stale_first_stage_12_months` | `data_cleanup` | Parados na 1ª etapa há 12 meses |
| `expected_close_in_past` | `data_cleanup` | Fechamento previsto no passado |
| `assigned_to_deactivated` | `data_cleanup` | Atribuídos a pessoas desativadas |

## Etiquetas

Da organização, não do quadro: a mesma etiqueta serve em todos.

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /pipelines/labels` | `?search=` | `{ "labels": [...], "meta": {...} }` |
| `POST /pipelines/labels` | `{ "label": { "name", "color" } }` | `201` |
| `PATCH /pipelines/labels/:id` | O mesmo | `200` |
| `DELETE /pipelines/labels/:id` | Tira dos cards. | `204` |

```json
{
  "labels": [
    {
      "id": "52c3f4a9-…",
      "name": "Atacado",
      "color": "#1D4ED8",
      "createdAt": 1794000633872,
      "updatedAt": 1794000633872
    },
    "…"
  ],
  "meta": { "total": 7 }
}
```

## Tempo real: `PipelineBoardChannel`

```json
{ "channel": "PipelineBoardChannel", "boardId": "8fa55d19-…" }
```

Recusa a assinatura sem o recurso `pipelines` ou com quadro de outra organização. Só leitura: tudo que muda passa pela API. Cada mensagem é `{ "event": "...", "data": {...} }`, em camelCase.

Quem está restrito no quadro assina uma stream pessoal, só com os próprios cards. Por isso, **ao receber `card_visibility_changed`, a tela refaz a assinatura** e relê o quadro: a stream antiga deixa de receber, e quem perdeu acesso não continua vendo.

| Evento | `data` | Quem recebe |
|---|---|---|
| `card_created` | O card, sem `chatSummary` | Cards |
| `card_updated` | O mesmo. Também ao mudar checklist e observadores. | Cards |
| `card_moved` | O mesmo, com `previousStageId` | Cards |
| `card_deleted` | `{ id, stageId }` | Cards |
| `cards_reordered` | `{ stageId, orderedIds }` | Cards |
| `comment_created` | `{ cardId, comment }` | Cards |
| `comment_updated` | `{ cardId, comment }`. Também ao reagir e ao fixar. | Cards |
| `comment_deleted` | `{ cardId, commentId }` | Cards |
| `stage_created`, `stage_updated` | A etapa | Quadro |
| `stage_deleted` | `{ id }` | Quadro |
| `stages_reordered` | `{ orderedIds }` | Quadro |
| `custom_fields_changed` | `{ boardId }`. Releia os campos. | Quadro |
| `card_visibility_changed` | `{ id }`, o id do quadro | Quadro |

"Quadro" vai para todo mundo no quadro. "Cards" vai para quem vê tudo e, em quadro restrito, também para o responsável. Em quadro restrito, reatribuir um card manda `card_deleted` para o ex-responsável e `card_created` para o novo.

`card_moved`, encurtado:

```json
{
  "event": "card_moved",
  "data": {
    "id": "a63e9ba5-…",
    "title": "Teste ao vivo renomeado",
    "priority": "high",
    "status": null,
    "dueDate": 1794087055166,
    "position": 1,
    "assignedToId": "1ceab622-…",
    "chatId": null,
    "stageId": "c0c0c15c-…",
    "archived": false,
    "createdAt": 1794000654974,
    "updatedAt": 1794000655510,
    "dealValue": 1234.5,
    "stageEnteredAt": 1794000655458,
    "isRotting": false,
    "previousStageId": "44238844-…"
  }
}
```

`cards_reordered`:

```json
{
  "event": "cards_reordered",
  "data": {
    "stageId": "44238844-…",
    "orderedIds": [ "108bf463-…", "564a1f1f-…" ]
  }
}
```

`comment_deleted`:

```json
{
  "event": "comment_deleted",
  "data": { "cardId": "a63e9ba5-…", "commentId": "c19a34ad-…" }
}
```

`stage_created`:

```json
{
  "event": "stage_created",
  "data": {
    "id": "3e908aae-…",
    "boardId": "e4fad388-…",
    "name": "Ao vivo",
    "position": 6,
    "color": "#654321",
    "wipLimit": null,
    "slaHours": 12
  }
}
```

`stages_reordered`:

```json
{
  "event": "stages_reordered",
  "data": {
    "orderedIds": [ "3e908aae-…", "44238844-…", "…" ]
  }
}
```

`custom_fields_changed`:

```json
{
  "event": "custom_fields_changed",
  "data": { "boardId": "e4fad388-…" }
}
```

`card_visibility_changed`:

```json
{
  "event": "card_visibility_changed",
  "data": { "id": "5689228f-…" }
}
```

## Erros

Sempre `{ "error": { "code", "message", "field"?, "details"? } }`.

| Status | `code` | Quando | `details` |
|---|---|---|---|
| `400` | `parameterMissing` | Faltou o envelope. | |
| `401` | `unauthorized` | Sem sessão. | |
| `403` | `forbidden` | Sem o recurso `pipelines`; `run_code` sem `flows`; quem está restrito mudando a regra ou apagando etapa e quadro; filtro de outra pessoa. | |
| `404` | `notFound` | Não existe, é de outra organização, ou é card que a pessoa não enxerga. | |
| `422` | `unprocessable` | Validação. `field` é o primeiro campo inválido. | Mapa de campo para mensagens |
| `422` | `conflict` | Duas requisições passaram juntas pela validação de unicidade. | |
| `422` | `tooManyIds` | Mais de 500 em lote, ou de 2.000 em reordenação. | |
| `422` | `tooManyFiles` | Mais de 10 arquivos no comentário. | |
| `422` | `checklistIncomplete` | Trava de checklist ao avançar. | `pendingItems` |
| `422` | `requiredFieldsIncomplete` | Trava de campos ao avançar ou fechar. | `pendingFields`, `pendingFieldKeys` (ao fechar) |
| `422` | `visibilityLockout` | A regra trancaria quem está salvando. | |
| `422` | `invalidLeadScoreField` | `leadScoreFieldKey` não é um campo `number` do quadro. | |
| `422` | `invalidFilter` | Definição de filtro inválida. | |
| `422` | `invalidPeriod` | Período das métricas inválido. | |

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Título não pode ficar em branco",
    "field": "title",
    "details": {
      "title": [ "não pode ficar em branco" ]
    }
  }
}
```

Em inglês (`Accept-Language: en`):

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Title can't be blank",
    "field": "title",
    "details": {
      "title": [ "can't be blank" ]
    }
  }
}
```

```json
{
  "error": {
    "code": "visibilityLockout",
    "message": "Inclua o seu grupo de permissão: sem ele, você perderia o acesso a estes cards.",
    "field": "cardVisibilityBypassRoleIds"
  }
}
```

```json
{
  "error": { "code": "invalidFilter", "message": "O filtro não é um JSON válido." }
}
```

## Jobs recorrentes

`config/schedule/pipelines.yml`, na fila `low`:

| Job | Quando | O que faz |
|---|---|---|
| `Pipelines::SlaCheckerJob` | De 15 em 15 min | Card aberto há mais de `slaHours` na etapa: avisa responsável e observadores, dispara `sla_breached`. Uma vez por passagem na etapa. Negócio fechado fica de fora. |
| `Pipelines::DueDateCheckerJob` | De 15 em 15 min | Prazo vencido: dispara `due_date_passed`. Uma vez por prazo. |
| `Pipelines::AutoArchiveJob` | De 6 em 6 h | Arquiva o card parado (`autoArchiveDays`) e o negócio fechado (`dealCloseArchiveDays`), com atividade `auto_archived`. |
| `Pipelines::PurgeTriggerExecutionsJob` | Todo dia, 03:40 | Apaga execuções de gatilho com mais de 90 dias. |

O aviso aponta para `/pipelines/:boardId/board?card=:cardId`, com `category: "general"`.

## API JS: `kanban.*`

Para quem escreve script. **Os nomes são os da origem, de propósito.** `lib/mini_racer_engine/workers/kanban.rb`.

| Funções | |
|---|---|
| `kanban.boards()`, `kanban.board(ref)`, `kanban.card(id)`, `kanban.cardsForConversation()`, `kanban.labels()` | Fluentes. `ref` é id ou nome, sem acento nem caixa. |
| `board.column(ref)`, `board.cards(filtros)`, `board.cardsForConversation()`, `board.createCard(colunaRef, attrs)`, `board.customFields()`, `board.refresh()` | |
| `column.cards(filtros)`, `column.createCard(attrs)` | |
| `card.update(attrs)`, `card.moveTo(ref, noFim)`, `card.archive()`, `card.unarchive()`, `card.markWon()`, `card.markLost(motivo)`, `card.reopen()`, `card.addLabel(ref)`, `card.removeLabel(id)`, `card.setCustomField(chave, valor)`, `card.getCustomField(chave)`, `card.relevantCustomFields()`, `card.incrementCustomField(chave, delta)`, `card.getCustomFieldNumber(chave)`, `card.addChecklist(nome)`, `card.checklists()`, `card.addComment(texto)`, `card.comments(limite)`, `card.refresh()` | |
| `checklist.addItem(titulo)`, `item.toggle()` | |
| `kanban.listBoards()`, `getBoard`, `listColumns`, `listCards`, `findCardsForConversation`, `listLabels`, `createCard`, `getCard`, `updateCard`, `moveCard`, `archiveCard`, `markWon`, `markLost`, `reopenDeal`, `addLabel`, `removeLabel`, `setCustomField`, `getCustomFields`, `getCustomField`, `getRelevantCustomFields`, `incrementCustomField`, `getCustomFieldNumber`, `addChecklist`, `addChecklistItem`, `toggleChecklistItem`, `listChecklists`, `addComment`, `listComments` | Crus. Devolvem `{ ok: true, data }` ou `{ ok: false, error }`. |

O que muda para quem já escreve script:

- **Ids agora são texto.** `card.id === 42` deixa de valer. `board.column(ref)` procura o id primeiro; depois, o nome.
- `kanban.moveCard` respeita as travas: bloqueado, volta `{ ok: false, error: "checklist_incomplete", pending_items }` ou `required_fields_incomplete`, `pending_fields`.
- Erro inesperado volta `internal_error`, sem detalhe: na origem, a mensagem interna ia para o script. `not_found: ...` continua.
- `board.cards({ allConversations: true })` para em 1.000 cards.
- O autor de `addComment` é a automação (`type: "automation"`, `source: "script"`), já que o assistente saiu.

## API Ruby, para os blocos de fluxo

Os blocos são de be-automation, e aqui se chamam `pipeline_*` (catálogo em [automation.md](automation.md)). Eles chamam o mesmo código de `kanban.*`, com as mesmas regras e o mesmo retorno:

```ruby
Pipelines::Automation.call(:create_card, board_id, stage_id, { "title" => "Novo" }, organization:, chat:)
# => { ok: true, data: { id: "…", title: "Novo", kanban_column_id: "…", conversation_id: "…", ... } }
# => { ok: false, error: "not_found: Board 'x' not found" }
```

`organization:` é obrigatório; `chat:` é opcional, e de outra organização levanta `MiniRacerEngine::Error`. `source:` assina os comentários (padrão `"flow"`). O retorno tem chave símbolo, e `data` tem os nomes de `kanban.*`.

| Bloco da origem | Operação | Argumentos, depois da operação |
|---|---|---|
| `kanban_create_card` | `:create_card` | `board_ref, stage_ref, attrs`. `attrs["linkConversation"] = false` não liga à conversa. Com `chat`, liga. Passa `title`, `description`, `priority`, `due_date`, `deal_value`, `deal_probability`, `company_name`, `contact_email`, `contact_phone`, `expected_close_date`, `tags`, `custom_field_values`, `color_label`, `assigned_to_id`. |
| | `:get_card` | `card_id` |
| `kanban_update_card` | `:update_card` | `card_id, attrs` (os mesmos, menos `color_label` e `assigned_to_id`) |
| `kanban_move_card` | `:move_card` | `card_id, stage_ref, at_end`. Confere as travas; bloqueado, volta `{ ok: false, error: "checklist_incomplete", pending_items: [...] }`. |
| `kanban_archive_card` | `:archive_card` | `card_id, undo = false` |
| `kanban_mark_won` | `:mark_won` | `card_id` |
| `kanban_mark_lost` | `:mark_lost` | `card_id, reason` |
| `kanban_reopen_deal` | `:reopen_deal` | `card_id` |
| `kanban_add_label` | `:add_label` | `card_id, label_ref`. Nome que não existe cria a etiqueta. |
| `kanban_remove_label` | `:remove_label` | `card_id, label_id` |
| `kanban_set_custom_field` | `:assign_custom_field` | `card_id, key_or_name, value` |
| `kanban_add_comment` | `:add_comment` | `card_id, body` |
| `kanban_add_checklist` | `:add_checklist`, depois `:add_checklist_item` | `card_id, name`; `checklist_id, title` |

Notas para quem porta:

- Ids são UUID em texto: fora o `to_id`/`Integer(...)` dos nós da origem.
- O último card da conversa num quadro (`latest_conversation_card` da origem):
  `Pipelines::Card.active.joins(:stage).where(organization_id:, chat_id: chat.id.to_s, pipeline_stages: { board_id: }).reorder(created_at: :desc).pick(:id)`. `reorder`, porque o card tem ordem padrão por posição: com `order`, vem o do topo da etapa
- `create_deal` e `update_deal` da origem criam e atualizam direto, sem passar pelo gateway. Aqui, `Pipelines::Card.create!(stage:, title:, description:, deal_value:, deal_probability:, assigned_to_id:, chat_id: chat.id.to_s)`, com a etapa achada por `Pipelines::Stage.joins(:board).where(pipeline_boards: { organization_id: }).find_by(id:)`: a origem aceitava `kanban_column_id` de qualquer organização. `organization_id` vem da etapa, e a validação recusa responsável de outra. Para mudar de etapa, `Pipelines::MoveCard.call(card:, stage:, enforce_gates: false)`, e não `update!(stage_id:)`: é o que acerta as posições.
- O que o fluxo muda dispara gatilhos, como na origem. Em `Pipelines::Card` direto, `card.suppress_trigger_evaluation = true` desliga. Quem monta a sessão à mão, em vez de `Pipelines::Automation`, usa `session.set(MiniRacerEngine::Workers::Kanban::SUPPRESS_TRIGGERS_KEY, true)`, e `COMMENT_SOURCE_KEY` para assinar os comentários.

## Para outros domínios

**be-insights (painéis personalizados).** As fontes `kanban_*` passam a ler `pipeline_cards` (`stage_id`, `organization_id`, `assigned_to_id`, `deal_value`, `deal_probability`, `won_at`, `lost_at`, `lost_reason`, `expected_close_date`, `stage_entered_at`, `archived`, `custom_field_values`), `pipeline_stages` (`board_id`, `name`, `position`), `pipeline_boards` (`organization_id`, `name`, `board_type`), `pipeline_goals` (`board_id`, `scope`, `assigned_account_id`, `period_month`, `target_value`) e `pipeline_card_activities` (`card_id`, `action`, `details`). A posição é 1-based. Prefira `Pipelines::CardVisibility.new(board, account).scope(cards)`: o quadro restrito também vale no painel.

**Conversa.** `Chat#pipeline_cards` (`ChatRelations::Pipelines`). Apagar a conversa desliga o card (`chat_id: nil`), sem apagar. As etiquetas de sistema `ganho` e `perdido` (`ChatTag::SYSTEM_TAGS`) acompanham o desfecho do card, e `Chats::BackfillSystemTagsService` agora também as refaz (grupo `:deal`).

**Organização.** `organization.pipeline_boards`, `organization.pipeline_labels` (`OrganizationRelations::Pipelines`).

**Alertas.** Categoria `pipelines`, código `pipeline_trigger_failed`, `origin_type: "PipelineTrigger"`. O item do menu ainda precisa de `alertKey: "pipelines"` em `frontend/src/lib/navigation.ts`.

**Grupos de acesso.** Apagar um `AccessRole` o tira de `cardVisibilityBypassRoleIds` dos quadros (`config/initializers/pipelines_access_roles.rb`). Se era o último, o quadro continua restrito, e só a dona vê tudo. Não abrir o quadro é o lado seguro.

## Para a tela: de onde cada função da origem foi parar

Todo export de `aiva-frontend/src/api/{use-kanban.ts,useKanban.ts,kanban.js,use-kanban-goals.ts,use-kanban-options.ts,use-kanban-saved-filters.ts}` e `src/hooks/use-kanban-realtime.ts`. Abaixo, `B` é `/pipelines/boards/:boardId` e `C` é `B/cards/:cardId`.

### `use-kanban.ts`

| Export | Função | Aqui |
|---|---|---|
| `useKanbanTemplates` | lista | `GET /pipelines/templates` |
| `useKanbanBoards` | lista | `GET /pipelines/boards?archived=` |
| | `createBoard` | `POST /pipelines/boards` |
| | `deleteBoard` | `DELETE B` |
| | `archiveBoard` | `POST B/archive` |
| `useKanbanBoard` | detalhe | `GET B`, com `savedFilterId`, `presetKey` ou `filter` |
| | `updateBoard` | `PATCH B` |
| `useKanbanColumns` | `createColumn` | `POST B/stages` |
| | `updateColumn` | `PATCH B/stages/:id` |
| | `deleteColumn` | `DELETE B/stages/:id` |
| | `reorderColumns` | `POST B/stages/reorder` |
| `useKanbanCards` | `createCard` | `POST B/cards` |
| | `updateCard` | `PATCH C` |
| | `deleteCard` | `DELETE C` |
| | `moveCard` | `POST C/move` |
| | `archiveCard` | `POST C/archive` |
| | `markWon` | `POST C/mark-won` |
| | `markLost` | `POST C/mark-lost` |
| | `reopenDeal` | `POST C/reopen` |
| | `bulkUpdate` | `POST B/cards/bulk-update` |
| | `reorderCards` | `POST B/cards/reorder` |
| `useKanbanCardDetail` | detalhe | `GET C` |
| `useKanbanComments` | `fetchComments` | `GET C/comments?before=` |
| | `createComment` | `POST C/comments` (JSON ou multipart) |
| | `updateComment` | `PATCH C/comments/:id` |
| | `deleteComment` | `DELETE C/comments/:id` |
| | `pinComment`, `unpinComment` | `POST`, `DELETE C/comments/:id/pin` |
| | `addReaction`, `removeReaction` | `POST`, `DELETE C/comments/:id/reactions` |
| `useKanbanActivities` | `fetchActivities` | `GET C/activities?cursor=&type=&limit=` (o parâmetro era `action`) |
| `useKanbanCustomFields` | `createField`, `updateField`, `deleteField` | `POST`, `PATCH`, `DELETE B/custom-fields` |
| | `reorderFields` | `POST B/custom-fields/reorder` |
| `useKanbanTriggers` | lista, `createTrigger`, `updateTrigger`, `deleteTrigger` | `GET`, `POST`, `PATCH`, `DELETE B/triggers` |
| | `toggleTrigger` | `POST B/triggers/:id/toggle` |
| `useKanbanTriggerExecutions` | lista | `GET B/trigger-executions` |
| `useKanbanLabels` | lista, `createLabel`, `updateLabel`, `deleteLabel` | `/pipelines/labels` |
| `useKanbanBoardMetrics` | | `GET B/metrics` |
| `useKanbanChecklists` | lista, `createChecklist`, `updateChecklist`, `deleteChecklist` | `C/checklists` |
| | `createItem`, `updateItem`, `deleteItem` | `C/checklists/:checklistId/items` |
| | `toggleItem` | `POST C/checklists/:checklistId/items/:id/toggle` |
| `useColumnChecklistItems` | lista, `createItem`, `updateItem`, `deleteItem` | `B/stages/:stageId/checklist-items` |
| | `reorderItems` | `POST B/stages/:stageId/checklist-items/reorder` |
| `useCardColumnChecks` | lista | `GET C/stage-checks` |
| | `toggleCheck` | `POST C/stage-checks/:id/toggle` |
| `useKanbanArchivedCards` | lista | `GET B/archived-cards?status=&search=&page=&perPage=` |

### `useKanban.ts`

| Export | Aqui |
|---|---|
| `apiRoot` | Sem `workspaceId`: `/pipelines`. |
| `useKanbanTags`, `createKanbanTag`, `updateKanbanTag`, `deleteKanbanTag` | `/pipelines/labels` |
| `useKanbanFields`, `createKanbanField`, `updateKanbanField`, `deleteKanbanField` | `B/custom-fields` |
| `useKanbanConversationList` | `GET /chats/lookup` (inbox) |
| `useItemAttachments`, `uploadItemAttachment`, `deleteItemAttachment` | `C/attachments`. Rota nova: a origem não tinha. Um arquivo por chamada. |
| Tipos `KanbanTag`, `KanbanField`, `KanbanConversation`, `KanbanAttachment` | Saem do formato acima. |

### `kanban.js` (a primeira versão)

As rotas de `api/platform/kanban_controller.rb` eram a V1 e não foram portadas: cada uma tem o equivalente aqui.

| Export | Aqui |
|---|---|
| `apiRoot` | `/pipelines` |
| `useGetBoards` | `GET /pipelines/boards` |
| `useGetBoardId` | `GET B` |
| `addBoard` | `POST /pipelines/boards` |
| `addColumn` | `POST B/stages` |
| `editColumn` | `PATCH B/stages/:id` |
| `deleteColumn` | `DELETE B/stages/:id` |
| `updateColumnOrder` | `POST B/stages/reorder` |
| `addItem` | `POST B/cards` |
| `editItem` | `PATCH C` |
| `updateColumnItemOrder` | `POST B/cards/reorder`, ou `POST C/move` entre etapas |
| `addItemComment` | `POST C/comments` |
| `deleteItem` | `DELETE C` |
| `moveTask` | Era vazia na origem. O equivalente é `POST C/move`. |

### `use-kanban-goals.ts`

| Export | Função | Aqui |
|---|---|---|
| `useKanbanGoals` | `progress` | `GET B/goals/progress?month=` |
| | `history` | `GET B/goals/history?month=&months=` (a resposta é `{ history: [...] }`) |
| | `createGoal`, `updateGoal`, `deleteGoal` | `POST`, `PATCH`, `DELETE B/goals` |

### `use-kanban-options.ts`

| Export | Aqui |
|---|---|
| `useKanbanBoardOptions`, tipo `KanbanBoardOption` | `GET /pipelines/boards?withStages=true` |
| `useKanbanBoardFields` | `GET B/custom-fields` |

### `use-kanban-saved-filters.ts`

| Export | Função | Aqui |
|---|---|---|
| `useKanbanSavedFilters` | lista | `GET B/saved-filters` |
| | `createSavedFilter`, `updateSavedFilter`, `deleteSavedFilter` | `POST`, `PATCH`, `DELETE B/saved-filters` |
| | `toggleFavorite` | `POST B/saved-filters/toggle-favorite`, com `{ savedFilterId }` ou `{ presetKey }` |
| `useKanbanFilterPreview` | | `GET B/cards?filter=&countOnly=1` |
| Tipos `SavedFilterPayload`, `FavoriteTarget` | | Saem do formato acima. |

### `use-kanban-realtime.ts`

Canal `PipelineBoardChannel`, com `boardId` (era `KanbanBoardChannel`, `board_id`).

| Evento da origem | Aqui |
|---|---|
| `card_created`, `card_updated`, `card_deleted`, `cards_reordered` | O mesmo nome. `columnId` vira `stageId`. |
| `card_moved` | O mesmo nome. `fromColumnId` vira `previousStageId`, e o destino é o `stageId` do card. |
| `column_created`, `column_updated`, `column_deleted`, `columns_reordered` | `stage_created`, `stage_updated`, `stage_deleted`, `stages_reordered` |
| `custom_field_definitions_changed` | `custom_fields_changed` |
| `card_visibility_changed` | O mesmo. Refaça a assinatura. |
| Sem correspondente no hook | `comment_created`, `comment_updated`, `comment_deleted`, que o back-end da origem já emitia. |

## Operação

- **Gatilho com código precisa do processo de scripts:** `bundle exec sidekiq -C config/sidekiq_scripts.yml`. Sem ele, o gatilho roda as outras ações, e o `run_code` fica na fila `scripts`.
- `TriggerJob` roda na fila `default`, e `CodeRunnerJob`, na `scripts`. Nenhum dos dois tenta de novo: mandar mensagem, chamar webhook e rodar script não são idempotentes. O erro fica na execução.
- Os jobs recorrentes só disparam no processo principal, que carrega `config/schedule/*.yml`.

## Semente

`bin/rails runner 'load "db/seeds/pipelines.rb"'`, ou `bin/rails db:seed`. Idempotente: o quadro é achado pelo nome. Depende das sementes de acesso (as pessoas) e de conectores (as conversas). Nada dispara durante a carga.

| | |
|---|---|
| **Vendas no atacado** | Quadro `crm`: Novos contatos, Qualificação, Proposta enviada, Negociação, Fechamento. Checklist obrigatório em Qualificação e Proposta enviada. Campos Origem do contato, Peças, Lead Score, Forma de pagamento, Validade da proposta. Metas do mês e dos anteriores, de funil e por pessoa. Negócio esfriando, atrasado, ganho e perdido. Gatilhos de rodízio, pontuação e aviso. |
| **Pós-venda** | Quadro `standard`: Pedido confirmado, Separação, Enviado, Entregue, Acompanhamento. Auto-arquivamento em 60 dias. Cards ligados às conversas. |

No total: 2 quadros, 10 etapas, 23 cards (5 arquivados, 5 ganhos, 2 perdidos), 8 comentários, 7 gatilhos, 8 metas, 7 etiquetas.
