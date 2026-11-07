# Contrato da API: domínio "outreach"

Campanhas: disparo em massa com lotes, limite por canal, retomada e monitoramento em tempo real, mais a importação de contatos (base, CSV, Google Sheets) e a busca de estabelecimentos pelo Apify.

**De onde vêm os exemplos.** São respostas reais, preenchidas a partir da captura, nunca escritas à mão.

- REST e canais: servidor de desenvolvimento (Puma, Sidekiq e Redis) com a semente, e um cliente WebSocket de verdade falando `actioncable-v1-json`. A Evolution e o Apify eram um servidor falso em socket local, porque não há instância real aqui. Os nomes com `E2E` são dessa rodada, e `localhost:3109` é a porta dela.
- Google Sheets, erros do Apify, modelo da WABA e mídia: sem credencial (e sem o `Attachment`, que é do domínio inbox), saíram de uma request spec com o outro lado simulado por WebMock. A resposta é a do código de verdade, mas nenhuma foi conferida contra o serviço real. Esses exemplos estão marcados com **(WebMock)**.

Em desenvolvimento normal, a API fica em `http://localhost:3040`.

## Regras gerais

- **Autenticação:** `Authorization: Bearer <token>`. Sem sessão válida, `401 unauthorized`.
- **A organização vem da sessão.** Id de outra organização responde `404 notFound`, nunca `403`.
- **Entrada:** corpo JSON solto, sem envelope, em camelCase, como o `useCampaignMutations` da origem mandava. `templateParams` passa com as chaves intactas.
- **Saída:** chaves em camelCase, datas em milissegundos desde a época, ids como string.
- **Listagens:** `{ "<recurso>": [...], "meta": { "page", "perPage", "total", "totalPages", "hasMore" } }`, com `?page=` e `?perPage=` (25 por padrão, 100 no máximo).
- **Idioma:** `message`, `errorMessage` e `details` saem no idioma da requisição (`?locale=` ou `Accept-Language`). `code` é o contrato de máquina.

### Permissão

Tudo aqui exige `campaigns`, inclusive os dois canais de tempo real. O grupo padrão "Usuário" não tem; "Gerente", sim.

`features.campaigns_enabled`, que na origem escondia o menu, não é conferido pela API. Em toda organização nova ele está vazio e não há rota para ligá-lo, então quem decide é a permissão.

### Erros

Sempre `{ "error": { "code", "message", "field"?, "details"? } }`.

| Status | `code` | Quando |
|---|---|---|
| 401 | `unauthorized` | Sem sessão, ou sessão vencida. |
| 403 | `forbidden` | Sem a permissão `campaigns`. |
| 404 | `notFound` | Não existe, ou é de outra organização. |
| 422 | `unprocessable` | Validação. `field` é o primeiro campo inválido e `details` traz todos. |
| 422 | `invalidScheduledAt` | `scheduledAt` ilegível. `field: "scheduledAt"`. |
| 422 | `mediaNotFound` | O anexo não existe nesta organização. `field: "attachmentId"`. |
| 422 | `campaignNotEditable`, `campaignNotDeletable` | `PATCH` e `DELETE` só em rascunho. |
| 422 | `campaignNotLaunchable` | Só rascunho ou agendada. Também é a resposta do segundo clique em "Lançar". |
| 422 | `campaignNotRunning`, `campaignNotPaused`, `campaignNotCancellable` | Pausar só em andamento; retomar só pausada; cancelar só agendada, em andamento ou pausada. |
| 422 | `campaignNotImportable` | Só rascunho ou agendada aceitam contatos. |
| 422 | `noRecipients`, `connectorsRequired`, `messagesRequired`, `mediaRequired`, `wabaRequired`, `phoneNumbersRequired`, `templatesRequired` | Falta algo para lançar. Os que têm campo trazem `field`. |
| 422 | `connectorsDisconnected`, `wabaDisconnected`, `wabaNotFound` | Nenhum canal consegue enviar ao lançar. |
| 422 | `noActiveConnectors` | Nenhum canal consegue enviar ao retomar. A campanha continua pausada. |
| 422 | `contactsRequired`, `tooManyContacts` | Importação vazia, ou acima de 50 mil (`details.max`). |
| 422 | `googleSheetsNotConfigured`, `googleSheetParamsRequired`, `googleTokenExpired`, `googleForbidden`, `googleSheetNotFound`, `googleSheetFailed`, `googleSheetInvalid`, `googleSheetEmpty`, `googleSheetTooLarge` | Google Sheets. |
| 422 | `searchQueryRequired`, `apifyNotConfigured`, `apifyInvalidToken`, `tooManyExtractions` | Busca de estabelecimentos. |
| 429 | `tooManyRequests` | Mais de 10 por minuto, por organização, somando `import-google-sheet` e `apify-places-search`. |
| 402 | `apifyQuotaExceeded` | Acabaram os créditos do Apify. |
| 502 | `apifyFailed` | O Apify falhou. `message` traz o que ele disse, quando disse algo. |
| 504 | `googleSheetTimeout`, `apifyTimeout` | O outro lado demorou demais. |

Resposta `401`:

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Você precisa entrar para continuar."
  }
}
```

Resposta `403`:

```json
{
  "error": {
    "code": "forbidden",
    "message": "Você não tem permissão para isso."
  }
}
```

Resposta `404`:

```json
{
  "error": {
    "code": "notFound",
    "message": "Não encontrado."
  }
}
```

Resposta `422`, de validação:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Nome não pode ficar em branco",
    "field": "name",
    "details": {
      "name": [
        "não pode ficar em branco"
      ]
    }
  }
}
```

A mesma validação com `Accept-Language: en`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Messages need at least one message",
    "field": "messages",
    "details": {
      "messages": [
        "need at least one message"
      ]
    }
  }
}
```

Canal que não é desta organização:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Canais têm um canal que não existe nesta organização",
    "field": "connectorIds",
    "details": {
      "connectorIds": [
        "têm um canal que não existe nesta organização"
      ]
    }
  }
}
```

### Dos hooks da origem para cá

Todo hook de `aiva-frontend/src/api/{use-campaigns,use-apify-extractions}.ts` tem endpoint:

| Hook | Aqui |
|---|---|
| `useCampaigns` | `GET /campaigns` |
| `useCampaignDetail`, `fetchCampaignDetail` | `GET /campaigns/:id` |
| `useCampaignStats` | `GET /campaigns/:id/stats`, mais `CampaignChannel` no lugar do polling de 5 s |
| `useCampaignRecipients` | `GET /campaigns/:id/recipients` |
| `useCampaignIntegrations` | `GET /campaigns/available-connectors` |
| `useCampaignOrganizations` | `GET /campaigns/available-flows`: assistente não existe mais |
| `useCampaignTags` | `GET /campaigns/available-tags` |
| `useWabaPhoneNumbers` | `GET /connectors/:id/phone-numbers` (domínio connectors) |
| `useWabaTemplates` | `GET /connectors/:id/templates` (domínio connectors) |
| `createCampaign`, `updateCampaign`, `deleteCampaign` | `POST /campaigns`, `PATCH` e `DELETE /campaigns/:id` |
| `launchCampaign`, `pauseCampaign`, `resumeCampaign`, `cancelCampaign` | `POST /campaigns/:id/{launch,pause,resume,cancel}` |
| `importContacts` | `POST /campaigns/:id/import-contacts` |
| `importCsvContacts` | `POST /campaigns/:id/import-csv-contacts` |
| `importGoogleSheet` | `POST /campaigns/import-google-sheet`. O hook da origem apontava para uma rota que não existia, com o id da campanha; a tela chamava esta. |
| `searchApifyPlaces` | `POST /campaigns/apify-places-search` |
| `useApifyExtractions`, `useApifyExtractionDetail`, `useApifyExtractionResults` | `GET /place-extractions`, `/:id`, `/:id/results` |
| `useApifyContacts` | `GET /place-extractions/contacts` |
| `useApifyExtractionMutations` | `POST /place-extractions`, `DELETE /place-extractions/:id` |
| `useApifyExtractionChannel` | `PlaceExtractionChannel` |
| Novos | `GET /campaigns/summary` (os números do topo) e `GET /campaigns/capabilities` (o que depende de chave) |

O que mudou de nome em relação a `types/api/campaign.ts`:

| Origem | Aqui |
|---|---|
| `integrationIds`, `wabaIntegrationId` | `connectorIds`, `wabaConnectorId` |
| `dailyLimitPerIntegration` | `dailyLimitPerConnector` |
| `chatAttachmentId` (número) | `attachmentId` (texto) |
| `conversationTagIds`, `raiseConversations` | `chatTagIds`, `raiseChats` |
| `organizationId`, `organizationName` | `flowId`, sem o nome: ele vem de `available-flows` |
| `createdByUserId` | `createdByAccountId` |
| `pagination` | `meta` |
| Datas em ISO | Milissegundos |
| `integration_id` em `GET /campaigns` | `connectorId`, que agora também acha pela conta oficial |
| `apify_extractions`, `ApifyExtractionChannel` | `place-extractions`, `PlaceExtractionChannel` |
| `organizationIds` no filtro de contatos | Não existe mais |

---

## Campanha

| Campo | Observação |
|---|---|
| `status` | `draft`, `scheduled`, `running`, `paused`, `completed`, `cancelled`. |
| `pauseReason` | Quando quem pausou foi a plataforma: `noActiveConnectors` ou `channelFailing`. `null` quando foi uma pessoa. Ver [Quando a plataforma pausa](#quando-a-plataforma-pausa). |
| `campaignMode` | `text` (mensagem livre, por WhatsApp Web) ou `template` (modelo da WABA). |
| `messageType` | `text` ou `media`. Só vale no modo `text`. |
| `messages` | Só no detalhe. Com mais de uma, os destinatários de cada canal alternam entre elas. Variáveis: `{{nome}}`, `{{name}}`, `{{telefone}}`, `{{phone}}` e as de cada destinatário. O que não existir sai como está: **a tela precisa avisar antes de lançar.** |
| `attachmentId`, `mediaUrl`, `mediaContentType`, `mediaFileName` | Mídia. A API só lê `attachmentId`: o resto vem do anexo, e na hora do envio a URL é recalculada. |
| `connectorIds` | Canais do modo `text`. Só `whatsapp_web` e `whatsapp_cloud`, e da organização. **Ofereça só `whatsapp_web`**, como a origem: fora da janela de 24 horas a WABA só aceita modelo, e os destinatários falhariam um a um. |
| `wabaConnectorId`, `phoneNumberIds`, `templateIds`, `templateParams` | Modo `template`. `templateParams`: `{ "<id do modelo>": { "<posição>": "texto com {{variáveis}}" } }`. Sem valor, a posição 1 é o nome. |
| `flowId` | O fluxo que responde a quem receber a campanha. Opcional. |
| `chatTagIds` | Etiquetas postas em cada conversa alcançada. |
| `raiseChats` | `true` sobe a conversa na lista a cada envio (padrão). `false` a manda para o fim, como `send_text_message_without_event`. |
| `sendWindowStart`, `sendWindowEnd` | `"HH:MM"`, mas só a hora vale, como na origem. Fim menor ou igual ao início: janela de 24 horas. |
| `sendDays` | `0` (domingo) a `6`. Ao menos um. |
| `intervalMin`, `intervalMax` | Intervalo entre mensagens do mesmo canal, **em segundos**. O assistente da origem pedia em minutos e multiplicava. |
| `dailyLimitPerConnector` | Limite diário **por canal**, somando todas as campanhas. Ver [Como o disparo funciona](#como-o-disparo-funciona). |
| `batchSize` | Só no detalhe. De 1 a 200, 50 por padrão. A tela da origem não oferecia. |
| `totalContacts` | Já calculado: não custa uma consulta por linha da lista. |
| `sentCount`, `deliveredCount`, `readCount`, `failedCount` | Cumulativos: lido também conta como entregue e como enviado. **Uma falha depois de aceita conta em `sentCount` e em `failedCount`**, porque a Meta avisa depois. Na barra de progresso, use `(sentCount + failedCount) / totalContacts` limitado a 1. |
| `repliedCount` | Quantas pessoas responderam. Ver [Quem respondeu](#quem-respondeu). Acrescentado depois da captura dos exemplos, que por isso não o mostram. |
| `estimatedCompletionAt` | Previsão, recalculada ao lançar e ao retomar. |
| `activityEvents` | Só no detalhe, os 100 mais recentes. Ver abaixo. |

### Atividade

`action`: `created`, `scheduled`, `launched`, `paused`, `resumed`, `cancelled`, `completed`, `launch_failed` (a agendada voltou para rascunho), `channel_stopped` e `channel_resumed`. `accountId` é `null` quando foi a plataforma. `details` é a frase pronta, no idioma da requisição, ou `null`. `metadata` traz o mesmo dado cru.

### `GET /campaigns`

Da mais nova para a mais antiga, ou na ordem de `sort`. Parâmetros: `status` e `connectorId` (um valor ou vários, separados por vírgula: `?status=running,paused`), `q` (no nome), `sort`, `page` e `perPage`.

| `sort` | Ordem |
|---|---|
| `recent` | A mais nova primeiro. É a padrão, e também o que vale para um valor desconhecido. |
| `oldest` | A mais antiga primeiro. |
| `name` | Nome de A a Z, sem caixa nem acento atrapalharem. |
| `largest` | A maior lista primeiro. |
| `failures` | Mais falhas primeiro. |

Exemplo com a semente, resumido a uma campanha:

Resposta `200`:

```json
{
  "campaigns": [
    {
      "id": "6aee26e8bca7bee7965162ea",
      "name": "Pesquisa de satisfação",
      "status": "draft",
      "pauseReason": null,
      "messageType": "text",
      "campaignMode": "text",
      "attachmentId": null,
      "mediaUrl": null,
      "mediaContentType": null,
      "mediaFileName": null,
      "totalContacts": 24,
      "sentCount": 0,
      "deliveredCount": 0,
      "readCount": 0,
      "failedCount": 0,
      "connectorIds": [
        "6aee26e7bca7bee796516120"
      ],
      "wabaConnectorId": null,
      "phoneNumberIds": [],
      "templateIds": [],
      "templateParams": {},
      "flowId": null,
      "chatTagIds": [
        "6aee26e7bca7bee796516123",
        "6aee26e7bca7bee796516124"
      ],
      "raiseChats": true,
      "sendWindowStart": "09:00",
      "sendWindowEnd": "18:00",
      "sendDays": [
        1,
        2,
        3,
        4,
        5
      ],
      "intervalMin": 60,
      "intervalMax": 180,
      "dailyLimitPerConnector": 300,
      "timezone": "America/Sao_Paulo",
      "scheduledAt": null,
      "startedAt": null,
      "completedAt": null,
      "estimatedCompletionAt": null,
      "createdAt": 1793988824714,
      "updatedAt": 1793992424721
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 2,
    "total": 8,
    "totalPages": 4,
    "hasMore": true
  }
}
```

### `GET /campaigns/summary`

Os números do topo da lista, da organização inteira. A origem somava só a página aberta. `openRate` é `read / sent`, de 0 a 1. Traz também `replied`, acrescentado depois da captura.

Resposta `200`:

```json
{
  "summary": {
    "total": 8,
    "byStatus": {
      "draft": 1,
      "scheduled": 1,
      "running": 1,
      "paused": 2,
      "completed": 2,
      "cancelled": 1
    },
    "sent": 171,
    "delivered": 147,
    "read": 84,
    "failed": 7,
    "openRate": 0.4912
  }
}
```

### `POST /campaigns`

`POST /campaigns`:

```json
{
  "name": "E2E Recompra de novembro",
  "messageType": "text",
  "campaignMode": "text",
  "messages": [
    "Oi, {{nome}}! A coleção nova chegou.",
    "{{nome}}, separamos uma novidade para você."
  ],
  "connectorIds": [
    "6aee28312ca7f6a5e31e0cc8",
    "6aee28312ca7f6a5e31e0cc9"
  ],
  "chatTagIds": [],
  "raiseChats": true,
  "intervalMin": 1,
  "intervalMax": 2,
  "dailyLimitPerConnector": 500,
  "batchSize": 3,
  "sendWindowStart": "00:00",
  "sendWindowEnd": "00:00",
  "sendDays": [
    0,
    1,
    2,
    3,
    4,
    5,
    6
  ],
  "timezone": "America/Sao_Paulo"
}
```

Resposta `201`:

```json
{
  "campaign": {
    "id": "6aee28337ac3ab7108717dda",
    "name": "E2E Recompra de novembro",
    "status": "draft",
    "pauseReason": null,
    "messageType": "text",
    "campaignMode": "text",
    "attachmentId": null,
    "mediaUrl": null,
    "mediaContentType": null,
    "mediaFileName": null,
    "totalContacts": 0,
    "sentCount": 0,
    "deliveredCount": 0,
    "readCount": 0,
    "failedCount": 0,
    "connectorIds": [
      "6aee28312ca7f6a5e31e0cc8",
      "6aee28312ca7f6a5e31e0cc9"
    ],
    "wabaConnectorId": null,
    "phoneNumberIds": [],
    "templateIds": [],
    "templateParams": {},
    "flowId": null,
    "chatTagIds": [],
    "raiseChats": true,
    "sendWindowStart": "00:00",
    "sendWindowEnd": "00:00",
    "sendDays": [
      0,
      1,
      2,
      3,
      4,
      5,
      6
    ],
    "intervalMin": 1,
    "intervalMax": 2,
    "dailyLimitPerConnector": 500,
    "timezone": "America/Sao_Paulo",
    "scheduledAt": null,
    "startedAt": null,
    "completedAt": null,
    "estimatedCompletionAt": null,
    "createdAt": 1793992755236,
    "updatedAt": 1793992755236,
    "messages": [
      "Oi, {{nome}}! A coleção nova chegou.",
      "{{nome}}, separamos uma novidade para você."
    ],
    "batchSize": 3,
    "createdByAccountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
    "activityEvents": [
      {
        "id": "6aee28337ac3ab7108717ddb",
        "action": "created",
        "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
        "occurredAt": 1793992755238,
        "details": null,
        "metadata": {}
      }
    ]
  }
}
```

**Agendada:** `scheduledAt` em milissegundos, ou ISO. Sem fuso no texto, vale o `timezone` da campanha. No passado, a campanha nasce em rascunho, como na origem.

`POST /campaigns` (trecho da resposta `201`):

```json
{
  "campaign": {
    "id": "6aee28917ac3ab7108717e2e",
    "status": "scheduled",
    "scheduledAt": 1793992855852,
    "activityEvents": [
      {
        "id": "6aee28917ac3ab7108717e30",
        "action": "scheduled",
        "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
        "occurredAt": 1793992849880,
        "details": "Agendada para 06/11/2026 às 16:20.",
        "metadata": {
          "scheduledAt": 1793992855852,
          "timezone": "America/Sao_Paulo"
        }
      },
      {
        "id": "6aee28917ac3ab7108717e2f",
        "action": "created",
        "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
        "occurredAt": 1793992849874,
        "details": null,
        "metadata": {}
      }
    ]
  }
}
```

**Modelo da WABA (WebMock):**

`POST /campaigns`:

```json
{
  "name": "Aviso de entrega",
  "campaignMode": "template",
  "messages": [],
  "wabaConnectorId": "6aee291d7b84b504cac61eb8",
  "phoneNumberIds": [
    "111",
    "222"
  ],
  "templateIds": [
    "6aee291d7b84b504cac61eb9"
  ],
  "templateParams": {
    "6aee291d7b84b504cac61eb9": {
      "1": "{{nome}}",
      "2": "{{pedido}}"
    }
  },
  "sendWindowStart": "08:00",
  "sendWindowEnd": "20:00",
  "sendDays": [
    1,
    2,
    3,
    4,
    5
  ],
  "intervalMin": 30,
  "intervalMax": 60,
  "dailyLimitPerConnector": 1000,
  "timezone": "America/Sao_Paulo"
}
```

Resposta `201`, resumida:

```json
{
  "campaign": {
    "id": "6aee291d7b84b504cac61ebb",
    "status": "draft",
    "campaignMode": "template",
    "wabaConnectorId": "6aee291d7b84b504cac61eb8",
    "phoneNumberIds": [
      "111",
      "222"
    ],
    "templateIds": [
      "6aee291d7b84b504cac61eb9"
    ],
    "templateParams": {
      "6aee291d7b84b504cac61eb9": {
        "1": "{{nome}}",
        "2": "{{pedido}}"
      }
    }
  }
}
```

Um número que não é da conta:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Números têm um número que não é desta conta",
    "field": "phoneNumberIds",
    "details": {
      "phoneNumberIds": [
        "têm um número que não é desta conta"
      ]
    }
  }
}
```

**Mídia (WebMock).** `attachmentId` é o id em `/attachments`, do domínio inbox:

`POST /campaigns`:

```json
{
  "name": "Promoção com imagem",
  "messageType": "media",
  "messages": [
    "{{nome}}, olha a promoção"
  ],
  "attachmentId": "6aee0000000000000000abcd",
  "connectorIds": [
    "6aee291d7b84b504cac61ebd"
  ],
  "sendWindowStart": "09:00",
  "sendWindowEnd": "18:00",
  "sendDays": [
    1,
    2,
    3,
    4,
    5
  ],
  "intervalMin": 60,
  "intervalMax": 120,
  "timezone": "America/Sao_Paulo"
}
```

Resposta `201`, resumida:

```json
{
  "campaign": {
    "id": "6aee291d7b84b504cac61ebe",
    "messageType": "media",
    "attachmentId": "6aee0000000000000000abcd",
    "mediaUrl": "https://arquivos.vekoo.app/promo.png",
    "mediaContentType": "image/png",
    "mediaFileName": "Promoção de novembro"
  }
}
```

Sem o anexo:

```json
{
  "error": {
    "code": "mediaNotFound",
    "message": "Não encontramos a mídia escolhida.",
    "field": "attachmentId"
  }
}
```

### `GET /campaigns/:id`

Detalhe, com a atividade da mais nova para a mais antiga. Exemplo de uma campanha que foi até o fim, com pausa e retomada:

Resposta `200`:

```json
{
  "campaign": {
    "id": "6aee28337ac3ab7108717dda",
    "name": "E2E Recompra de novembro",
    "status": "completed",
    "pauseReason": null,
    "messageType": "text",
    "campaignMode": "text",
    "attachmentId": null,
    "mediaUrl": null,
    "mediaContentType": null,
    "mediaFileName": null,
    "totalContacts": 13,
    "sentCount": 13,
    "deliveredCount": 0,
    "readCount": 0,
    "failedCount": 0,
    "connectorIds": [
      "6aee28312ca7f6a5e31e0cc8",
      "6aee28312ca7f6a5e31e0cc9"
    ],
    "wabaConnectorId": null,
    "phoneNumberIds": [],
    "templateIds": [],
    "templateParams": {},
    "flowId": null,
    "chatTagIds": [],
    "raiseChats": true,
    "sendWindowStart": "00:00",
    "sendWindowEnd": "00:00",
    "sendDays": [
      0,
      1,
      2,
      3,
      4,
      5,
      6
    ],
    "intervalMin": 1,
    "intervalMax": 2,
    "dailyLimitPerConnector": 500,
    "timezone": "America/Sao_Paulo",
    "scheduledAt": null,
    "startedAt": 1793992755407,
    "completedAt": 1793992777120,
    "estimatedCompletionAt": 1793992771836,
    "createdAt": 1793992755235,
    "updatedAt": 1793992777120,
    "messages": [
      "Oi, {{nome}}! A coleção nova chegou.",
      "{{nome}}, separamos uma novidade para você."
    ],
    "batchSize": 3,
    "createdByAccountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
    "activityEvents": [
      {
        "id": "6aee28494acd92e3925b488f",
        "action": "completed",
        "accountId": null,
        "occurredAt": 1793992777130,
        "details": null,
        "metadata": {}
      },
      {
        "id": "6aee283d7ac3ab7108717df4",
        "action": "resumed",
        "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
        "occurredAt": 1793992765856,
        "details": null,
        "metadata": {}
      },
      {
        "id": "6aee28367ac3ab7108717def",
        "action": "paused",
        "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
        "occurredAt": 1793992758251,
        "details": null,
        "metadata": {}
      },
      {
        "id": "6aee28337ac3ab7108717dee",
        "action": "launched",
        "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
        "occurredAt": 1793992755436,
        "details": null,
        "metadata": {}
      },
      {
        "id": "6aee28337ac3ab7108717ddb",
        "action": "created",
        "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
        "occurredAt": 1793992755238,
        "details": null,
        "metadata": {}
      }
    ]
  }
}
```

### `PATCH /campaigns/:id`

Só em rascunho. Mesmos campos da criação, menos `scheduledAt`: só muda o que vier.

`PATCH /campaigns/:id`:

```json
{
  "name": "E2E da base, revisada",
  "sendWindowStart": "10:00"
}
```

Resposta `200`, resumida:

```json
{
  "campaign": {
    "id": "6aee28a37ac3ab7108717e39",
    "name": "E2E da base, revisada",
    "status": "draft",
    "sendWindowStart": "10:00"
  }
}
```

### `DELETE /campaigns/:id`

Só em rascunho. Leva destinatários e atividade. Responde `204`, sem corpo.

### `POST /campaigns/:id/launch`

Sem corpo. Põe no ar e devolve a campanha, os avisos e a previsão. Canal desconectado fica de fora e vira aviso, em `warnings`: `{ code: "connectorsSkipped", connectorIds, message }`.

Resposta `200`, resumida:

```json
{
  "campaign": {
    "id": "6aee28337ac3ab7108717dda",
    "status": "running",
    "startedAt": 1793992755407,
    "estimatedCompletionAt": 1793992764418,
    "totalContacts": 13
  },
  "warnings": [],
  "estimatedCompletionAt": 1793992764418
}
```

Segundo clique:

```json
{
  "error": {
    "code": "campaignNotLaunchable",
    "message": "Só dá para lançar uma campanha em rascunho ou agendada."
  }
}
```

### `POST /campaigns/:id/pause`, `/resume`, `/cancel`

Sem corpo. Todos devolvem `{ "campaign": ... }`, com o detalhe.

- **Pausar:** o que estava agendado não sai. Um envio que já começou termina. A campanha pode receber status de entrega depois de pausada.
- **Retomar:** monta os lotes de novo com quem falta, pelos canais que estão de pé agora. Sem nenhum, `422 noActiveConnectors`.
- **Cancelar:** quem não saiu vira `skipped`. Também vale para a agendada, o que a origem não deixava. Peça confirmação.

Resposta `200` de `pause`, resumida:

```json
{
  "campaign": {
    "id": "6aee28337ac3ab7108717dda",
    "status": "paused",
    "pauseReason": null,
    "sentCount": 4,
    "totalContacts": 13
  }
}
```

Resposta `200` de `cancel`, resumida:

```json
{
  "campaign": {
    "id": "6aee28687ac3ab7108717e0d",
    "status": "cancelled",
    "completedAt": 1793992815958
  }
}
```

Retomar sem canal:

```json
{
  "error": {
    "code": "noActiveConnectors",
    "message": "Nenhum canal desta campanha está conectado. Reconecte um para retomar."
  }
}
```

### `GET /campaigns/:id/stats`

Os números do monitor. `deliveryRate` é `delivered / sent` e `openRate` é `read / delivered`, de 0 a 1. `replied` é quantas pessoas responderam, aqui e no evento `progress` (acrescentado depois da captura). `pending` conta quem falta, inclusive quem está em `sending`, e `skipped`, quem o cancelamento deixou de fora. Esses dois só saem aqui, não no evento `progress`.

Resposta `200`:

```json
{
  "stats": {
    "totalContacts": 13,
    "sent": 13,
    "delivered": 1,
    "read": 1,
    "failed": 0,
    "deliveryRate": 0.0769,
    "openRate": 1,
    "messagesPerHour": 1300,
    "estimatedCompletion": 1793992771836,
    "pending": 0,
    "skipped": 0
  }
}
```

### `GET /campaigns/:id/recipients`

Na ordem de entrada. Parâmetros: `status` (um ou vários, separados por vírgula, e `replied` para quem respondeu), `q` (nome ou telefone), `page` e `perPage`. Cada destinatário traz também `repliedAt`, acrescentado depois da captura.

| `status` | Significa |
|---|---|
| `pending` | Na fila. |
| `sending` | No meio do envio. **Não estava no tipo do front da origem.** |
| `sent`, `delivered`, `read` | Avançam com os webhooks do canal. |
| `failed` | Não recebeu, ou pode não ter recebido. Ver `errorCode`. |
| `skipped` | O cancelamento deixou de fora. **Não estava no tipo do front da origem.** |

`errorCode`: `whatsappError`, `numberNotFound`, `noPhoneNumber`, `mediaUnsupported`, `mediaUnavailable`, `templateUnavailable` e `interrupted`. `errorMessage` é o que o canal disse ou a frase do código, no idioma da requisição. `chatId` abre a conversa e é `null` antes do envio.

Resposta `200`:

```json
{
  "recipients": [
    {
      "id": "6aee28337ac3ab7108717ddc",
      "contactName": "Pessoa 0",
      "phoneNumber": "554190000001",
      "status": "sent",
      "chatId": "6aee28334acd92e3925b4876",
      "sentAt": 1793992756058,
      "deliveredAt": null,
      "readAt": null,
      "errorCode": null,
      "errorMessage": null
    },
    {
      "id": "6aee28337ac3ab7108717ddd",
      "contactName": "Pessoa 1",
      "phoneNumber": "554190000002",
      "status": "sent",
      "chatId": "6aee28334acd92e3925b4875",
      "sentAt": 1793992756059,
      "deliveredAt": null,
      "readAt": null,
      "errorCode": null,
      "errorMessage": null
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 2,
    "total": 13,
    "totalPages": 7,
    "hasMore": true
  }
}
```

Número que não existe no WhatsApp:

```json
{
  "recipients": [
    {
      "id": "6aee284a7ac3ab7108717df7",
      "contactName": "Fantasma",
      "phoneNumber": "5541900000000",
      "status": "failed",
      "chatId": null,
      "sentAt": 1793992778181,
      "deliveredAt": null,
      "readAt": null,
      "errorCode": "numberNotFound",
      "errorMessage": "Este número não existe no WhatsApp."
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 25,
    "total": 1,
    "totalPages": 1,
    "hasMore": false
  }
}
```

Interrompido por uma queda no meio do envio. **Pode ter saído**, e por isso não foi reenviado:

```json
{
  "recipients": [
    {
      "id": "6aee287a7ac3ab7108717e28",
      "contactName": "Lento",
      "phoneNumber": "5541930009999",
      "status": "failed",
      "chatId": "6aee287e4acd92e3925b48c0",
      "sentAt": 1793992841619,
      "deliveredAt": null,
      "readAt": null,
      "errorCode": "interrupted",
      "errorMessage": "O envio foi interrompido e pode ter saído. Não tentamos de novo para não duplicar."
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 25,
    "total": 1,
    "totalPages": 1,
    "hasMore": false
  }
}
```

### Quem respondeu

Resposta é a primeira mensagem do contato depois do envio, em qualquer canal. **Não é um status:** quem respondeu continua `sent`, `delivered` ou `read`, por isso o filtro é `?status=replied` e o dado é `repliedAt`. Quem recebeu duas campanhas responde à última. Quem falhou não conta.

Ao responder, o monitor recebe `recipient` e `progress`, como em qualquer outra mudança. Quem escreve é `Outreach::RecipientReply`, chamado por `Chats::InboundFlow`, com o ponteiro `Chat#outreach_recipient_id`, gravado ao despachar: conversa sem campanha não paga consulta nenhuma, e as mensagens seguintes do mesmo contato também não.

### O que o assistente de criação oferece

#### `GET /campaigns/capabilities`

O que depende de chave. **Sem as chaves, o resto das campanhas funciona**: a tela esconde a opção. `apiKey` e `appId` são do Google Picker, públicos por natureza. A chave do Apify nunca sai daqui.

Com tudo configurado (WebMock):

```json
{
  "capabilities": {
    "placeExtractions": {
      "available": true
    },
    "googleSheets": {
      "available": true,
      "clientId": "cliente.apps.googleusercontent.com",
      "apiKey": "AIzaChaveDoNavegador",
      "appId": "123456789012"
    }
  }
}
```

Sem nada:

```json
{
  "capabilities": {
    "placeExtractions": {
      "available": false
    },
    "googleSheets": {
      "available": false,
      "clientId": null,
      "apiKey": null,
      "appId": null
    }
  }
}
```

#### `GET /campaigns/available-connectors`

Os canais que disparam, em todos os estados, no mesmo formato de `GET /connectors`: filtre por `active`, e por `type` conforme o modo. Resumido a um canal:

Resposta `200`:

```json
{
  "connectors": [
    {
      "id": "6aee28312ca7f6a5e31e0cc8",
      "type": "whatsapp_web",
      "name": "Canal Simulado 1",
      "status": "active",
      "active": true,
      "errorMessage": null,
      "sendCollaboratorName": false,
      "createdAt": 1793992753504,
      "providerApi": "evolution_api",
      "profileName": "Canal Simulado 1",
      "profilePictureUrl": null,
      "numberId": "5541300000001",
      "numberFormatted": "(41) 30000-0001",
      "reactionsSupported": true,
      "deleteForEveryoneSupported": false
    }
  ]
}
```

#### `GET /campaigns/available-tags`

Resumido a duas etiquetas:

```json
{
  "tags": [
    {
      "id": "6aee26e7bca7bee796516123",
      "name": "cliente-novo",
      "description": "Primeiro contato",
      "color": "#7c3aed",
      "createdAt": 1793992423067
    },
    {
      "id": "6aee26e7bca7bee79651612a",
      "name": "ganho",
      "description": "Ganho",
      "color": "#2ecc71",
      "createdAt": 1793992423130
    }
  ]
}
```

#### `GET /campaigns/available-flows`

Quem pode responder a quem receber a campanha. **Vazio até o domínio automation chegar.** Forma quando vier: `{ "flows": [{ "id", "name" }] }`.

```json
{
  "flows": []
}
```

---

## Importações

**A ordem do assistente:** criar, importar e só então lançar. Agendada também aceita contatos, porque o agendamento já está valendo quando a importação chega. Em andamento, não:

```json
{
  "error": {
    "code": "campaignNotImportable",
    "message": "Só dá para adicionar contatos a uma campanha em rascunho ou agendada."
  }
}
```

Regras das duas:

- A mesma pessoa não entra duas vezes: **as duas formas do 9º dígito (`5531971810932` e `553171810932`) contam como uma só**, inclusive entre importações simultâneas.
- Só dígitos ficam guardados. **O número precisa vir com o DDI:** nada adivinha o país. A origem tinha "incluir código do país" na tela (`withBrazilCountryCode`).
- Até 50 mil por requisição. O assistente da origem mandava de 200 em 200.

### `POST /campaigns/:id/import-csv-contacts`

É por aqui que entram CSV, Google Sheets e Apify, depois de a tela mapear as colunas. `contactMetadata` vira as variáveis do destinatário, e os dados do estabelecimento (`placeId`, `categoryName`, `address`...) vão para os dados da conversa. Até 16 KB por pessoa: acima disso, as variáveis são descartadas e a pessoa entra.

`POST /campaigns/:id/import-csv-contacts` (resumido):

```json
{
  "contacts": [
    {
      "userName": "Pessoa 0",
      "externalId": "554190000001"
    },
    {
      "userName": "Pessoa 1",
      "externalId": "554190000002"
    },
    {
      "userName": "Duplicada",
      "externalId": "5541990000001"
    },
    {
      "userName": "Ninguém",
      "externalId": "   "
    },
    {
      "userName": "Padaria",
      "externalId": "554133330001",
      "contactMetadata": {
        "placeId": "fake-1",
        "categoryName": "Padaria",
        "city": "Curitiba"
      }
    }
  ]
}
```

Resposta `200`. `skippedCount` são os repetidos e `invalidCount`, os sem telefone:

```json
{
  "importedCount": 13,
  "skippedCount": 1,
  "invalidCount": 1,
  "totalRecipients": 13
}
```

### `POST /campaigns/:id/import-contacts`

Da base de contatos. `contactIds` são ids de conversa. Ou `selectAll: true` com `filters`: `q`, `tagIds`, `connectorIds`, `status` (`open` ou `closed`) e `automationEnabled`. Quem não tem telefone (Instagram, Messenger, widget, grupo) fica de fora.

`POST /campaigns/:id/import-contacts`:

```json
{
  "selectAll": true,
  "filters": {
    "status": "open"
  }
}
```

Resposta `200`:

```json
{
  "importedCount": 51,
  "skippedCount": 74,
  "invalidCount": 0,
  "totalRecipients": 51
}
```

### `POST /campaigns/import-google-sheet`

Baixa a aba como CSV e devolve para a tela mapear: não grava nada. `accessToken` é o da pessoa, do login do Google no navegador, e não fica guardado. As chaves de `data` são os nomes das colunas, como estão na planilha.

Exemplos (WebMock). `POST /campaigns/import-google-sheet`:

```json
{
  "fileId": "1AbC_dEf",
  "sheetGid": 0,
  "accessToken": "token-do-google"
}
```

Resposta `200`:

```json
{
  "headers": [
    "Nome",
    "Telefone",
    "Cidade"
  ],
  "data": [
    {
      "Nome": "Ana Moura",
      "Telefone": "5541999990001",
      "Cidade": "Curitiba"
    },
    {
      "Nome": "Bruno Lima",
      "Telefone": "5541999990002",
      "Cidade": "Londrina"
    }
  ],
  "rowCount": 2
}
```

Token vencido, `422`:

```json
{
  "error": {
    "code": "googleTokenExpired",
    "message": "O acesso ao Google expirou. Entre de novo."
  }
}
```

Sem linhas, `422`:

```json
{
  "error": {
    "code": "googleSheetEmpty",
    "message": "Esta aba está vazia."
  }
}
```

Id fora do formato, `422`:

```json
{
  "error": {
    "code": "googleSheetParamsRequired",
    "message": "Informe a planilha, a aba e o acesso do Google.",
    "field": "fileId"
  }
}
```

O Google demorou, `504`:

```json
{
  "error": {
    "code": "googleSheetTimeout",
    "message": "O Google demorou demais para entregar a planilha."
  }
}
```

Sem a configuração, `422`:

```json
{
  "error": {
    "code": "googleSheetsNotConfigured",
    "message": "A importação do Google Sheets não está configurada."
  }
}
```

### `POST /campaigns/apify-places-search`

**Síncrona: a resposta espera a busca, por até 2 minutos.** Está aqui porque o hook existe, mas nenhuma tela da origem a usava: **use `/place-extractions`.** Aceita os mesmos parâmetros da criação de uma extração.

`POST /campaigns/apify-places-search`:

```json
{
  "searchQuery": "E2E padaria",
  "maxPlaces": 5
}
```

Resposta `200`:

```json
{
  "results": [
    {
      "title": "Padaria do Teste",
      "phone": "(41) 3333-0001",
      "phoneUnformatted": "554133330001",
      "address": "Rua XV, 1 - Centro, Curitiba",
      "street": "",
      "city": "Curitiba",
      "state": "PR",
      "postalCode": "",
      "countryCode": "",
      "neighborhood": "",
      "website": "",
      "categoryName": "Padaria",
      "categories": [
        "Padaria"
      ],
      "totalScore": 4.7,
      "reviewsCount": 120,
      "imageUrl": "",
      "url": "https://maps.exemplo/1",
      "placeId": "fake-1",
      "latitude": -25.4,
      "longitude": -49.2,
      "instagram": "",
      "facebook": "",
      "openingHours": [
        {
          "day": "segunda",
          "hours": "7h às 19h"
        }
      ]
    },
    {
      "title": "Confeitaria do Teste",
      "phone": "(41) 3333-0002",
      "phoneUnformatted": "554133330002",
      "address": "Rua XV, 2 - Centro, Curitiba",
      "street": "",
      "city": "Curitiba",
      "state": "PR",
      "postalCode": "",
      "countryCode": "",
      "neighborhood": "",
      "website": "",
      "categoryName": "Confeitaria",
      "categories": [
        "Confeitaria"
      ],
      "totalScore": 4.2,
      "reviewsCount": 44,
      "imageUrl": "",
      "url": "https://maps.exemplo/2",
      "placeId": "fake-2",
      "latitude": -25.5,
      "longitude": -49.3,
      "instagram": "",
      "facebook": "",
      "openingHours": []
    }
  ],
  "totalCount": 2
}
```

Sem a busca, `422`:

```json
{
  "error": {
    "code": "searchQueryRequired",
    "message": "Diga o que você está procurando.",
    "field": "searchQuery"
  }
}
```

Sem créditos, `402` (WebMock):

```json
{
  "error": {
    "code": "apifyQuotaExceeded",
    "message": "Os créditos do Apify acabaram."
  }
}
```

O Apify falhou, `502`, com o que ele disse (WebMock):

```json
{
  "error": {
    "code": "apifyFailed",
    "message": "Ator fora do ar"
  }
}
```

Mais de 10 por minuto, `429` (WebMock):

```json
{
  "error": {
    "code": "tooManyRequests",
    "message": "Tentativas demais. Espere alguns minutos e tente de novo."
  }
}
```

---

## Busca de estabelecimentos: `/place-extractions`

A busca roda em um job, e o resultado chega por `PlaceExtractionChannel`. `status`: `pending`, `running`, `completed` e `failed`. Só duas buscas rodam ao mesmo tempo na plataforma, então `pending` pode demorar. Uma organização tem no máximo 5 em andamento.

### `POST /place-extractions`

Parâmetros: `searchQuery`, `location`, `maxPlaces` (até 200, 100 por padrão), `language`, `reviewsSort`, `minScore`, `categoryFilter` e `skipClosedPlaces`.

`POST /place-extractions`:

```json
{
  "searchQuery": "E2E padaria",
  "location": "Curitiba, PR",
  "maxPlaces": 10,
  "minScore": 4
}
```

Resposta `201`:

```json
{
  "extraction": {
    "id": "6aee28a17ac3ab7108717e38",
    "status": "pending",
    "searchQuery": "E2E padaria",
    "location": "Curitiba, PR",
    "resultsCount": 0,
    "errorCode": null,
    "errorMessage": null,
    "durationSeconds": null,
    "completedAt": null,
    "maxPlaces": 10,
    "language": "pt-BR",
    "filters": {
      "minScore": 4
    },
    "startedAt": null,
    "createdAt": 1793992865241,
    "createdBy": {
      "id": "b56a981d-00e7-5f4f-a618-de6c0a991000",
      "name": "Marina Duarte"
    }
  }
}
```

Sem a chave do Apify, `422` (WebMock):

```json
{
  "error": {
    "code": "apifyNotConfigured",
    "message": "A busca de estabelecimentos não está configurada."
  }
}
```

### `GET /place-extractions`

Da mais nova para a mais antiga, sem os resultados. Parâmetros: `status`, `search`, `page` e `perPage`.

Resposta `200`:

```json
{
  "extractions": [
    {
      "id": "6aee26e9bca7bee79651635a",
      "status": "failed",
      "searchQuery": "clínica de estética",
      "location": "Belo Horizonte, MG",
      "resultsCount": 0,
      "errorCode": "apifyQuotaExceeded",
      "errorMessage": "Os créditos do Apify acabaram.",
      "durationSeconds": 8,
      "completedAt": 1793819633001,
      "maxPlaces": 100,
      "language": "pt-BR",
      "filters": {},
      "startedAt": 1793819625001,
      "createdAt": 1793992425002,
      "createdBy": {
        "id": "b56a981d-00e7-5f4f-a618-de6c0a991000",
        "name": "Marina Duarte"
      }
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 1,
    "total": 3,
    "totalPages": 3,
    "hasMore": true
  }
}
```

### `GET /place-extractions/:id`

Resposta `200`:

```json
{
  "extraction": {
    "id": "6aee28a17ac3ab7108717e38",
    "status": "completed",
    "searchQuery": "E2E padaria",
    "location": "Curitiba, PR",
    "resultsCount": 2,
    "errorCode": null,
    "errorMessage": null,
    "durationSeconds": 1,
    "completedAt": 1793992866302,
    "maxPlaces": 10,
    "language": "pt-BR",
    "filters": {
      "minScore": 4
    },
    "startedAt": 1793992865258,
    "createdAt": 1793992865241,
    "createdBy": {
      "id": "b56a981d-00e7-5f4f-a618-de6c0a991000",
      "name": "Marina Duarte"
    }
  }
}
```

Falhou: `errorCode` é `apifyNotConfigured`, `apifyInvalidToken`, `apifyQuotaExceeded`, `apifyTimeout`, `apifyFailed` ou `interrupted` (o worker caiu no meio), e `errorMessage` é o que mostrar.

### `GET /place-extractions/:id/results`

Só quem tem telefone: sem ele, não há como disparar. Resumido a um lugar:

Resposta `200`:

```json
{
  "id": "6aee28a17ac3ab7108717e38",
  "status": "completed",
  "results": [
    {
      "title": "Padaria do Teste",
      "phone": "(41) 3333-0001",
      "phoneUnformatted": "554133330001",
      "address": "Rua XV, 1 - Centro, Curitiba",
      "street": "",
      "city": "Curitiba",
      "state": "PR",
      "postalCode": "",
      "countryCode": "",
      "neighborhood": "",
      "website": "",
      "categoryName": "Padaria",
      "categories": [
        "Padaria"
      ],
      "totalScore": 4.7,
      "reviewsCount": 120,
      "imageUrl": "",
      "url": "https://maps.exemplo/1",
      "placeId": "fake-1",
      "latitude": -25.4,
      "longitude": -49.2,
      "instagram": "",
      "facebook": "",
      "openingHours": [
        {
          "day": "segunda",
          "hours": "7h às 19h"
        }
      ]
    }
  ],
  "resultsCount": 2
}
```

### `GET /place-extractions/contacts`

Os lugares de todas as buscas concluídas, numa lista só, dizendo de onde cada um veio. Parâmetros: `search` (nome, endereço, telefone ou categoria), `page` e `perPage`. Um mesmo lugar encontrado em duas buscas aparece duas vezes, como na origem.

Resposta `200`:

```json
{
  "contacts": [
    {
      "title": "Padaria Pão Quente",
      "phone": "(41) 3322-1040",
      "phoneUnformatted": "554133221040",
      "address": "Rua XV de Novembro, 870 - Centro, Curitiba - PR",
      "street": "Rua XV de Novembro, 870",
      "city": "Curitiba",
      "state": "PR",
      "postalCode": "80655-490",
      "countryCode": "BR",
      "neighborhood": "Centro",
      "website": "https://padaria-pao-quente.exemplo.com.br",
      "categoryName": "Padaria",
      "categories": [
        "Padaria",
        "Lanchonete"
      ],
      "totalScore": 4.7,
      "reviewsCount": 312,
      "imageUrl": "https://picsum.photos/seed/padaria-pao-quente/400/300",
      "url": "https://www.google.com/maps/search/padaria-pao-quente",
      "placeId": "seed-padaria-pao-quente",
      "latitude": -25.4316,
      "longitude": -49.2449,
      "instagram": "https://instagram.com/padariapaoquente",
      "facebook": "",
      "openingHours": [
        {
          "day": "segunda-feira",
          "hours": "07:00 às 19:00"
        },
        {
          "day": "sábado",
          "hours": "07:00 às 13:00"
        }
      ],
      "extractionId": "6aee26e8bca7bee796516359",
      "extractionQuery": "padaria artesanal",
      "extractionLocation": "Batel, Curitiba",
      "extractedAt": 1793906024994
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 1,
    "total": 13,
    "totalPages": 13,
    "hasMore": true
  }
}
```

### `DELETE /place-extractions/:id`

Responde `204`, sem corpo.

---

## Tempo real

`ws://<api>/cable?token=<token da sessão>`, subprotocolo `actioncable-v1-json`. No front: `useChannel("CampaignChannel", params, handler)`. **Evento perdido não volta:** ao reconectar, releia `GET /campaigns/:id/stats`.

Os dois canais são só de leitura: as ações são da API. Sem a permissão `campaigns`, ou com a campanha de outra organização, a assinatura é recusada.

### `CampaignChannel`

| Params | O que recebe |
|---|---|
| `{ "campaignId" }` | O monitor de uma campanha: `progress`, `status`, `recipient` e `activity`. |
| Nenhum | A lista da organização: só `progress` e `status`, de todas as campanhas. Filtre por `campaignId`. |

**`progress`**, a cada envio e a cada status de entrega. `stats` é o formato de `GET /stats`, sem `pending` e `skipped`:

```json
{
  "event": "progress",
  "campaignId": "6aee28337ac3ab7108717dda",
  "status": "running",
  "stats": {
    "totalContacts": 13,
    "sent": 2,
    "delivered": 0,
    "read": 0,
    "failed": 0,
    "deliveryRate": 0,
    "openRate": 0,
    "messagesPerHour": 200,
    "estimatedCompletion": 1793992764418
  }
}
```

**`recipient`**, quando um destinatário muda. **Funda por `id`.** Saiu:

```json
{
  "event": "recipient",
  "campaignId": "6aee28337ac3ab7108717dda",
  "recipient": {
    "id": "6aee28337ac3ab7108717ddc",
    "contactName": "Pessoa 0",
    "phoneNumber": "554190000001",
    "status": "sent",
    "chatId": "6aee28334acd92e3925b4876",
    "sentAt": 1793992756058,
    "deliveredAt": null,
    "readAt": null,
    "errorCode": null,
    "errorMessage": null
  }
}
```

E depois, quando o webhook do canal disse que foi entregue:

```json
{
  "event": "recipient",
  "campaignId": "6aee28337ac3ab7108717dda",
  "recipient": {
    "id": "6aee28337ac3ab7108717ddc",
    "contactName": "Pessoa 0",
    "phoneNumber": "554190000001",
    "status": "delivered",
    "chatId": "6aee28334acd92e3925b4876",
    "sentAt": 1793992756058,
    "deliveredAt": 1793992777347,
    "readAt": null,
    "errorCode": null,
    "errorMessage": null
  }
}
```

**`status`**, quando a campanha muda de estado. `campaign` é o formato da lista:

```json
{
  "event": "status",
  "campaignId": "6aee28337ac3ab7108717dda",
  "campaign": {
    "id": "6aee28337ac3ab7108717dda",
    "name": "E2E Recompra de novembro",
    "status": "paused",
    "pauseReason": null,
    "sentCount": 4,
    "totalContacts": 13,
    "updatedAt": 1793992758245
  }
}
```

**`activity`**, uma linha nova na linha do tempo:

```json
{
  "event": "activity",
  "campaignId": "6aee28337ac3ab7108717dda",
  "activity": {
    "id": "6aee283d7ac3ab7108717df4",
    "action": "resumed",
    "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
    "occurredAt": 1793992765856,
    "details": null,
    "metadata": {}
  }
}
```

### Quando a plataforma pausa

Se nenhum canal consegue enviar, a campanha pausa sozinha e **ninguém é gasto**: quem faltava continua `pending`. Quem criou recebe um aviso em `/notifications`. A tela mostra o motivo e oferece "Retomar".

| `pauseReason` | O que houve |
|---|---|
| `noActiveConnectors` | O canal desconectou ou foi excluído. |
| `channelFailing` | O canal diz que está conectado, mas 5 envios seguidos não funcionaram: o provedor pode ter caído. |

Sem canal conectado, `status` chega assim, resumido:

```json
{
  "event": "status",
  "campaignId": "6aee28707ac3ab7108717e16",
  "campaign": {
    "id": "6aee28707ac3ab7108717e16",
    "status": "paused",
    "pauseReason": "noActiveConnectors",
    "sentCount": 3,
    "totalContacts": 8
  }
}
```

E com o provedor fora do ar:

```json
{
  "event": "status",
  "campaignId": "6aee284e7ac3ab7108717e00",
  "campaign": {
    "id": "6aee284e7ac3ab7108717e00",
    "status": "paused",
    "pauseReason": "channelFailing",
    "sentCount": 0,
    "totalContacts": 7
  }
}
```

Na linha do tempo, com a frase pronta:

```json
{
  "activityEvents": [
    {
      "id": "6aee285f4acd92e3925b4897",
      "action": "paused",
      "accountId": null,
      "occurredAt": 1793992799041,
      "details": "Pausada pela plataforma: um canal falhou várias vezes seguidas.",
      "metadata": {
        "reason": "channelFailing"
      }
    },
    {
      "id": "6aee285f4acd92e3925b4896",
      "action": "channel_stopped",
      "accountId": null,
      "occurredAt": 1793992799022,
      "details": "Um canal falhou várias vezes seguidas e parou de enviar. Os contatos que faltam continuam na fila.",
      "metadata": {
        "connectorId": "6aee28312ca7f6a5e31e0cc8",
        "reason": "channelFailing"
      }
    }
  ]
}
```

Com outro canal de pé, a campanha segue por ele e a linha do tempo registra `channel_stopped`. Um canal que **desconectou** e voltou retoma sozinho em até 10 minutos, com `channel_resumed`. Um canal que estava **falhando** só volta quando uma pessoa pausa e retoma: é ela quem sabe se o problema passou.

### `PlaceExtractionChannel`

Sem params: as buscas da organização. Filtre pelo `id` que recebeu em `POST /place-extractions`. `action`: `status_update` (começou, ou falhou) e `extraction_completed`.

```json
{
  "action": "status_update",
  "data": {
    "id": "6aee28a17ac3ab7108717e38",
    "status": "running",
    "searchQuery": "E2E padaria",
    "location": "Curitiba, PR",
    "resultsCount": 0,
    "errorCode": null,
    "errorMessage": null,
    "durationSeconds": 0,
    "completedAt": null
  }
}
```

```json
{
  "action": "extraction_completed",
  "data": {
    "id": "6aee28a17ac3ab7108717e38",
    "status": "completed",
    "searchQuery": "E2E padaria",
    "location": "Curitiba, PR",
    "resultsCount": 2,
    "errorCode": null,
    "errorMessage": null,
    "durationSeconds": 1,
    "completedAt": 1793992866303
  }
}
```

**Mudança em relação à origem:** os resultados não vêm no evento. Eram centenas de lugares indo para todo mundo da organização que estivesse na tela. Ao receber `extraction_completed`, busque `GET /place-extractions/:id/results`.

---

## Como o disparo funciona

Para quem for mexer, ou precisar explicar um número na tela.

- **Lotes por canal.** Canal é o conector, ou cada número da WABA. Os destinatários são repartidos entre os canais, e cada canal anda um lote por vez. Cada canal tem **um único job na fila**, e cada execução manda no máximo uma mensagem e agenda a próxima. Campanha de 50 mil contatos em dois canais, medida: importou em 3276 ms, lançou em 534 ms, e a sorted set `schedule` do Redis ficou com 3 jobs (uma sobra do teste de limite diário e um por canal). A origem criava um job por destinatário, que é o que a regra 7 do `CLAUDE.md` de lá alerta que infla a `schedule`.
- **Nada dorme segurando thread.** As 5 threads do Sidekiq são as mesmas do caminho das mensagens.
- **Intervalo.** Sorteado entre `intervalMin` e `intervalMax`, por canal. Duas campanhas no mesmo canal somam o ritmo: quem protege o número nesse caso é o limite diário.
- **Janela.** Conferida a cada envio, não só ao lançar. Um worker que volta às 3h da manhã espera a janela abrir.
- **Limite diário.** A conta é do canal, por todas as campanhas, no fuso de Brasília, e sobrevive a pausar e retomar. Atingido, o canal espera o dia seguinte. Quem não chegou a ser despachado (número que não existe) não gasta o limite.
- **Cancelamento por token.** Pausar, retomar e cancelar trocam `run_token`, e o que estava agendado morre ao executar. Nada é tirado da fila.

### Ninguém recebe duas vezes

Tudo a favor do "no máximo uma vez":

1. Duas execuções do mesmo lote: só uma toma a vez (`Batch#take_turn!`).
2. O mesmo destinatário: a tomada é atômica (`Batch#claim_next_recipient`).
3. **`dispatched_at` é gravado antes de falar com o canal**, depois de conferir de novo o token da campanha. É a linha entre "nada saiu" e "pode ter saído".
4. Dentro do envio de campanha, **o provedor não repete o POST** (`Providers::Base.send_once`): um timeout de leitura não diz se a mensagem saiu. Fora daqui, ele continua repetindo como sempre.
5. A recuperação (`Outreach::RecoveryJob`, de 10 em 10 minutos) olha quem ficou em `sending` há mais de 15 minutos:

| O que encontra | O que faz |
|---|---|
| Sem `dispatched_at` | Comprovadamente não saiu: volta para a fila. |
| Com `dispatched_at` e a mensagem com id do provedor no histórico | Saiu: fica `sent`. |
| Com `dispatched_at` e a mensagem `failed` | Fica `failed`, com o motivo. |
| Com `dispatched_at` e mais nada | **Na dúvida, não reenvia:** fica `failed`, com `errorCode: "interrupted"`. |

A mesma recuperação retoma encadeamentos parados (lote 15 minutos atrasado), religa canais que voltaram, lança agendadas que ficaram para trás e encerra extrações paradas. Depois de uma queda, a campanha pode levar até 25 minutos para voltar a andar. Pausar e retomar faz voltar na hora.

O preço do "no máximo uma vez": quem cair no meio de um envio, ou tiver o envio recusado por um erro passageiro, fica `failed` e não é tentado de novo. Duplicar uma mensagem de campanha é pior do que perder uma.

---

## Semente

`db/seeds/outreach.rb`, na organização de `marina.duarte@exemplo.com.br`, com a Doma Store. É idempotente, sem credencial, sem rede e sem job nenhum.

- **8 campanhas:** uma em cada estado, inclusive uma pausada pela plataforma e uma pela WABA, com **385 destinatários** e os números batendo com eles.
- **3 buscas:** duas concluídas e uma que falhou.
- A campanha "em andamento" tem o lote marcado para daqui a um mês, para a recuperação não mexer nela: ela não anda. Pausar e cancelar funcionam, e retomar responde `noActiveConnectors`, porque os canais da semente estão desconectados.
- Sem mídia: depende do `Attachment` do domínio inbox.

---

## Para outros domínios

- **automation:** `Flows::InboundDispatcher` precisa ler `chat.outreach_flow_id` para saber qual fluxo atende quem respondeu a uma campanha. É um id guardado sem validação, porque `Flow` ainda não existia: **confira a organização** e trate o que não existir como "sem fluxo". E preencher `Outreach::AvailableFlows.for(organization)`, mantendo a forma `{ id:, name: }`.
- **inbox:** a mídia depende de `Attachment`, por `Media::AttachmentLookup`, usando `file_url`, `name` e `file.blob` (`content_type`, `filename`). Até lá, `POST /campaigns` com mídia responde `mediaNotFound`. `import-contacts` recebe ids de conversa: se `/contacts` devolver outro id, é preciso ajustar.
- **connectors:** há duas alterações pontuais em arquivos de lá. `Inbound::EvolutionEvents#messages_update_event` chama `Outreach::RecipientStatus` nas mensagens de campanha: na origem, o destinatário só era atualizado quando a mensagem não era encontrada, então entregue e lido quase nunca chegavam a ele. E `Providers::Base.with_retry` respeita `send_once`. `Inbound::ZapiEvents` não trata status de entrega: quem envia pela Z-API fica em `sent`.

## Para o deploy

- **Índices antes de receber tráfego:** `bin/rails db:mongoid:create_indexes`. O índice único `{ campaign_id, phone_key }` é o que garante que a mesma pessoa não entra duas vezes em importações simultâneas.
- **Fila `campaigns`** no Sidekiq, já em `config/sidekiq.yml`, e o job recorrente em `config/schedule/outreach.yml`.

| Variável | Para quê |
|---|---|
| `APIFY_API_TOKEN` | Busca de estabelecimentos. Sem ela, `placeExtractions.available` é `false`. Só no servidor. |
| `APIFY_API_BASE` | Opcional, para apontar para outro servidor. Padrão: `https://api.apify.com/v2`. |
| `GOOGLE_SHEETS_CLIENT_ID` | Login do Google na tela. Sem ela, `googleSheets.available` é `false`. Exige o escopo `drive.file` e a origem liberada no console do Google. |
| `GOOGLE_SHEETS_API_KEY`, `GOOGLE_SHEETS_APP_ID` | Google Picker, na tela. |

---

## Limitações conhecidas

- **Nenhum serviço externo real foi exercitado:** nem Evolution, nem Apify, nem Google, nem Meta.
- **Mídia:** nunca rodou de ponta a ponta com um `Attachment` de verdade, só com o anexo simulado em spec.
- **Modelo da WABA:** coberto por spec com a Meta simulada, não pela rodada com Puma e Sidekiq.
- **Dois disparos no mesmo canal somam o ritmo.** O limite diário é compartilhado; o intervalo, não.
- **Variável que não existe sai como está** na mensagem. A validação é da tela, que conhece as colunas importadas.
- **Status que chega antes de o envio gravar o id** se perde para o destinatário, e o evento seguinte corrige (lido conta entregue). A mensagem do histórico segue as regras do domínio connectors.
- `q` na lista de destinatários e `search` nos contatos encontrados varrem os documentos da campanha ou da organização, sem índice de texto.
