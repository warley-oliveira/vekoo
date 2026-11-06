# Contrato da API: domínio "insights"

Dashboard, funis e dashboards personalizados, mais o que estes domínios ligam ao copiloto.

**De onde vêm os exemplos.** São respostas reais: servidor de desenvolvimento (Puma, Sidekiq, Redis, Postgres e Mongo) com a semente, e um cliente HTTP de verdade. Para não repetir o mesmo objeto, as listas longas foram cortadas. O que não foi exercitado está em [O que não foi exercitado](#o-que-não-foi-exercitado).

## Regras gerais

- **Autenticação:** `Authorization: Bearer <token>`. Sem sessão válida, `401 unauthorized`.
- **A organização vem da sessão.** Id de outra organização responde `404 notFound`, nunca `403`.
- **Entrada, em camelCase.** Cadastro com envelope: `{ "funnel": { ... } }`, `{ "customDashboard": { ... } }`. Ação e consulta vão soltas: `{ "stageId": ... }`, `{ "dataSource": ... }`.
- **Saída:** chaves em camelCase, datas em milissegundos, ids como string. Dia sem hora sai como texto (`"2026-10-08"`), porque é o dia da organização, e não um instante.
- **Mapas livres ficam como estão:** `chatsByChannel`, `labels`, `fieldLabels`, `rows`, `filterOptions`, e `query`, `visualConfig`, `layout` e `globalFilters` dos widgets. As chaves ali são dados.
- **Idioma:** `message` e os nomes de fonte, campo e valor saem no idioma da requisição (`?locale=` ou `Accept-Language`). `code` é o contrato de máquina.

### Permissões

| Rota | Exige |
|---|---|
| `GET /dashboard` | `dashboard` |
| `/funnels` e tudo abaixo | `funnel` |
| `/custom-dashboards` e tudo abaixo | `custom_dashboards` |
| `GET /dashboard/calendar-stats` | `dashboard` ou `calendar`, em [agenda.md](agenda.md) |

Em dashboard personalizado, **cada fonte exige também a permissão da tela de onde os dados vêm**:

| Fonte | Exige | Passa por `Chat.visible_to` |
|---|---|---|
| `conversations` | `chat` | sim |
| `contacts` | `contacts` | sim |
| `messages` | `chat` | sim |
| `agenda_bookings` | `calendar` | não: é a mesma lista do calendário |
| `campaigns` | `campaigns` | não |
| `daily_stats` | `dashboard` | não: número da organização |
| `hook_logs` | `core_settings` | não: é a mesma lista dos logs de webhook |

Fonte sem a permissão: `403 forbidden` na consulta, e ela não aparece em `data-sources`. Um dashboard pode misturar fontes: quem não alcança uma recebe `403` só naquele card, e a tela trata por card.

### Quem vê o quê

- **`GET /dashboard`:** os números do rollup são da organização inteira, porque são o que a permissão `dashboard` libera e porque o rollup não tem como separar por pessoa. **Os funis do dashboard passam por `Chat.visible_to`**: uma pessoa com `chat_list_to` restrito vê uma contagem menor.
- **Quadro do funil, mover conversa e copiloto:** `Chat.visible_to`. Conversa fora disso não aparece, e mover responde `404`.
- **Dashboards personalizados:** ver a tabela acima. O mesmo dashboard mostra números diferentes para pessoas com `chat_list_to` diferentes.

### Erros

Sempre `{ "error": { "code", "message", "field"?, "details"? } }`.

| Status | `code` | Quando |
|---|---|---|
| 400 | `parameterMissing` | Falta o envelope, ou `stageId` ao mover. |
| 401 | `unauthorized` | Sem sessão. |
| 403 | `forbidden` | Sem a permissão da rota, ou da fonte. |
| 404 | `notFound` | Não existe, é de outra organização, ou a pessoa não pode ver a conversa. |
| 422 | `invalidTime`, `invalidRange`, `rangeTooLong` | `/dashboard`: data que não é data, fim antes do início, mais de dois anos. |
| 422 | `unprocessable` | Validação, com `field` e `details`. |
| 422 | `stagesRequired`, `tooManyStages`, `duplicateStageName`, `invalidStage` | Funil: sem etapa, mais de 30, nome repetido, etapa que não é deste funil. |
| 422 | `invalidWidget`, `tooManyWidgets` | Dashboard: `details` traz `position` e `errors` do card. Nada é gravado, e os widgets que estavam lá continuam. |
| 422 | `unknownDataSource` | Fonte que não existe. |
| 422 | `fieldNotAllowed`, `operatorNotAllowed`, `metricNotAllowed`, `dimensionNotAllowed` | Campo, operador, agregação ou dimensão fora da lista da fonte. |
| 422 | `invalidFilterValue`, `invalidFiltersOperator`, `metricFiltersUnsupported` | Valor de filtro que não serve (mapa solto, lista fora de `in` e `nin`, número ou data inválidos, mais de 1.000 valores); `filtersOperator` que não é `and` nem `or`; `metrics[].filters` em fonte que não aceita. |
| 422 | `invalidGranularity`, `granularityUnsupported`, `invalidSort`, `invalidLimit`, `invalidSteps`, `invalidTimeRange`, `rangeTooLong` | Granularidade, ordenação, limite, passos e período. |
| 422 | `tooManyMetrics`, `tooManyMetricFilters`, `tooManyFilters`, `tooManyDimensions`, `tooManyMatches` | Tetos: 12 métricas, 5 filtros por métrica, 30 filtros, 5 dimensões, 50 mil conversas num filtro de presença. |
| 422 | `queryTimeout` | Consulta composta: o prazo acabou entre um passo e outro. |
| 422 | `queryFailed` | Falha do banco numa consulta que passou pela validação. Fica no log. |
| 429 | `tooManyRequests` | Mais de 300 consultas ou 10 CSV por minuto, por pessoa. |
| 503 | `queryTimeout` | O banco cortou pelo prazo: 15 s no quadro e nos funis, 30 s nos dashboards personalizados, no Mongo e no Postgres. |

---

## Dashboard: `GET /dashboard`

Parâmetros `dateStart` e `dateEnd`, com o último ano como padrão, e no máximo dois anos. Dia no fuso da organização. Fica em cache por 10 minutos, por organização, período e nível de visão.

Os números vêm de `daily_chat_stats`, que o job recalcula de hora em hora: **hoje pode estar até uma hora atrasado**. Os funis são contados na hora.

`GET /dashboard?dateStart=2026-10-08&dateEnd=2026-11-06`

Resposta `200`:

```json
{
  "hasData": true,
  "period": { "dateStart": "2026-10-08", "dateEnd": "2026-11-06" },
  "chatsTotal": 809,
  "newChats": [ { "date": "2026-10-08", "count": 29 }, { "date": "2026-10-09", "count": 37 } ],
  "activeChats": [ { "date": "2026-10-08", "count": 59 }, { "date": "2026-10-09", "count": 81 } ],
  "automationChats": [ { "date": "2026-10-08", "count": 33 }, { "date": "2026-10-09", "count": 53 } ],
  "messagesInbound": 7610,
  "messagesSentByAutomation": 3899,
  "messagesSentByCampaign": 410,
  "messagesSentByHuman": 2914,
  "messageVolume": [
    { "date": "2026-10-08", "inbound": 261, "automation": 120, "campaign": 0, "human": 99 },
    { "date": "2026-10-09", "inbound": 370, "automation": 180, "campaign": 0, "human": 163 }
  ],
  "messagesByAccount": [
    { "id": "1639f344-c1f2-4856-83d3-e04bf229bfb5", "name": "Rafael Nunes", "avatarUrl": null, "messages": 626 },
    { "id": "142418cc-dd26-455a-9cda-9ebd2cf6d198", "name": "Thiago Almeida", "avatarUrl": null, "messages": 613 }
  ],
  "chatsByChannel": { "web": 56, "facebook": 22, "instagram": 155, "whatsapp_api": 576 },
  "firstResponseAutomationSeconds": 26.3,
  "firstResponseHumanSeconds": 504.4,
  "firstResponseAutomationCount": 478,
  "firstResponseHumanCount": 206,
  "chatsWithHumanTouch": 348,
  "humanTouchRate": 43.0,
  "chatsHandledByAutomation": 317,
  "automationResolutionRate": 39.2,
  "hoursSaved": 136.5,
  "messagesAvoided": 985,
  "outOfHoursMessages": 1030,
  "automationBookings": 47,
  "heatMap": [
    { "date": "2026-10-08", "events": [ { "hour": 7, "count": 12 }, { "hour": 8, "count": 14 } ] }
  ],
  "funnels": [
    {
      "id": "bddcd914-b933-45aa-9b39-d7a098cc2b23",
      "name": "Vendas da loja",
      "description": "Do primeiro contato até o pedido fechado.",
      "total": 30,
      "stages": [
        { "id": "1790ab0e-cf8e-41e3-b6bc-b575f556d8fd", "name": "Novo contato", "count": 16, "reached": 30, "conversionRate": 100.0, "stepRate": 100.0, "dropOff": 0 },
        { "id": "b7ae4272-e43a-456f-b713-19a5f4424f7d", "name": "Em atendimento", "count": 8, "reached": 14, "conversionRate": 46.7, "stepRate": 46.7, "dropOff": 16 }
      ],
      "tags": [ { "id": "6aee3cac5d4d5c0eb9961c65", "name": "compareceu", "color": "#2ecc71", "count": 7 } ]
    }
  ]
}
```

Organização sem nenhum número ainda responde `200` com o **mesmo formato, zerado**, e `hasData: false`, para a tela mostrar o estado vazio sem tratar campo ausente:

```json
{
  "hasData": false,
  "period": { "dateStart": "2025-11-06", "dateEnd": "2026-11-06" },
  "chatsTotal": 0,
  "newChats": [],
  "messageVolume": [],
  "messagesByAccount": [],
  "chatsByChannel": {},
  "firstResponseAutomationSeconds": null,
  "humanTouchRate": 0.0,
  "heatMap": [],
  "funnels": []
}
```

| Campo | O que é |
|---|---|
| `chatsTotal`, `newChats` | Conversas criadas no período. |
| `activeChats` | Conversas que trocaram mensagem naquele dia, mesmo antigas. |
| `automationChats` | Conversas com mensagem da automação naquele dia. Campanha não conta. |
| `messagesInbound`, `messagesSentByAutomation`, `messagesSentByHuman`, `messagesSentByCampaign`, `messageVolume` | Mensagens **criadas** no período, por autoria. As séries têm um ponto por dia, do primeiro dia com número até o fim do período, sem passar de hoje. Dia parado vale zero. |
| `messagesByAccount` | Os 20 que mais enviaram. `name` nulo: a pessoa saiu da organização. Mensagem do próprio celular não tem autor, e fica de fora. |
| `chatsByChannel` | Conversas criadas, por `audienceType`: `whatsapp_api`, `import_feature`, `instagram`, `facebook`, `web`. |
| `firstResponse*Seconds` | Média **ponderada** do período. `null` sem amostra: mostre um traço, não zero. |
| `chatsWithHumanTouch`, `humanTouchRate` | Conversas criadas no período com alguma mensagem de pessoa, e o percentual sobre `chatsTotal`. |
| `chatsHandledByAutomation`, `automationResolutionRate` | Conversas com resposta da automação e **sem** nenhuma pessoa. |
| `hoursSaved` | Mensagens da automação vezes 2,1 minutos, como na origem. É estimativa, e a tela precisa dizer isso. |
| `messagesAvoided` | Mensagens da automação menos as da equipe, dia a dia, com piso em zero. |
| `outOfHoursMessages` | Mensagens da automação antes das 8h, depois das 18h ou no fim de semana, no fuso da organização. |
| `automationBookings` | Agendamentos criados sem pessoa: fluxo ou script. Os que vêm do Google não contam. |
| `heatMap` | Mensagens por hora local. Só dias e horas com mensagem: o que não vem é zero. |
| `funnels` | Todos os funis, inclusive sem conversa (`total: 0`): a tela decide se mostra. Contam as conversas **criadas** no período. `count`: estão na etapa. `reached`: chegaram até ela (acumulado). `conversionRate`: da primeira até esta. `stepRate` e `dropOff`: da anterior para esta. `tags`: as 20 mais usadas. |

**Autoria das mensagens.** Pessoa: `accountId` presente, ou a mensagem saiu do próprio celular e voltou pelo webhook (`role: assistant`, origem `user`). Campanha: `campaignId` presente. Automação: o resto do que sai da plataforma, ou seja, fluxo, lembrete e sequência da agenda.

Respostas `422`:

```json
{ "error": { "code": "invalidTime", "message": "Essa data não é válida." } }
{ "error": { "code": "invalidRange", "message": "A data final vem antes da inicial." } }
{ "error": { "code": "rangeTooLong", "message": "Escolha um período de até dois anos." } }
```

### Card a card: `aiva-frontend/src/components/cards/dashboard/`

| Card | Aqui |
|---|---|
| `EcommerceDataCard` | Os quatro de cima: Novos contatos (`newChats`), **Atendidos pela IA vira Atendidas pela automação** (`automationChats`), Total de atendimentos (`activeChats`), Mensagens trocadas (`messageVolume`, somando `inbound`, `automation` e `human`). |
| `ResponseTimeCard` | Fica. `aiSeconds` vira `firstResponseAutomationSeconds`, `aiCount` vira `firstResponseAutomationCount`. |
| **`AiAutonomyCard`** | **Vira "Autonomia da automação"**: `automationResolutionRate`, `chatsHandledByAutomation` sobre `chatsTotal`. Mudou o cálculo: a origem mostrava 100 menos `humanTouchRate`, e aí conversa que ninguém respondeu contava como autonomia. `humanTouchRate` continua saindo. |
| `ChannelMixCard` | Fica: `chatsByChannel`. Os valores são os de `audienceType`, e a origem traduzia outros (`whatsapp`, `webchat`). |
| `MessageVolumeCard` | Fica: `messageVolume`, com `automation` no lugar de `ai` e uma série nova, `campaign`. |
| **`AssistantRankingCard`** | **Sai.** Não há assistente. A mensagem de fluxo já guarda `flow_id` (ver [automation.md](automation.md)): o equivalente é uma faceta de `MessageVolumeDaily`, que ainda não existe. Sem ela, "Equipe e assistentes" vira só "Equipe". |
| `TeamRankingCard` | Fica: `messagesByAccount`. `profile_picture_url` e `provider_avatar_url` viram um só, `avatarUrl`, e o id é UUID. |
| `MetricCard`, Horas economizadas | Fica: `hoursSaved`. Agora conta as mensagens do período, de qualquer conversa. A origem contava só as de conversas criadas no período. |
| `MetricCard`, Resolução autônoma | **Vira o mesmo número de Autonomia da automação.** Na origem era "automação nunca pausada", que também contava conversa sem resposta. A tela pode juntar os dois cards. |
| `MetricCard`, Mensagens evitadas | Fica: `messagesAvoided`, com piso em zero por dia. |
| `MetricCard`, Fora do horário | Fica: `outOfHoursMessages`. |
| `MetricCard`, **Follow-ups enviados e recuperados** | **Saem.** Eram do assistente, e aqui não existem. |
| `MetricCard`, Agendamentos pela IA | Vira Agendamentos pela automação: `automationBookings`. |
| `FunelDataCard` | Fica, por funil: `funnels[].stages`. Na origem eram duas listas paralelas (`funel_names`, `funel_count`). |
| `TagsDataCard` | Fica, por funil: `funnels[].tags`, uma lista de `{ id, name, color, count }` no lugar de três listas paralelas. |
| `TrafficHeatMapCard` | Fica: `heatMap`. Hora sem mensagem não vem. |
| **`TokenUsageCard`, `CreditUsageCard`, `AvgCostCard`** | **Saem.** Só apareciam para `super_user`, que não existe aqui. E o dado é parcial: `ai_assistant` grava `usage_*` na resposta, mas o juiz e os blocos que não respondem ao contato não têm mensagem onde gravar (ver [automation.md](automation.md)), e não há crédito por dia. |
| `AgendaHighlightsCard`, `AttendanceRateCard`, `CalendarStatsCard`, `CancellationRateCard`, `CollaboratorPerformanceCard`, `DailyTrendCard`, `HourlyDistributionCard`, `UpcomingEventsCard`, `WeekdayDistributionCard` | Ficam, sem mudança nesta rota: `GET /dashboard/calendar-stats`, em [agenda.md](agenda.md). |
| `DashboardDateFilterModal`, `DashboardSkeleton`, `InlineRangeCalendar` | Só tela. |

---

## Funis: `/funnels`

Um funil é da organização: nome, descrição e etapas ordenadas. Na origem as colunas vinham das `classification_steps` do assistente. A posição da conversa fica em `funnelStages`, que `ChatSerializer` já devolve: `{ "<funnelId>": "<stageId>" }`. Até 50 funis por organização, 30 etapas por funil.

### `GET /funnels`

Em ordem de nome. 100 por padrão.

```json
{
  "funnels": [
    {
      "id": "03a56ce1-eb8f-48c3-b661-0b4ca84982e7",
      "name": "Pós-venda",
      "description": "Depois da entrega: troca, ajuste e retorno.",
      "stages": [ { "id": "20dd95e7-3fc4-40c8-a9bb-2d5011f87676", "name": "Entrega feita", "position": 0 } ],
      "createdAt": 1793997998848,
      "updatedAt": 1793997998848
    }
  ],
  "meta": { "page": 1, "perPage": 100, "total": 2, "totalPages": 1, "hasMore": false }
}
```

### `GET /funnels/:id`

`{ "funnel": { ... } }`, o mesmo objeto.

### `POST /funnels`

Etapas na ordem em que vierem. Pelo menos uma.

```json
{ "funnel": { "name": "Atacado", "description": "Compras a partir de 10 peças", "stages": [ { "name": "Pediu tabela" }, { "name": "Negociando" }, { "name": "Fechou" } ] } }
```

Resposta `201`:

```json
{
  "funnel": {
    "id": "11b11ea5-efad-4e17-8a3e-20bb7671cc89",
    "name": "Atacado",
    "description": "Compras a partir de 10 peças",
    "stages": [
      { "id": "20f9dd50-7417-427a-84b4-bddcba952cd1", "name": "Pediu tabela", "position": 0 },
      { "id": "bf3cc3e1-dcf7-4f87-aa69-fa6121e5070d", "name": "Negociando", "position": 1 }
    ],
    "createdAt": 1793998407333,
    "updatedAt": 1793998407333
  }
}
```

Respostas `422`, `400`:

```json
{ "error": { "code": "stagesRequired", "message": "Um funil precisa de pelo menos uma etapa.", "field": "stages" } }
{ "error": { "code": "duplicateStageName", "message": "Duas etapas estão com o mesmo nome.", "field": "stages" } }
{ "error": { "code": "unprocessable", "message": "Nome já está em uso", "field": "name", "details": { "name": [ "já está em uso" ] } } }
{ "error": { "code": "parameterMissing", "message": "Faltou informar funnel.", "field": "funnel" } }
```

### `PATCH /funnels/:id`

Sem `stages`, as etapas ficam como estão. **Com `stages`, a lista inteira vale:** com `id` a etapa é renomeada ou movida, sem `id` é nova, e a que não veio sai. Id de etapa que não é deste funil: `422 invalidStage`, sem gravar nada.

A conversa que estava numa etapa apagada cai em "Sem etapa" na hora, e um job limpa o que ficou gravado nela. **A tela precisa pedir confirmação ao apagar etapa.**

```json
{ "funnel": { "name": "Atacado 2026", "stages": [ { "id": "3edba7fb-27da-4b86-9e83-3c0e8f6dd3c3", "name": "Fechou" }, { "id": "20f9dd50-7417-427a-84b4-bddcba952cd1", "name": "Pediu a tabela" }, { "name": "Perdeu" } ] } }
```

### `DELETE /funnels/:id`

`204`. As posições somem das conversas num job.

### `GET /funnels/:id/board`

O quadro: uma coluna por etapa, com "Sem etapa" primeiro. Uma agregação só traz contagem e página de todas.

| Parâmetro | O que faz |
|---|---|
| `dateField` | `last_message_at` (padrão) ou `created_at`. Outro valor vale o padrão. |
| `days` | Quantos dias olhar para trás: padrão 30, até 365. |
| `perColumn` | Conversas por coluna: padrão 20, até 50. A origem ia até 100: `$facet` devolve um documento só, com teto de 16 MB. |
| `q` | Nome, nome de exibição ou telefone, como em `GET /chats`. Vale também para as contagens e `metrics`. |
| `assignedUser` | `me`, `unassigned` ou o id da pessoa, como em `GET /chats`. Vale também para as contagens e `metrics`. |
| `tagIds[]` | Conversas com qualquer uma destas etiquetas, como em `GET /chats`. Vale também para as contagens e `metrics`. |
| `page[none]`, `page[<stageId>]` | A página de cada coluna. Para carregar mais de uma coluna, peça só ela e junte: as outras voltam na primeira página. |

`GET /funnels/:id/board?days=365&perColumn=2`

Resposta `200` (uma coluna de cada tipo, com um card em cada):

```json
{
  "funnel": { "id": "bddcd914-b933-45aa-9b39-d7a098cc2b23", "name": "Vendas da loja", "...": "..." },
  "filters": { "dateField": "last_message_at", "days": 365, "perColumn": 2 },
  "columns": [
    {
      "stageId": null,
      "stageName": "Sem etapa",
      "count": 5,
      "page": 1,
      "hasMore": true,
      "chats": [
        {
          "id": "6aee3cac5d4d5c0eb9961c1e",
          "connectorId": "6aee3ca95d4d5c0eb9961bc2",
          "externalId": "5531970000685",
          "phoneNumber": "5531970000685",
          "userName": "Bruno Cardoso",
          "displayName": null,
          "profilePictureUrl": null,
          "status": "closed",
          "automationEnabled": false,
          "assignedAccountId": null,
          "assignedAccountName": null,
          "teamId": null,
          "unreadMessages": 0,
          "activeSession": false,
          "summary": "",
          "notes": null,
          "lastMessageAt": 1792851420000,
          "lastMessageType": "text",
          "lastMessageBy": "assistant",
          "lastMessageContent": "Boa tarde! Abrimos sim, das 10h às 16h.",
          "stageId": null,
          "chatTags": [ { "id": "6aee3ca95d4d5c0eb9961bc9", "name": "vip", "color": "#db2777" } ],
          "createdAt": 1792851000000
        }
      ]
    },
    {
      "stageId": "1790ab0e-cf8e-41e3-b6bc-b575f556d8fd",
      "stageName": "Novo contato",
      "count": 16,
      "page": 1,
      "hasMore": true,
      "chats": [
        {
          "id": "6aee3ca95d4d5c0eb9961bd1",
          "userName": "Ana Beatriz Moura",
          "assignedAccountName": null,
          "teamId": "e2b23f68-312c-4853-955c-3dc6c698d4ce",
          "unreadMessages": 2,
          "activeSession": true,
          "lastMessageContent": "Se chegar até sexta, já quero fechar",
          "stageId": "1790ab0e-cf8e-41e3-b6bc-b575f556d8fd",
          "chatTags": [ { "id": "6aee3ca95d4d5c0eb9961bc4", "name": "cliente-novo", "color": "#7c3aed" } ],
          "...": "..."
        }
      ]
    }
  ],
  "metrics": {
    "total": 35,
    "noStage": 5,
    "perStageCounts": [ 16, 8, 4, 2 ],
    "reachedCounts": [ 30, 14, 6, 2 ],
    "conversionRates": [ 100.0, 46.7, 20.0, 6.7 ]
  }
}
```

`metrics`: `perStageCounts`, `reachedCounts` e `conversionRates` têm uma posição por etapa, **sem** "Sem etapa". Na origem a primeira posição era "Sem etapa", e o "em relação à 1ª etapa" dividia por ela.

O card não traz `customAttributes`: para o painel lateral, `GET /chats/:id`.

### `PUT /funnels/:funnelId/chats/:chatId`

Move a conversa. `stageId: null` tira do funil. Sem o campo: `400`, para um corpo errado não tirar a conversa do funil por engano.

`moved: false` quando ela já estava lá: nada foi gravado nem transmitido.

**Tempo real:** a lista de conversas recebe o `upsert` de `ChatListChannel`, com `funnelStages` novo. O quadro não tem canal próprio, como na origem.

```json
{ "stageId": "bf3cc3e1-dcf7-4f87-aa69-fa6121e5070d" }
```

Resposta `200` (trecho):

```json
{
  "chat": {
    "id": "6aee3caa5d4d5c0eb9961bd7",
    "userName": "João Pedro Almeida",
    "funnelStages": {
      "bddcd914-b933-45aa-9b39-d7a098cc2b23": "1790ab0e-cf8e-41e3-b6bc-b575f556d8fd",
      "11b11ea5-efad-4e17-8a3e-20bb7671cc89": "bf3cc3e1-dcf7-4f87-aa69-fa6121e5070d"
    },
    "...": "..."
  },
  "stageId": "bf3cc3e1-dcf7-4f87-aa69-fa6121e5070d",
  "moved": true
}
```

Respostas `422`, `400`:

```json
{ "error": { "code": "invalidStage", "message": "Esta etapa não é deste funil.", "field": "stageId" } }
{ "error": { "code": "parameterMissing", "message": "Faltou informar stage_id.", "field": "stageId" } }
```

### `DELETE /funnels/:funnelId/chats/:chatId`

Tira a conversa só deste funil. Mesma resposta.

---

## Dashboards personalizados: `/custom-dashboards`

### Cadastro

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /custom-dashboards` | | `{ customDashboards: [...], meta }`, do mais recente para o mais antigo, sem os widgets, com `widgetsCount` e `createdByName`. 100 por padrão. |
| `GET /custom-dashboards/:id` | | `{ customDashboard }`, com os widgets. |
| `POST /custom-dashboards` | `{ customDashboard: { name, description, icon, globalFilters, widgets } }` | `201`. |
| `PATCH /custom-dashboards/:id` | Os mesmos. Sem `widgets`, ou com `null`, ficam como estão. Lista vazia apaga todos. | `200`. A lista inteira é trocada de uma vez, e só depois de conferir tudo. |
| `DELETE /custom-dashboards/:id` | | `204`. |
| `POST /custom-dashboards/:id/duplicate` | | `201`, com o nome "(cópia)", widgets de id novo, e em nome de quem duplicou. |
| `PATCH /custom-dashboards/:id/toggle-favorite` | | `{ isFavorite }`. O favorito é do dashboard, e não da pessoa, como na origem. |

Até 100 dashboards por organização, 60 widgets por dashboard, e 32 KB em cada mapa de widget.

`widgetType`: `kpi`, `line_chart`, `bar_chart`, `pie_chart`, `donut_chart`, `area_chart`, `table`, `funnel`, `heatmap`, `gauge`, `number_trend`, `rich_text`, `progress_bar`, `radar`, `section_divider`. `dataSource` é obrigatório, menos em `rich_text` e `section_divider`.

**`query`, `visualConfig`, `layout` e `globalFilters` são da tela:** voltam exatamente como foram, em camelCase, com chaves que são dados. O servidor nunca executa o `query` guardado: a tela manda para `POST /custom-dashboards/query`.

Resposta de `GET /custom-dashboards/:id` (dois widgets):

```json
{
  "customDashboard": {
    "id": "6aee3cae5d4d5c0eb9961caa",
    "name": "Atendimento da semana",
    "description": "Conversas, agenda e equipe, num lugar só.",
    "icon": "chart",
    "isFavorite": true,
    "isDefault": false,
    "globalFilters": {},
    "createdByAccountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
    "createdAt": 1793997998925,
    "updatedAt": 1793997999012,
    "widgets": [
      {
        "id": "6aee3cae5d4d5c0eb9961cab",
        "widgetType": "section_divider",
        "title": "Visão geral",
        "dataSource": null,
        "query": {},
        "visualConfig": {},
        "layout": { "x": 0, "y": 0, "w": 12, "h": 1 },
        "position": 0
      },
      {
        "id": "6aee3cae5d4d5c0eb9961cac",
        "widgetType": "kpi",
        "title": "Conversas novas",
        "dataSource": "conversations",
        "query": { "dataSource": "conversations", "metrics": [ { "aggregation": "count", "label": "Conversas" } ] },
        "visualConfig": { "format": "number" },
        "layout": { "x": 0, "y": 1, "w": 3, "h": 3 },
        "position": 1
      }
    ]
  }
}
```

Widget inválido, `422`:

```json
{
  "error": {
    "code": "invalidWidget",
    "message": "Card 1: Tipo não está na lista",
    "field": "widgets",
    "details": { "position": 0, "errors": { "widgetType": [ "não está na lista" ] } }
  }
}
```

### `GET /custom-dashboards/data-sources`

As fontes que **esta pessoa** pode consultar. É o que a tela usa para montar os seletores.

```json
{
  "dataSources": [
    {
      "key": "conversations",
      "label": "Conversas",
      "fields": [
        { "key": "status", "label": "Situação", "type": "enum", "enumValues": [ "open", "closed" ] },
        { "key": "assigned_account_id", "label": "Atendente", "type": "string", "enumValues": null, "filterType": "relationship" },
        { "key": "custom_attributes", "label": "Campo personalizado", "type": "custom_attribute", "enumValues": null, "filterType": "custom_attribute" },
        { "key": "booking_attendance", "label": "Presença em agendamento", "type": "string", "enumValues": null, "filterType": "relationship" }
      ],
      "allowedMetrics": [ "count", "sum", "avg", "min", "max" ],
      "allowedDimensions": [ "status", "assigned_account_id", "audience_type", "team_id", "connector_id", "created_at" ],
      "relatedDimensions": [ { "key": "chat_tag_name", "label": "Etiqueta" } ],
      "supportsCustomAttributeDimensions": true
    }
  ]
}
```

A chave dos campos é em snake_case, porque é **valor**: é o que a tela manda de volta em `field`. `booking_attendance` é só filtro: nunca métrica nem dimensão.

| Fonte | O que é | Período padrão |
|---|---|---|
| `conversations` | Conversas. | `created_at` |
| `contacts` | Contato é a conversa, como em `/contacts`: um número em dois canais conta duas vezes. | `created_at` |
| `messages` | Mensagens, só `count`. O texto não sai. Período obrigatório: sem ele, 90 dias; no máximo 366. | `created_at` |
| `agenda_bookings` | Agendamentos, sem os arquivados. | `start` |
| `campaigns` | Campanhas e os contadores delas. | `created_at` |
| `daily_stats` | Os números do dashboard, dia a dia. Não aceita `metrics[].filters`. | `day` |
| `hook_logs` | O que os webhooks receberam, com a permissão `core_settings`. O que veio na requisição não sai. Logs duram 90 dias. Ver [automation.md](automation.md). | `created_at` |

### `GET /custom-dashboards/filter-options?sourceKey=conversations`

As opções dos filtros da organização. As chaves são os campos, e ficam como estão. Fonte que não existe: `404`. Sem a permissão dela: `403`.

```json
{
  "filterOptions": {
    "assigned_account_id": [ { "value": "d73c767d-3f1a-4174-b30e-bb131ba9a09c", "label": "Camila Rocha" } ],
    "team_id": [ { "value": "c0ed60b7-c669-4dbc-b32e-b4de33ee64b5", "label": "Atendimento" } ],
    "connector_id": [ { "value": "6aee3ca95d4d5c0eb9961bc0", "label": "Site da Doma Store" } ],
    "tags": [ { "value": "aguardando-operador", "label": "aguardando-operador" } ],
    "custom_attributes": [ { "value": "aniversario", "label": "Aniversário", "valueType": "date", "optionValues": [] } ],
    "booking_attendance": [ { "value": "show", "label": "Compareceu" }, { "value": "no_show", "label": "Não compareceu" } ]
  }
}
```

### `POST /custom-dashboards/query`

Corpo solto.

| Campo | O que é |
|---|---|
| `dataSource` | A fonte. |
| `metrics[]` | `{ field?, aggregation, label?, filters?, filtersOperator? }`. `aggregation`: `count`, `sum`, `avg`, `min`, `max`, conforme `allowedMetrics`. `sum` e `avg` só em número; `min` e `max`, em número e data. `count` não precisa de `field`. Com `filters`, a métrica é condicional, e os filtros combinam por `filtersOperator` (`and`, o padrão, ou `or`). |
| `dimensions[]` | `{ field, granularity? }`. `field`: de `allowedDimensions`, de `relatedDimensions`, outro campo agrupável da fonte, ou `custom_attributes.<chave>`. `granularity` em data: `day` (padrão), `week`, `month`, `year`, no fuso da organização. A semana começa na segunda. Campo personalizado não aceita. |
| `filters[]` | `{ field, operator, value }`, combinados por AND. |
| `timeRange` | `{ field?, start?, end? }`. Milissegundos, ISO-8601 ou só a data. Só a data em `end` inclui o dia inteiro. Sem `start`, 90 dias antes do fim. `field` que não é data da fonte vale o padrão dela. Até 731 dias. |
| `sort` | `{ field, direction }`. Depois de agrupar: o nome de uma métrica ou de uma dimensão. Sem agrupar: um campo da fonte. |
| `limit` | De 1 a 10.000. Sem agrupar, o padrão é 1.000. |

Sem `metrics` nem `dimensions`, cada linha é um documento, só com os campos da fonte.

**Operadores:** `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `nin`, `contains`, `exists`, `not_exists`. Fora disso, `operatorNotAllowed`, e também em dois casos:

- Em `tags` e `booking_attendance`, só `eq`, `ne`, `in`, `nin`. A origem ignorava os outros e devolvia tudo, como se tivesse filtrado.
- `contains` só em texto: nunca em campo `number`, `date` ou `boolean`. O `type` de cada campo vem em `data-sources`.

**Valor:** o que não serve é `invalidFilterValue`.

- Lista só em `in` e `nin`, além de `tags` e `booking_attendance`, onde `eq` com vários valores quer dizer "um destes".
- Em campo `number`, e nas comparações de campo personalizado, precisa ser número, até 10^15.
- Em campo `date`, milissegundos, ISO-8601 ou só a data, de 1900 a 2200. A mesma faixa vale para `timeRange`.
- Em `exists` e `not_exists`, o valor não conta.

**Filtro no meio da edição.** O editor da tela consulta enquanto a pessoa preenche, então duas formas passam: valor vazio (`""`), que compara com vazio, ou zero em campo de número; e `custom_attributes` com `key: ""`, que fica de fora da consulta. Qualquer outra chave fora de `[a-z0-9_]` é `fieldNotAllowed`.

**Campo personalizado** no filtro tem duas formas: `{ "field": "custom_attributes", "value": { "key": "cidade", "value": "BH" } }` ou `{ "field": "custom_attributes.cidade", "value": "BH" }`. Em `gt`, `gte`, `lt`, `lte`, compara como número, e num texto como "20 a 40/dia" vale o menor número. Texto sem número fica de fora.

**Agrupar por campo personalizado** tem dois valores especiais: `__empty__` (sem o campo) e `__invalid__` (o valor não é texto). `labels` traz o nome deles.

`POST /custom-dashboards/query`:

```json
{
  "dataSource": "conversations",
  "dimensions": [ { "field": "assigned_account_id" } ],
  "metrics": [
    { "aggregation": "count", "label": "Conversas" },
    { "aggregation": "count", "label": "Abertas", "filters": [ { "field": "status", "operator": "eq", "value": "open" } ] }
  ],
  "sort": { "field": "Conversas", "direction": "desc" },
  "timeRange": { "start": "2026-08-09", "end": "2026-11-06" }
}
```

Resposta `200`:

```json
{
  "rows": [
    { "assigned_account_id": null, "Conversas": 30, "Abertas": 15 },
    { "assigned_account_id": "d73c767d-3f1a-4174-b30e-bb131ba9a09c", "Conversas": 1, "Abertas": 1 },
    { "assigned_account_id": "142418cc-dd26-455a-9cda-9ebd2cf6d198", "Conversas": 1, "Abertas": 1 }
  ],
  "columns": [ "assigned_account_id", "Conversas", "Abertas" ],
  "labels": {
    "assigned_account_id": {
      "d73c767d-3f1a-4174-b30e-bb131ba9a09c": "Camila Rocha",
      "142418cc-dd26-455a-9cda-9ebd2cf6d198": "Thiago Almeida"
    }
  },
  "fieldLabels": { "status": "Situação", "assigned_account_id": "Atendente", "...": "..." },
  "meta": {
    "total": 4,
    "truncated": false,
    "timeRange": { "field": "created_at", "from": 1786244400000, "to": 1794020399999 }
  }
}
```

- `rows`: uma chave por coluna. Dimensão com o nome do campo; métrica com o `label`. Dois `label` iguais viram `"Total"` e `"Total (2)"`.
- `labels`: o nome de cada valor das dimensões, por campo. `id` que não aparece aqui saiu da organização; `null` é "sem atendente".
- `fieldLabels`: o nome de cada coluna, inclusive o do campo personalizado usado como dimensão.
- `meta.truncated`: há mais linhas do que o `limit`.
- `meta.timeRange`: o período que valeu de verdade.
- **Data sai em milissegundos**, no começo do dia, da semana ou do mês no fuso da organização.

Por semana:

```json
{ "rows": [ { "created_at": 1791169200000, "Conversas": 2 }, { "created_at": 1791774000000, "Conversas": 7 } ], "columns": [ "created_at", "Conversas" ], "labels": {} }
```

Por campo personalizado, com filtro numérico em outro:

```json
{
  "rows": [ { "custom_attributes.cidade": "Belo Horizonte", "Conversas": 2 }, { "custom_attributes.cidade": "Curitiba", "Conversas": 1 } ],
  "labels": { "custom_attributes.cidade": { "__empty__": "(vazio)", "__invalid__": "(inválido)" } },
  "fieldLabels": { "custom_attributes.cidade": "Cidade", "...": "..." }
}
```

Por etiqueta (`chat_tag_name`), pelo profissional da agenda (`professional_name`), e campanhas somando enviadas:

```json
{ "rows": [ { "chat_tag_name": "retorno", "Conversas": 5 }, { "chat_tag_name": "pos-venda", "Conversas": 5 } ] }
{ "rows": [ { "professional_name": "Camila Rocha", "Agendamentos": 8, "Compareceram": 4 }, { "professional_name": "Thiago Almeida", "Agendamentos": 5, "Compareceram": 1 } ] }
{ "rows": [ { "status": "cancelled", "Enviadas": 9 }, { "status": "completed", "Enviadas": 93 }, { "status": "paused", "Enviadas": 33 } ], "labels": { "status": { "draft": "Rascunho", "cancelled": "Cancelada", "...": "..." } } }
```

Sem agrupar, com `limit: 1`:

```json
{
  "rows": [
    {
      "status": "open",
      "assigned_account_id": null,
      "team_id": "5eb245a9-6e91-46d3-bf02-a4d5cbdc5443",
      "connector_id": "6aee3ca95d4d5c0eb9961bc1",
      "created_at": 1793902020000,
      "updated_at": 1793997998873,
      "last_message_at": 1793903220000,
      "unread_messages": 1,
      "tags": [ "vip", "retorno" ],
      "audience_type": "whatsapp_api",
      "automation_enabled": true,
      "red_flag_count": 0,
      "user_name": "Fernanda Lima",
      "custom_attributes": { "cidade": "Belo Horizonte", "ticket_medio": "500" }
    }
  ],
  "meta": { "total": 1, "truncated": true, "...": "..." }
}
```

Recusas, `422`, cada uma a partir do que o cliente mandou:

```json
// { "filters": [ { "field": "status", "operator": "$where", "value": "1" } ] }
{ "error": { "code": "operatorNotAllowed", "message": "O operador $where não pode ser usado aqui.", "field": "filters" } }

// { "filters": [ { "field": "organization_id", "operator": "eq", "value": "x" } ] }
{ "error": { "code": "fieldNotAllowed", "message": "O campo organization_id não pode ser usado aqui.", "field": "filters" } }

// { "filters": [ { "field": "custom_attributes", "operator": "eq", "value": { "key": "a.$where", "value": "1" } } ] }
{ "error": { "code": "fieldNotAllowed", "message": "O campo custom_attributes.a.$where não pode ser usado aqui.", "field": "filters" } }

// { "filters": [ { "field": "status", "operator": "eq", "value": { "$ne": "x" } } ] }
{ "error": { "code": "invalidFilterValue", "message": "O valor do filtro em status não é válido.", "field": "filters" } }

// { "metrics": [ { "field": "unread_messages", "aggregation": "$function" } ] }
{ "error": { "code": "metricNotAllowed", "message": "A conta $function não pode ser usada neste campo.", "field": "metrics" } }

// { "dimensions": [ { "field": "organization_id" } ], "metrics": [ { "aggregation": "count" } ] }
{ "error": { "code": "dimensionNotAllowed", "message": "Não dá para agrupar por organization_id.", "field": "dimensions" } }

// { "dataSource": "daily_stats", "sort": { "field": "day; DROP TABLE organizations; --" }, "...": "..." }
{ "error": { "code": "invalidSort", "message": "Não dá para ordenar por day; DROP TABLE organizations; --.", "field": "sort" } }

// { "limit": 20000 }
{ "error": { "code": "invalidLimit", "message": "O limite precisa ser um número de 1 a 10000.", "field": "limit" } }

// { "dataSource": "accounts" }
{ "error": { "code": "unknownDataSource", "message": "Esta fonte de dados não existe.", "field": "dataSource" } }

// { "dataSource": "messages", "timeRange": { "start": "2020-01-01", "end": "2026-11-06" } }
{ "error": { "code": "rangeTooLong", "message": "Escolha um período de até 366 dias.", "field": "timeRange" } }
```

### `POST /custom-dashboards/compound-query`

De 1 a 10 passos, cada um uma consulta independente, e a tela calcula a fórmula em cima. Um passo ruim recusa a consulta inteira. **Os passos rodam em sequência, dividindo o mesmo prazo de 30 s.**

```json
{
  "steps": [
    { "id": "conversas", "dataSource": "conversations", "metrics": [ { "aggregation": "count", "label": "value" } ], "timeRange": { "field": "created_at", "start": "2026-08-09", "end": "2026-11-06" } },
    { "id": "recebidas", "dataSource": "daily_stats", "metrics": [ { "field": "messages_inbound", "aggregation": "sum", "label": "value" } ], "timeRange": { "field": "created_at", "start": "2026-08-09", "end": "2026-11-06" } }
  ]
}
```

Resposta `200` (trecho):

```json
{
  "results": {
    "conversas": { "rows": [ { "value": 33 } ], "columns": [ "value" ], "labels": {}, "meta": { "total": 1, "truncated": false, "timeRange": { "field": "created_at", "...": "..." } } },
    "recebidas": { "rows": [ { "value": 19890.0 } ], "columns": [ "value" ], "labels": {}, "meta": { "total": 1, "truncated": false, "timeRange": { "field": "day", "...": "..." } } }
  }
}
```

### `POST /custom-dashboards/query-csv`

O mesmo corpo de `query`. Até 10 por minuto.

```
Content-Disposition: attachment; filename="dashboard-20261106-175331.csv"

Situação,Conversas
Fechada,15
Aberta,18
```

Cabeçalho e valores com os nomes, data legível no fuso da organização, e fórmula neutralizada: o nome do contato vem de fora, e `=HYPERLINK(...)` viraria fórmula na planilha.

---

## Interface de Ruby

### Para o bloco de fluxo: `Funnels::MoveChat`

O único caminho de escrita da posição. A tela chama por `PUT /funnels/:id/chats/:chatId`, e o bloco `set_funnel_stage` ([automation.md](automation.md)) chama daqui:

```ruby
funnel = chat.organization.funnels.find(funnel_id)
result = Funnels::MoveChat.call(chat: chat, funnel: funnel, stage_id: stage_id) # nil tira do funil
result.stage    # FunnelStage ou nil
result.moved?   # false se já estava lá: não grava nem transmite
```

- `Funnels::MoveChat::InvalidStage`: a etapa não é deste funil. O bloco deve registrar e seguir: uma etapa apagada não pode derrubar o fluxo.
- `Funnels::MoveChat::ForeignFunnel`: o funil é de outra organização.
- Quem decide se a pessoa pode ver a conversa é quem chama (`Chat.visible_to`). Fluxo não age em nome de ninguém.
- O fluxo guarda o id do funil e da etapa: renomear não quebra, e apagar dá `InvalidStage`.

Para ler: `chat.funnel_stage_id(funnel.id)`. Para escrever sem conferir nem transmitir, como na semente: `chat.place_in_funnel!(funnel_id, stage_id)` e `chat.remove_from_funnel!(funnel_id)`. Os dois são atômicos na chave daquele funil.

### Para o dashboard e o copiloto: `ChatFunnel`

```ruby
ChatFunnel.analyze(Chat.visible_to(account).valid_records, funnels, from:, to:, date_field: "created_at")
# => [{ funnel:, total:, stages: [{ id:, name:, count:, reached:, conversion_rate:, step_rate:, drop_off: }], tags: [...] }]
```

### Fonte nova em dashboard personalizado

**A de pipelines entra assim, sem mexer no resto** (ver `app/services/custom_dashboards/data_source_registry.rb`):

1. Crie `app/services/custom_dashboards/sources/pipelines.rb`:

   ```ruby
   module CustomDashboards
     module Sources
       module Pipelines
         DEFINITION = {
           model_class: "Pipelines::Card",
           orm: :active_record,
           permission: :pipelines,
           default_time_field: "created_at",
           # Com a organização: é o que garante o isolamento. Recebe a pessoa que consulta.
           scope: ->(account) { Pipelines::Card.where(organization_id: account.organization_id) },
           fields: [
             { key: "stage_id", type: "string" },
             { key: "created_at", type: "date" }
           ],
           allowed_metrics: %w[count],
           allowed_dimensions: %w[stage_id created_at]
         }.freeze
       end
     end
   end
   ```

2. Acrescente `Pipelines` em `DataSourceRegistry::SOURCE_NAMES`.
3. Acrescente `insights.custom_dashboards.sources.pipelines` (`label` e `fields`) nos dois idiomas. Uma spec confere que nenhum campo fica sem tradução.

Modelo Mongoid passa por `MongoidBuilder`, e ActiveRecord por `ActiveRecordBuilder`, que já trata coluna de verdade (`jsonb:` é só para campo dentro de jsonb), o prazo e a falha de SQL. O escopo é aplicado sempre, e nada do cliente o alcança.

No Postgres, `related_dimensions`, `document_id_filters` e `metrics[].filters` não existem: `ActiveRecordBuilder` só agrupa por campo da fonte, e o nome de uma coluna de id vem por `label_from`.

Os filtros `pipeline_status` e `pipeline_stage` da origem, sobre conversas: um resolver em `DocumentIdResolvers` e uma linha em `document_id_filters` de `Sources::Conversations`.

---

## Copiloto

As ferramentas estão em [inbox.md](inbox.md). Daqui saíram: `list_appointments`, `get_appointment_details`, `cancel_appointment`, `reschedule_appointment`, `qualify_appointments`, `get_appointment_stats`, `get_chat_funnel`, o contexto `booking_qualification` do analisador, e `appointments_created` e `conversion_rate` nas métricas da equipe, com `conversion_rate` em `sort_by` do ranking.

A nota do ranking volta a ter 30 pontos de conversão, sobre 100. Organização sem calendário continua com os outros critérios valendo proporcionalmente.

---

## Índices: o que `explain` mostrou

Com 20 mil conversas, 120 mil mensagens, 3 mil agendamentos e 300 campanhas numa organização, medido com `explain` em `executionStats`. **Nenhuma varredura de coleção.** Toda agregação começa por `organization_id`, e `$lookup` em mensagens usa `{ chat_id, created_at, _id }`.

| Agregação | Índice | Documentos lidos | Devolvidos | Tempo |
|---|---|---|---|---|
| `MessageVolumeDaily`, um dia | `organization_id, last_message_at` + `$lookup` em `chat_id, created_at, _id` | 374 + 563 | 374 | 39 ms |
| `FirstResponseDaily`, um dia | `chat_id, created_at, _id` | 972 | 972 | 11 ms |
| `ChannelMixDaily`, um dia | `organization_id, created_at` | 162 | 162 | 3 ms |
| `OperationalRangeDigest`, volume em 30 dias | `organization_id, last_message_at` + `$lookup` | 7.199 + 41.270 | 7.199 | 998 ms |
| `OperationalRangeDigest`, 1ª resposta em 30 dias | `organization_id, created_at` + `$lookup` | 6.878 + 41.268 | 6.878 | 860 ms |
| `Funnels::Board`, 30 dias, dono | `organization_id, last_message_at` | 7.041 | 7.041 | 54 ms |
| `Funnels::Board`, 30 dias, `chat_list_to: assigned` | `organization_id, last_message_at` | 7.041 | 696 | 18 ms |
| `Funnels::Board`, 90 dias, por criação | `organization_id, created_at` | 20.000 | 20.000 | 119 ms |
| `ChatFunnel`, 30 dias | `organization_id, created_at` | 6.716 | 6.716 | 36 ms |
| Dashboard personalizado, conversas por canal | `organization_id, created_at` | 20.000 | 20.000 | 46 ms |
| Dashboard personalizado, conversas sem agrupar | `organization_id, created_at`, com `$sort` no índice | 1.001 | 1.001 | 7 ms |
| Dashboard personalizado, por etiqueta | `organization_id, created_at` + `$lookup` em `_id` | 20.000 + 6.668 | 20.000 | 159 ms |
| Dashboard personalizado, mensagens em 30 dias | `organization_id, last_message_at` + `$lookup` | 7.041 + 40.297 | 7.041 | 468 ms |
| Dashboard personalizado, agendamentos | `organization_id, start` | 3.000 | 3.000 | 12 ms |
| Dashboard personalizado, campanhas | `organization_id, created_at` | 300 | 300 | 5 ms |
| `get_appointment_stats`, 30 dias | `organization_id, start` | 1.028 | 1.028 | 6 ms |

**O `hint` veio do `explain`.** Sem ele, o planejador escolheu `{ organization_id, created_at }` para filtrar por `last_message_at`, e o quadro de quem só vê o que é seu leu as 20 mil conversas, e não 7.041. E escolheu `created_at_1`, o índice global, para `chat_id $in`: em produção, são as mensagens de todo mundo naquele dia. O plano escolhido fica em cache para toda consulta do mesmo formato. Por isso as agregações dizem o índice (`Insights::ChatIndexes`).

**O preço:** sem `db:mongoid:create_indexes`, a agregação é recusada em vez de varrer. É a falha certa.

O que a varredura limita, além do índice: `days` no quadro (até 365), `dateStart` e `dateEnd` no dashboard (até 2 anos), `timeRange` nas consultas (até 731 dias; 366 em mensagens), e `max_time_ms` em tudo o que uma pessoa dispara, com `statement_timeout` no equivalente em Postgres.

---

## Tempo e jobs

- `DashboardBackfillJob`, fila `low`, sem nova tentativa: `hourly` de hora em hora, para o dia corrente; `daily` às 02:15 de São Paulo, para o dia anterior. O dia é o do fuso de cada organização. Organização sem conversa ativa no dia fica sem linha, e o dashboard completa com zero.
- `bin/rails "dashboards:backfill_operational[365,<organization_id>]"`: preenche os dias passados, em chunks mensais. Sem a organização, passa por todas.
- `Funnels::CleanupChatsJob`, fila `low`: tira das conversas a posição que deixou de existir.

## Semente

`db/seeds/insights.rb`, idempotente, na organização de `marina.duarte@exemplo.com.br`:

- 90 dias de `daily_chat_stats`, com domingo parado, sexta cheia e crescimento leve. **Os números são escritos, e não calculados:** a semente de conectores só tem alguns dias de conversa. O job recalcula o dia corrente a partir das mensagens de verdade, então o dia de hoje cai depois que ele roda.
- "Vendas da loja" (4 etapas) e "Pós-venda" (3 etapas), com as conversas distribuídas e algumas em "Sem etapa".
- "Atendimento da semana", um dashboard personalizado de 8 cards, com seis fontes e tipos diferentes. Todo card responde pela consulta de verdade: a spec confere.

## Para o deploy

- `bin/rails db:migrate`: `funnels` e `funnel_stages`.
- **`bin/rails db:mongoid:create_indexes` antes de receber tráfego.** Sem os índices de `Chat`, `ChatMessage::Base` e `Agenda::Booking`, o dashboard, o quadro e os dashboards personalizados são recusados.
- `bin/rails "dashboards:backfill_operational[90]"` para preencher a história das organizações que já existem, fora do horário de pico.
- Sidekiq com a fila `low`.

## Limites conhecidos

- **Hoje atrasado até uma hora**, e o relatório em cache por mais 10 minutos.
- **Horário comercial fixo** em "fora do horário": 8h às 18h, de segunda a sexta, como na origem. A janela que a organização configurou (`business_work`) não entra.
- **Quadro sem tempo real próprio**, como na origem. A lista de conversas recebe o `upsert`.
- **O funil não guarda histórico:** a posição é só a atual, e "chegou até a etapa" é inferido de onde a conversa está. Quem volta de etapa deixa de contar nas posteriores.
- **`$facet` tem teto de 16 MB:** 31 colunas com 50 conversas, em conversas com `notes` ou `summary` muito longos, podem bater nele. Vira `500`. Não reproduzido.
- **Filtro de presença em agendamento** recusa acima de 50 mil conversas (`tooManyMatches`).
- `contacts` conta conversas, e não pessoas.

## O que não foi exercitado

Com Puma, Sidekiq, Redis, Postgres, Mongo e um cliente HTTP de verdade, passaram 98 chamadas em todas as rotas deste contrato, com três pessoas (dona, `chat_list_to: team` e sem permissão) e uma segunda organização. O job recorrente disparou sozinho no Sidekiq às 18:00, e o `daily` foi enfileirado e rodou. O `dashboards:backfill_operational` rodou de verdade em 30 dias. O copiloto passou pelo `CopilotChannel` num WebSocket de verdade, com o modelo de verdade, em todas as ferramentas novas: remarcou e cancelou agendamentos da semente.

Ficou de fora, ou só em spec:

- **Volume de produção.** O `explain` foi com 20 mil conversas, e não com milhões. `max_time_ms` estourando está só em spec, com o erro simulado. `statement_timeout` também só em spec, mas cortando de verdade um `pg_sleep`.
- **`daily` às 02:15 pelo relógio:** rodou enfileirado à mão. O cron dele foi carregado, e não disparou.
- **Limite de 300 consultas por minuto:** a spec exercita o de CSV, que é o mesmo mecanismo.
- **`tooManyMatches` e `queryFailed`:** só em spec.
- **Teto de 16 MB no `$facet`:** não reproduzido.
- **O ranking da equipe com o modelo:** `get_team_ranking` passou pelo modelo antes de a conversão contar conversas distintas. A conta corrigida só foi exercitada em spec, sem nova rodada com o modelo.
- **Google e provedores de mensagem:** remarcar e cancelar pelo copiloto passaram pelo serviço da agenda, sem agenda do Google conectada e sem envio de verdade.
- **A fonte `pipelines`:** o caminho acima não foi exercitado. Nada está registrado neste branch.
- **A tela dos dashboards personalizados.** O Dashboard e os Funis já têm front (`routes/dashboard`, `routes/funnels`); os personalizados, não.

---

## De cada hook da origem ao endpoint

Conferido contra `aiva-frontend/src/api`, export por export.

### `src/api/dashboard.js`

| Export | Origem | Aqui |
|---|---|---|
| `useDashboardData` | `GET /dashboard` | `GET /dashboard?dateStart=&dateEnd=`. O formato mudou: ver [Card a card](#card-a-card-aiva-frontendsrccomponentscardsdashboard). |

### `src/api/use-pipeline.ts`

| Export | Origem | Aqui |
|---|---|---|
| `usePipeline` (padrão) | `GET /pipeline?organization_id=&date_field=&days=&per_column=` | `GET /funnels/:id/board?dateField=&days=&perColumn=`. O funil no lugar do assistente. |
| `loadMore` | `...&page[<índice da etapa>]=` | `...&page[<stageId>]=`, ou `page[none]=`. Use `hasMore`. |
| `refresh` | a mesma rota | a mesma rota. |

O filtro de assistente (`useAutomations`, em `pipeline-filter-bar.tsx`) vira a lista de `GET /funnels`. Mover conversa **não existia** na origem: é novo, em `PUT /funnels/:id/chats/:chatId`. O modal do card (`pipeline-modal.tsx`) usa `updateConversation`, que aqui é `PATCH /chats/:id`.

### `src/api/custom-dashboards.ts`

| Export | Origem | Aqui |
|---|---|---|
| `useCustomDashboards` | `GET /custom_dashboards`, uma lista solta | `GET /custom-dashboards`: `{ customDashboards, meta }` |
| `useCustomDashboard` | `GET /custom_dashboards/:id` | `GET /custom-dashboards/:id`: `{ customDashboard }` |
| `useDataSources` | `GET /custom_dashboards/data_sources` | `GET /custom-dashboards/data-sources`: `{ dataSources }`. Só as fontes que a pessoa alcança. |
| `useFilterOptions` | `GET /custom_dashboards/filter_options?source_key=` | `GET /custom-dashboards/filter-options?sourceKey=`: `{ filterOptions }`. `custom_attributes` já vem com `valueType` e `optionValues`: a conversão da origem cai. |
| `createDashboard` | `POST /custom_dashboards`, corpo solto, só `super_user` | `POST /custom-dashboards`, com o envelope `customDashboard`, para quem tem a permissão. |
| `updateDashboard` | `PUT /custom_dashboards/:id`, corpo solto | `PATCH /custom-dashboards/:id`, com o envelope. |
| `deleteDashboard` | `DELETE /custom_dashboards/:id` | `DELETE /custom-dashboards/:id` |
| `duplicateDashboard` | `POST .../:id/duplicate` | `POST /custom-dashboards/:id/duplicate`: `{ customDashboard }` |
| `queryWidgetData` | `POST .../query`, em snake_case | `POST /custom-dashboards/query`, em camelCase. |
| `useWidgetData` | `POST .../query` | `POST /custom-dashboards/query` |
| `queryCompoundData` | `POST .../compound_query` | `POST /custom-dashboards/compound-query` |
| `useCompoundWidgetData` | `POST .../compound_query` | `POST /custom-dashboards/compound-query`. `formula-series-align` fica como está: é conta no cliente. |

Rotas da origem que nenhum export usa: `query_csv` (`POST /custom-dashboards/query-csv`), `toggle_favorite` (`PATCH .../toggle-favorite`), `toggle_public` (**não veio**: ver abaixo).

### O que muda para a tela

- **Sem as conversões de nome da origem.** `camelizePreserving` e `decamelizePreserving` caem: `query`, `visualConfig`, `layout` e `globalFilters` são guardados como a tela manda, em camelCase, e voltam iguais.
- **Sem `is_public` nem `public_token`.** Na origem o token era gerado e nada o lia: nem rota, nem tela. Virou ruído, e não veio.
- **Templates (`dashboard-templates.ts`, `widget-templates.ts`):** `appointments` agora é `agenda_bookings`. `agent_executions` não existe. `webhook_logs` é `hook_logs`, e `webhook_name` é `hook_name`. Em `collaborator_id`, `collaborator_name` e `assigned_user_id`, os nomes são `professional_id`, `professional_name` e `assigned_account_id`. `conversation_tag_name` é `chat_tag_name`, e `appointment_attendance` é `booking_attendance`. `first_response_time` e `messages_count`, que os templates citam, não existiam como campo nem na origem.
- **`messages` não tem mais `usage_*`:** `ai_assistant` grava os tokens na mensagem, mas esta fonte não os expõe.
- **`daily_stats` mudou os campos:** `conversations_started` é `chats_started`, `active_conversations` é `active_chats`, `messages_sent_by_ai` é `messages_sent_by_automation`. Saíram tokens e créditos.
- **Data nas linhas é número:** milissegundos, e não ISO-8601, em todas as fontes. A série de `daily_stats` alinha com a das outras por dia, no mesmo fuso.
- **Permissão por card:** `403` numa consulta é "você não tem acesso a esta fonte", e não falha do dashboard.
- **Editor de filtros (`query-filters-editor.tsx`):** em campo sem `filterType`, ele oferece todos os operadores. `contains` em número, data e sim/não agora dá `operatorNotAllowed`: filtre a lista pelo `type` de `data-sources`.
- **`GET /dashboard` nunca é `{}`:** olhe `hasData`. Na origem a tela testava `hours_economized !== undefined`.
- **Nomes do quadro:** `stepIndex` é `stageId`, `stepName` é `stageName`, `conversations` é `chats`, `nextStepper` é `stageId`, `assignedUserName` é `assignedAccountName`, `conversationTags` é `chatTags`, `assignDepartmentId` é `teamId`. Datas em milissegundos, e `hasMore` vem pronto.
