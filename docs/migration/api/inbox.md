# Contrato da API: domínio "inbox"

Tudo que a tela do chat e a de contatos precisam por REST, sobre o núcleo do domínio connectors: lista de conversas, histórico de mensagens, contatos unificados, etiquetas, visões salvas, mensagens rápidas, anexos, campos personalizados, contatos (filtros, lote e exportação), importação, resposta sugerida e copiloto.

O envio de mensagem, o tempo real da conversa (`ChatChannel`, `ChatListChannel`) e os formatos `ChatSerializer` e `ChatMessageSerializer` estão em [connectors.md](connectors.md). Agendamentos da conversa são do domínio be-agenda.

**De onde vêm os exemplos.** São respostas reais, preenchidas a partir da captura, nunca escritas à mão: servidor de desenvolvimento (Puma, Sidekiq, Redis, Postgres e Mongo) com a semente, um cliente HTTP e um cliente WebSocket de verdade falando `actioncable-v1-json`. A Evolution era um servidor falso em socket local, porque não há instância real aqui. O modelo de linguagem foi o de verdade. Foram encurtadas só as URLs de arquivo (`<assinatura>`) e o token de download (`<token assinado>`). Para não repetir o mesmo objeto, as listas longas foram cortadas, e os trechos mostram parte dos campos.

`127.0.0.1:3106` nos exemplos é a porta do ambiente da captura. Em desenvolvimento normal, a API fica em `http://localhost:3040`. O que não foi exercitado está em [O que não foi exercitado](#o-que-não-foi-exercitado).

## Regras gerais

- **Autenticação:** `Authorization: Bearer <token>`. Sem sessão válida, `401 unauthorized`. A única rota daqui sem sessão é `GET /contacts/download-export`, que é autorizada pelo token do link.
- **A organização vem da sessão.** Não há id de organização na URL. Id de outra organização, ou de conversa que a pessoa não pode ver, responde `404 notFound`, nunca `403`.
- **Entrada, em camelCase.** Cadastros usam envelope com o nome do recurso: `{ "quickReply": { ... } }`, `{ "chatView": { ... } }`, `{ "chatTag": { ... } }`, `{ "customField": { ... } }`, e `{ "chat": { ... } }` no `PATCH /chats/:id`. Ações vão soltas: `POST /chats`, os lotes de `/contacts/*`, `POST /contact-imports`, `.../normalize`, `.../reaction`. Arquivo vai em multipart, solto.
- **Saída:** chaves em camelCase, datas em milissegundos desde a época, ids como string. Conversa, mensagem, etiqueta, canal e campo personalizado têm id do Mongo (24 hexadecimais); conta, departamento, mensagem rápida, visão, anexo e importação, UUID.
- **Listagens:** `{ "<recurso>": [...], "meta": { "page", "perPage", "total", "totalPages", "hasMore" } }`, com `?page=` e `?perPage=` (de 1 a 100). O padrão é 25; 20 em `/attachments`; 100 nos cadastros curtos, `/chat-tags`, `/chat-views`, `/quick-replies` e `/custom-fields`. **`/chats` e `/unified-contacts` não trazem `total` nem `totalPages`:** a lista recarrega a todo evento, e contar a cada página custaria um índice inteiro da organização. Só `hasMore`.
- **Campos personalizados são texto.** `customAttributes` sempre chega com valores string, inclusive número e booleano (`"500"`, `"true"`). Mapas de sistema, quando houver, ficam como estão.
- **Mídia:** `mediaUrl`, `audioUrl` e `file.url` são um caminho relativo (`/rails/active_storage/...`), que a tela prefixa com a URL da API, ou uma URL absoluta (mídia que veio de fora). Trate os dois casos. O mesmo vale para `downloadUrl`, da exportação.
- **Idioma:** `message` sai no idioma da requisição (`?locale=` ou `Accept-Language`). `code` é o contrato de máquina.

### Permissões

| Chave | O que libera |
|---|---|
| `chat` | `/chats`, mensagens, `/unified-contacts`, `/chat-views`, aplicar e cadastrar etiquetas, `CopilotChannel`. |
| `chat_list_to` | Quais conversas a pessoa enxerga. Ver [Visibilidade](#visibilidade-chat_list_to). |
| `contacts` | `/contacts`, `ContactsExportChannel`. |
| `core_settings` | Criar, alterar e apagar mensagens rápidas; alterar e apagar anexos; criar, alterar e apagar campos, `values` e `normalize`. |

Sem a permissão principal, ainda abre:

| Rota | Quem pode |
|---|---|
| `GET /chats/lookup` | `chat`, `contacts`, `pipelines` ou `calendar`. É só para escolher uma conversa em outra tela. |
| `GET /chat-tags`, `GET /chat-tags/:id` | Qualquer sessão: campanhas, fluxos e pipelines filtram por etiqueta. |
| `GET /chat-tags/:id/assigns` | `chat` ou `contacts`. |
| `POST /chat-tags` | `chat` ou `campaigns`. |
| `GET /custom-fields`, `GET /custom-fields/:id` | Qualquer sessão. |
| `POST /custom-fields/:id/options` | `chat` ou `core_settings`: o chat acrescenta opção na hora. |
| `GET /quick-replies`, `GET /quick-replies/:id` | `chat` ou `core_settings`. |
| `GET` e `POST /attachments` | `chat`, `core_settings`, `flows` ou `campaigns`. |
| `/contact-imports` | `contacts` ou `core_settings`. |

### Visibilidade: `chat_list_to`

Vale para **tudo que alcança conversa**: lista, conversa aberta por id, mensagens, escrita, contatos unificados, `/contacts`, lote, exportação, `/chats/lookup`, etiqueta em conversa, resposta sugerida e copiloto. Conversa fora disso responde `404` (ou fica de fora do lote e da lista). `GET /chats/access` diz qual é o nível, para a tela montar os filtros.

| Nível | O que enxerga |
|---|---|
| `all` | Tudo da organização. |
| `team` | As conversas dos departamentos da pessoa e as sem departamento. |
| `assigned` | As atribuídas a ela e as sem dono **e** sem departamento. |

A atribuição não aceita pessoa em `setupOnly` (quem configura, mas não atende): ela não aparece em `/chats/people`, e atribuir responde `422 invalidAssignee`. Quem já estava atribuído antes de virar `setupOnly` continua podendo ficar na conversa.

### Erros

Sempre `{ "error": { "code", "message", "field"?, "details"? } }`. `code` é o contrato; `message` é o que mostrar quando a tela não conhece o código.

| Status | `code` | Quando |
|---|---|---|
| 400 | `parameterMissing` | Falta o envelope: `{ "chatTag": ... }`. |
| 400 | `exportTokenMissing` | `GET /contacts/download-export` sem `token`. `field: "token"`. |
| 401 | `unauthorized` | Sem sessão, ou sessão vencida. |
| 403 | `forbidden` | Sem a permissão da rota. |
| 403 | `exportTokenInvalid` | Token de download adulterado, ou a pessoa perdeu acesso a contatos. |
| 404 | `notFound` | Não existe, é de outra organização, ou a pessoa não pode ver. |
| 404 | `exportNotFound` | O arquivo da exportação já foi removido. |
| 409 | `busy` | Já há uma geração de IA rodando nesta organização. Tente de novo em instantes. |
| 410 | `exportExpired` | O link de download passou de 1 hora. |
| 422 | `unprocessable` | Validação, ou recusa do provedor ao reagir ou apagar. `field` é o primeiro campo inválido, `details` traz todos. |
| 422 | `invalidConnector`, `connectorTypeMismatch`, `invalidPhone` | `POST /chats` e importação: canal que não existe, que não começa conversa por número, ou número sem dígitos. |
| 422 | `invalidAssignee`, `invalidTeam` | Atribuir a quem não pode receber atendimento, ou a departamento de fora. |
| 422 | `invalidAttributes` | `customAttributes` que não é mapa, com mais de 200 chaves, ou chave com `.` ou `$`. |
| 422 | `invalidCursor` | `beforeId` que não é uma mensagem válida. |
| 422 | `tooManyMessages` | Mais de 100 mensagens em `bulk-delete`. |
| 422 | `fileRequired`, `fileTooLarge`, `audioConversionFailed`, `attachmentSendFailed` | Envio de áudio e de arquivo. `attachmentSendFailed` traz `details.files` e `details.sentMessageIds`. |
| 422 | `tagNameTaken` | Etiqueta com nome que já existe, mesmo escrito de outro jeito. |
| 422 | `invalidPayload` | Visão com `payload` que não é uma lista de condições, ou maior que 64 KB. |
| 422 | `notListField`, `invalidMapping`, `invalidTargetKey` | Campos: opção em campo que não é lista; mapeamento vazio ou com mais de 500 pares; destino fora de `[a-z0-9_]`. |
| 422 | `noChatsSelected`, `noTagsSelected`, `invalidTags`, `invalidStatus`, `tooManyRecipients` | Ações em lote. `tooManyRecipients`: mais de 5000 ids. |
| 422 | `exportTooLarge` | `GET /contacts/export` com mais de 5000 linhas: use `ContactsExportChannel`. |
| 422 | `noContactsProvided`, `noValidContacts`, `tooManyContacts`, `invalidCsv`, `malformedCsv` | Importação. `tooManyContacts`: mais de 1000 no mesmo lote. |
| 422 | `noCredits` | A organização não tem créditos para a resposta sugerida. |
| 503 | `suggestionFailed` | A IA falhou, ou não está configurada. Nenhum crédito é cobrado. |

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

---

## Conversas: `/chats`

### `GET /chats` e `POST /chats/search`

A lista de conversas, da mais recente para a mais antiga. `POST /chats/search` é a mesma lista, para quando os filtros não cabem na URL. Os parâmetros vão no corpo, com os mesmos nomes.

| Parâmetro | O que faz |
|---|---|
| `page`, `perPage` | Paginação. Só `hasMore`, sem total. |
| `q` | Nome, nome de exibição ou telefone. O telefone ignora a máscara: `(31) 97181-0932` acha `5531971810932`. |
| `status` | `open` ou `closed`. |
| `assignedUser` | `me`, `unassigned` ou o id da pessoa. |
| `connectorIds[]`, `tagIds[]` | Conversas destes canais, com qualquer uma destas etiquetas. |
| `cid` | Conversa aberta por link: entra no fim da página mesmo fora do filtro, se a pessoa puder vê-la. |
| `filters` | Condições avançadas. Ver [abaixo](#filtros-avançados). |

`GET /chats?perPage=2`

Resposta `200`:

```json
{
  "chats": [
    {
      "id": "6aee1d6dd559f5a3171fd28e",
      "connectorId": "6aee1d6dd559f5a3171fd277",
      "audienceId": "6aee1d6dd559f5a3171fd28f",
      "externalId": "visitante-joao-pedro",
      "phoneNumber": "visitante-joao-pedro",
      "userName": "João Pedro Almeida",
      "displayName": null,
      "abbreviatedName": "JA",
      "audienceType": "web",
      "audienceUserName": null,
      "profilePictureUrl": null,
      "status": "open",
      "automationEnabled": true,
      "automationResumeAt": null,
      "assignedAccountId": "cceefe71-0d50-4a24-95b5-d5bf63ec2f07",
      "teamId": "0c38b8ed-11f1-49d3-bd7a-dcf7fa67558a",
      "unreadMessages": 0,
      "senderPhoneNumberId": null,
      "sessionStartAt": 1793981220000,
      "activeSession": true,
      "lastMessageAt": 1793981880000,
      "lastMessageFrom": "2h",
      "lastMessageType": "text",
      "lastMessageBy": "assistant",
      "lastMessageContent": "Pronto, separada. Pode trazer a outra na loja até sexta ou pedir a coleta pelos Correios.",
      "notes": null,
      "tagIds": [
        "6aee1d6dd559f5a3171fd27d"
      ],
      "customAttributes": {
        "aceita_novidades": "true",
        "cidade": "Curitiba",
        "tamanho_preferido": "G",
        "ticket_medio": "180"
      },
      "funnelStages": {},
      "createdAt": 1793981220000,
      "updatedAt": 1793989997982
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 2,
    "hasMore": true
  }
}
```

Busca pelo telefone com máscara: `GET /chats?q=(31) 97181-0932` (trecho, só os campos de identificação).

Resposta `200`:

```json
{
  "chats": [
    {
      "id": "6aee1d6ed559f5a3171fd295",
      "userName": "Fernanda Lima",
      "externalId": "5531971810932",
      "phoneNumber": "5531971810932",
      "lastMessageType": "audio",
      "lastMessageContent": "-"
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 25,
    "hasMore": false
  }
}
```

`lastMessageContent` e `content` guardam `"-"` no áudio sem transcrição, e vazio na imagem sem legenda. Olhe o tipo (`lastMessageType`, `typeElement`) antes de mostrar o texto.

### Filtros avançados

Em `GET /chats`, `POST /chats/search` e `GET /unified-contacts`. Na URL, como lista em forma de mapa; no corpo do `POST`, como lista normal.

```
filters[0][attributeKey]=custom_attributes.ticket_medio
filters[0][filterOperator]=is_greater_than
filters[0][values][]=500
filters[0][valueType]=number
filters[0][queryOperator]=and
```

Cada condição: `attributeKey`, `filterOperator`, `values` (lista), `queryOperator` (`and` ou `or`, em relação à condição anterior) e `valueType`, que só importa nos campos personalizados: **eles são texto no Mongo**, e só comparam como número com `valueType: "number"`.

| `attributeKey` | Tipo |
|---|---|
| `created_at`, `last_message_at` | Data, no fuso da organização |
| `tagIds` (ou `chat_tag_ids`), `connector_id`, `audience_id` | Id |
| `unread_messages`, `sender_phone_number_id` | Número |
| `automation_enabled` | Booleano |
| `status`, `audience_type`, `last_message_by`, `last_message_type`, `assigned_account_id`, `team_id`, `external_id`, `user_name`, `display_name`, `notes`, `contact_origin`, `origin_entry_point` | Texto |
| `custom_attributes.<chave>` | O que `valueType` disser |

Operadores: `equal_to`, `not_equal_to`, `contains`, `not_contains`, `text_contains`, `is_set`, `is_empty`, `is_less_than`, `is_greater_than`. `is_set` e `is_empty` não levam `values`.

Condição inválida (campo fora da lista, operador desconhecido, data que não é data) é **ignorada**, sem derrubar as outras e sem erro. Na origem o campo era texto livre: dava para filtrar por qualquer coisa do documento.

Quem gasta mais de R$ 500 (trecho):

Resposta `200`:

```json
{
  "chats": [
    {
      "id": "6aee1d6ed559f5a3171fd29c",
      "userName": "Carlos Eduardo Santos",
      "customAttributes": {
        "canal_de_origem": "Google",
        "cidade": "São Paulo",
        "ticket_medio": "950"
      }
    },
    {
      "id": "6aee1d6ed559f5a3171fd2b2",
      "userName": "Roberto Nascimento",
      "customAttributes": {
        "canal_de_origem": "Site",
        "cidade": "Salvador",
        "ticket_medio": "1200"
      }
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 25,
    "hasMore": false
  }
}
```

Pelo corpo:

`POST /chats/search`:

```json
{
  "perPage": 3,
  "filters": [
    {
      "attributeKey": "unread_messages",
      "filterOperator": "is_greater_than",
      "values": [
        "0"
      ],
      "queryOperator": "and"
    },
    {
      "attributeKey": "status",
      "filterOperator": "equal_to",
      "values": [
        "open"
      ],
      "queryOperator": "and"
    }
  ]
}
```

### `GET /chats/:id`

A conversa, a lista de campos personalizados que a tela mostra e o provedor do canal. `connectorProvider`: `evolution_api`, `aiva_api` ou `zapi` no WhatsApp Web, e o tipo do canal nos outros (`whatsapp_cloud`, `instagram_direct`...). **É `zapi`, e não `z_api` como na origem:** `canDeleteMessage.js` e `BulkDeleteDialog.tsx` comparam com o valor antigo. Para decidir o que oferecer, prefira `deleteForEveryoneSupported` e `reactionsSupported`, em `GET /chats/self-filter`.

Resposta `200`:

```json
{
  "chat": {
    "id": "6aee1d6ed559f5a3171fd295",
    "connectorId": "6aee1d6dd559f5a3171fd278",
    "audienceId": "6aee1d6ed559f5a3171fd296",
    "externalId": "5531971810932",
    "phoneNumber": "5531971810932",
    "userName": "Fernanda Lima",
    "displayName": null,
    "abbreviatedName": "FL",
    "audienceType": "whatsapp_api",
    "audienceUserName": null,
    "profilePictureUrl": null,
    "status": "open",
    "automationEnabled": true,
    "automationResumeAt": null,
    "assignedAccountId": null,
    "teamId": "8ed55d87-6d0c-4d21-86cc-aad7f84af66e",
    "unreadMessages": 0,
    "senderPhoneNumberId": null,
    "sessionStartAt": 1793894820000,
    "activeSession": false,
    "lastMessageAt": 1793896020000,
    "lastMessageFrom": "1d",
    "lastMessageType": "audio",
    "lastMessageBy": "user",
    "lastMessageContent": "-",
    "notes": null,
    "tagIds": [
      "6aee1d6dd559f5a3171fd27e"
    ],
    "customAttributes": {
      "aniversario": "1989-03-14",
      "canal_de_origem": "Indicação",
      "cidade": "Belo Horizonte",
      "ticket_medio": "500"
    },
    "funnelStages": {},
    "createdAt": 1793894820000,
    "updatedAt": 1793990556739
  },
  "attributeList": [
    {
      "name": "Cidade",
      "key": "cidade",
      "description": "Onde o contato mora.",
      "valueType": "text",
      "optionValues": []
    },
    {
      "name": "Tamanho preferido",
      "key": "tamanho_preferido",
      "description": "O tamanho que costuma levar.",
      "valueType": "list",
      "optionValues": [
        "PP",
        "P",
        "M",
        "G",
        "GG"
      ]
    }
  ],
  "connectorProvider": "evolution_api"
}
```

### `POST /chats`

Começa uma conversa pelo número, só em canal de WhatsApp (`whatsapp_web`, `whatsapp_cloud`, `zapi`). Corpo: `connectorId`, `externalId`, `userName` e, no WhatsApp Cloud com vários números, `phoneNumberId`. `201` se criou. **Se a conversa já existe, sobe na lista e responde `200`:** a busca entende as formas de um número brasileiro, com ou sem o nono dígito.

`POST /chats`:

```json
{
  "connectorId": "6aee1d6dd559f5a3171fd278",
  "externalId": "+55 (41) 98888-7766",
  "userName": "Teresa Vidal"
}
```

Resposta `201`:

```json
{
  "chat": {
    "id": "6aee25245e6b67d74a2d025a",
    "connectorId": "6aee1d6dd559f5a3171fd278",
    "externalId": "5541988887766",
    "phoneNumber": "5541988887766",
    "userName": "Teresa Vidal",
    "status": "open",
    "lastMessageAt": 1793991972361,
    "createdAt": 1793991972361
  }
}
```

Canal que não começa conversa:

Resposta `422`:

```json
{
  "error": {
    "code": "connectorTypeMismatch",
    "message": "Esta ação não existe para este tipo de conector.",
    "field": "connectorId"
  }
}
```

### `PATCH /chats/:id`

Envelope `chat`, com `automationEnabled`, `assignedAccountId`, `teamId`, `notes`, `status`, `displayName`. Atribuir ou tirar a atribuição cria a nota no histórico, como nos canais de tempo real. Mudar `automationEnabled` à mão cancela o religamento agendado (`automationResumeAt` volta a `null`).

`PATCH /chats/:id`:

```json
{
  "chat": {
    "notes": "Prefere ser chamada de Tê",
    "displayName": "Tê",
    "assignedAccountId": "cceefe71-0d50-4a24-95b5-d5bf63ec2f07",
    "teamId": "0c38b8ed-11f1-49d3-bd7a-dcf7fa67558a"
  }
}
```

Resposta `200`:

```json
{
  "chat": {
    "id": "6aee25245e6b67d74a2d025a",
    "displayName": "Tê",
    "assignedAccountId": "cceefe71-0d50-4a24-95b5-d5bf63ec2f07",
    "teamId": "0c38b8ed-11f1-49d3-bd7a-dcf7fa67558a",
    "notes": "Prefere ser chamada de Tê",
    "status": "open"
  }
}
```

Atribuir a quem está em `setupOnly`:

Resposta `422`:

```json
{
  "error": {
    "code": "invalidAssignee",
    "message": "Essa pessoa não pode receber atendimentos nesta organização.",
    "field": "assignedAccountId"
  }
}
```

Situação inválida:

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "situação não está na lista",
    "field": "status",
    "details": {
      "status": [
        "não está na lista"
      ]
    }
  }
}
```

### `DELETE /chats/:id`

Apaga de verdade, com as mensagens e a mídia. `204`, sem corpo. A lista conectada recebe `remove`.

### `PUT /chats/:id/attributes`

Substitui o mapa inteiro de campos personalizados. Número e booleano viram texto. Campo com `autoNormalize` passa pela normalização ao gravar: abaixo, `"R$ 300 a R$ 500"` num campo de estratégia `avg` virou `"400"`.

`PUT /chats/:id/attributes`:

```json
{
  "customAttributes": {
    "cidade": "Curitiba",
    "ticket_medio": "R$ 300 a R$ 500",
    "idade": 42
  }
}
```

Resposta `200`:

```json
{
  "customAttributes": {
    "cidade": "Curitiba",
    "ticket_medio": "400",
    "idade": "42"
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "invalidAttributes",
    "message": "Os campos desta conversa não são válidos.",
    "field": "customAttributes"
  }
}
```

### `POST /chats/:id/read`

Zera as não lidas sem abrir o histórico. Responde `{ "chat": ... }`.

### `GET /chats/lookup?q=`

Para escolher uma conversa em outra tela (pipeline, agenda, campanha). Até 10, só o necessário. Respeita `chat_list_to`.

Resposta `200`:

```json
{
  "chats": [
    {
      "id": "6aee1d6ed559f5a3171fd295",
      "userName": "Fernanda Lima",
      "displayName": null,
      "externalId": "5531971810932",
      "profilePictureUrl": null
    }
  ]
}
```

### `GET /chats/self-filter`

Os canais de atendimento, para os filtros e o seletor do chat, no formato de `ConnectorSerializer` (ver [connectors.md](connectors.md)). `reactionsSupported` e `deleteForEveryoneSupported` dizem o que o canal permite. Calendário não entra, porque não conversa.

Resposta `200`:

```json
{
  "connectors": [
    {
      "id": "6aee1d6dd559f5a3171fd277",
      "type": "web_widget",
      "name": "Site da Doma Store",
      "status": "active",
      "active": true,
      "errorMessage": null,
      "sendCollaboratorName": false,
      "createdAt": 1793989997513,
      "botDisplayName": "Site da Doma Store",
      "botAvatarUrl": null,
      "primaryColor": "#5B93FF",
      "position": "bottom-right",
      "welcomeMessage": "Olá! Como podemos ajudar?",
      "allowedOrigins": [],
      "launcherIcon": "chat",
      "locale": "pt-BR"
    },
    {
      "id": "6aee1d6dd559f5a3171fd278",
      "type": "whatsapp_web",
      "name": "Doma Store",
      "status": "active",
      "active": true,
      "errorMessage": null,
      "sendCollaboratorName": false,
      "createdAt": 1793989997549,
      "providerApi": "evolution_api",
      "profileName": "Doma Store",
      "profilePictureUrl": null,
      "numberId": "5541930001234",
      "numberFormatted": "(41) 93000-1234",
      "reactionsSupported": true,
      "deleteForEveryoneSupported": false
    }
  ]
}
```

### `GET /chats/people`

Quem pode receber atendimento. Quem está em `setupOnly` não aparece.

Resposta `200`:

```json
{
  "people": [
    {
      "id": "cceefe71-0d50-4a24-95b5-d5bf63ec2f07",
      "name": "Camila Rocha",
      "email": "camila.rocha@exemplo.com.br",
      "avatarUrl": null,
      "teamIds": [
        "0c38b8ed-11f1-49d3-bd7a-dcf7fa67558a"
      ],
      "setupOnly": false
    },
    {
      "id": "e6b8133b-9eb3-4a02-8f2a-ab8f88428139",
      "name": "Juliana Ferreira",
      "email": "juliana.ferreira@exemplo.com.br",
      "avatarUrl": null,
      "teamIds": [
        "b3769181-7200-4af9-9970-d7e6bab2617a"
      ],
      "setupOnly": false
    }
  ]
}
```

### `GET /chats/teams`

Todos os departamentos. `visible` diz os que a pessoa enxerga pelo `chat_list_to`. Para uma pessoa com nível `team`:

Resposta `200`:

```json
{
  "teams": [
    {
      "id": "0c38b8ed-11f1-49d3-bd7a-dcf7fa67558a",
      "name": "Atendimento",
      "visible": true
    },
    {
      "id": "b3769181-7200-4af9-9970-d7e6bab2617a",
      "name": "Comercial",
      "visible": false
    },
    {
      "id": "8ed55d87-6d0c-4d21-86cc-aad7f84af66e",
      "name": "Pós-venda",
      "visible": false
    }
  ]
}
```

### `GET /chats/access`

O que `chat_list_to` libera. Conforme o nível:

Resposta `200`:

```json
{
  "access": "all"
}
```

Resposta `200`:

```json
{
  "access": "team",
  "teamIds": [
    "0c38b8ed-11f1-49d3-bd7a-dcf7fa67558a"
  ]
}
```

Resposta `200`:

```json
{
  "access": "assigned",
  "accountId": "7d9d53b9-5969-440f-b005-d12f29fd87ab"
}
```

### `POST /chats/:id/suggest-reply`

A resposta que a IA sugere, a partir das últimas 30 mensagens. **Não envia nada:** a pessoa decide. Custa 1 crédito, e devolve o saldo. Falhou (`503 suggestionFailed`): nada é cobrado.

Resposta `200`:

```json
{
  "messages": [
    "Não consegui ouvir o áudio aqui, pode repetir em texto? Mas se for pra confirmar, já separo uma pra você!"
  ],
  "credits": {
    "total": 200,
    "used": 60,
    "left": 140
  }
}
```

---

## Mensagens: `/chats/:chatId/messages`

### `GET`

O histórico, da mais antiga para a mais recente dentro da página. `limit` padrão 50, máximo 100. Para ir mais para trás, `beforeId` com o `oldestId` da página anterior. O cursor olha data e id juntos: mensagens criadas no mesmo instante não se perdem entre uma página e outra.

Na primeira página (sem `beforeId`, a menos que venha `initial=false`) a resposta traz também os metadados da conversa, e **zera as não lidas** se a pessoa é a dona ou a conversa está sem dono.

`GET /chats/:id/messages?limit=2`

Resposta `200`:

```json
{
  "messages": [
    {
      "id": "6aee1d6ed559f5a3171fd29a",
      "chatId": "6aee1d6ed559f5a3171fd295",
      "role": "assistant",
      "roleBaseType": null,
      "typeElement": "text",
      "content": "Essa mesma. Separo uma para você?",
      "caption": null,
      "mediaType": null,
      "mediaUrl": null,
      "audioUrl": null,
      "mediaProperties": null,
      "messageId": "seed-fernanda-lima-3",
      "messageOrigin": "frontend",
      "senderName": "Thiago Almeida",
      "accountId": "1d3c2e52-da9f-4ff0-8378-a5934d852c6f",
      "status": "read",
      "statusMessage": null,
      "replyToMessageId": "6aee1d6ed559f5a3171fd299",
      "reactions": [],
      "contextMessage": null,
      "externalAdReply": null,
      "hasSpan": false,
      "isSpan": false,
      "missingMessage": null,
      "campaignId": null,
      "deletedAt": null,
      "deletedScope": null,
      "createdAt": 1793895540000
    }
  ],
  "hasMore": true,
  "oldestId": "6aee1d6ed559f5a3171fd29a",
  "assignedAccountId": null,
  "automationEnabled": true,
  "tagIds": [
    "6aee1d6dd559f5a3171fd27e"
  ],
  "customAttributes": {
    "aniversario": "1989-03-14",
    "canal_de_origem": "Indicação",
    "cidade": "Belo Horizonte",
    "ticket_medio": "500"
  },
  "unreadMessages": 0,
  "attributeList": [
    {
      "name": "Cidade",
      "key": "cidade",
      "description": "Onde o contato mora.",
      "valueType": "text",
      "optionValues": []
    }
  ],
  "connectorProvider": "evolution_api"
}
```

Próxima página:

`GET /chats/:id/messages?limit=2&beforeId=6aee1d6ed559f5a3171fd29a`

Resposta `200`:

```json
{
  "messages": [
    {
      "id": "6aee1d6ed559f5a3171fd298",
      "role": "assistant",
      "typeElement": "text",
      "content": "Oi, Fernanda! Voltou sim, chegou lote novo do Maranhão esta semana.",
      "createdAt": 1793895120000
    }
  ],
  "hasMore": true,
  "oldestId": "6aee1d6ed559f5a3171fd298"
}
```

Cursor inválido:

Resposta `422`:

```json
{
  "error": {
    "code": "invalidCursor",
    "message": "Referência de paginação inválida.",
    "field": "beforeId"
  }
}
```

### `DELETE /:id`

Apaga para todos, onde o provedor deixa: hoje, só Z-API, em até 60 horas. A mensagem que a loja enviou é revogada no WhatsApp, e a que o contato enviou some só daqui. Responde `{ "id", "deletedAt" }`. A prévia da conversa na lista passa a mostrar a mensagem anterior, sem a conversa mudar de lugar. Nos outros canais:

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Este canal não permite apagar para todos.",
    "details": {
      "base": [
        "Este canal não permite apagar para todos."
      ]
    }
  }
}
```

### `POST /bulk-delete`

`messageIds` (até 100) e `scope`: `me` (padrão, some só daqui) ou `everyone`. **Sem provedor que revogue, `everyone` vira `me`: olhe `scopeApplied`.** É `POST`, e não `DELETE` com corpo como na origem, porque proxies e clientes podem descartar o corpo de um `DELETE`.

`POST /chats/:id/messages/bulk-delete`:

```json
{
  "messageIds": [
    "6aee25255e6b67d74a2d025f",
    "6aee25255e6b67d74a2d0260"
  ],
  "scope": "everyone"
}
```

Resposta `200`:

```json
{
  "scopeApplied": "me",
  "deletedIds": [
    "6aee25255e6b67d74a2d025f",
    "6aee25255e6b67d74a2d0260"
  ],
  "revokedIds": []
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Nenhuma mensagem informada.",
    "field": "messageIds"
  }
}
```

### `POST /:id/reaction`

`{ "emoji": "👍" }`. Emoji vazio remove. Só em canal que permite (`reactionsSupported`) e em mensagem com id do provedor.

Resposta `200`:

```json
{
  "message": {
    "id": "6aee1d6ed559f5a3171fd29b",
    "typeElement": "audio",
    "reactions": [
      {
        "emoji": "👍",
        "from": "assistant",
        "senderName": "Marina Duarte",
        "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
        "reactedAt": 1793991972803
      }
    ]
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "A reação deve ser um único emoji.",
    "details": {
      "base": [
        "A reação deve ser um único emoji."
      ]
    }
  }
}
```

### `POST /audio`

Multipart, com `audio` (até 16 MB). Converte para o formato que o WhatsApp aceita quando há `ffmpeg`, envia e pausa a automação da conversa. Trecho:

Resposta `201`:

```json
{
  "message": {
    "id": "6aee25245e6b67d74a2d025e",
    "typeElement": "audio",
    "content": "",
    "mediaType": null,
    "audioUrl": "/rails/active_storage/blobs/proxy/<assinatura>/audio.ogg",
    "messageId": "FAKE-2",
    "senderName": "Marina Duarte",
    "status": "delivery_ack",
    "createdAt": 1793991972939
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "audioConversionFailed",
    "message": "Não foi possível processar este áudio.",
    "field": "audio"
  }
}
```

### `POST /attachments`

Multipart, com `files[]` (ou `file`). Uma mensagem por arquivo, e pausa a automação. Se um arquivo falhar no meio, responde `422 attachmentSendFailed` com `details.files` (o que falhou e por quê) e `details.sentMessageIds` (o que já saiu). O arquivo fica como anexo privado da organização, fora da galeria de `/attachments`. Trecho:

Resposta `201`:

```json
{
  "messages": [
    {
      "id": "6aee25255e6b67d74a2d025f",
      "typeElement": "media",
      "mediaType": "document",
      "mediaUrl": "/rails/active_storage/blobs/proxy/<assinatura>/tabela.pdf",
      "mediaProperties": {
        "fileName": "tabela.pdf",
        "fileLength": 15
      },
      "messageId": "FAKE-3",
      "status": "delivery_ack"
    },
    {
      "id": "6aee25255e6b67d74a2d0260",
      "typeElement": "media",
      "mediaType": "image",
      "mediaUrl": "/rails/active_storage/blobs/proxy/<assinatura>/foto.png",
      "mediaProperties": {
        "fileName": "foto.png",
        "fileLength": 8
      },
      "messageId": "FAKE-4",
      "status": "delivery_ack"
    }
  ]
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "fileRequired",
    "message": "Envie um arquivo.",
    "field": "files"
  }
}
```

---

## Contatos unificados: `/unified-contacts`

Uma linha por contato (`externalId`), com uma aba por conversa, porque o mesmo contato pode falar por vários canais, e uma conta WABA com vários números tem uma conversa por número. Sem chave de liga e desliga: a origem escondia isto atrás de `unified_contacts_enabled`, e aqui é sempre ligado, ao lado da lista clássica em `/chats`.

Quem só vê parte das conversas de um contato vê só essas abas.

### `GET /unified-contacts`

`page`, `q`, `status`, `filters`. 25 por página, ordenado pela conversa mais recente. Com filtro, a linha aparece se **alguma** aba casa: a aba que casa vem primeiro com `matched: true`, e as outras continuam na lista com `matched: false`, para a tela mostrar em cinza. `matchCount` conta as que casam, e `meta.filtered` diz se há filtro ativo. `lastMessageType` é o mesmo de `/chats`: é ele que diz à prévia que a última mensagem é um áudio, porque áudio sem transcrição guarda só um traço em `lastMessageContent`.

`GET /unified-contacts?q=fernanda&filters%5B0%5D%5BattributeKey%5D=connector_id&filters%5B0%5D%5BfilterOperator%5D=equal_to&filters%5B0%5D%5Bvalues%5D%5B%5D=6aee1d6dd559f5a3171fd279&filters%5B0%5D%5BqueryOperator%5D=and`

Resposta `200`:

```json
{
  "contacts": [
    {
      "externalId": "5531971810932",
      "audienceId": "6aee1d6ed559f5a3171fd296",
      "name": "Fernanda Lima",
      "profilePictureUrl": null,
      "totalUnread": 0,
      "matchCount": 1,
      "lastMessageAt": 1793991973276,
      "lastMessageContent": null,
      "lastMessageBy": null,
      "lastMessageType": null,
      "chats": [
        {
          "chatId": "6aee25255e6b67d74a2d0261",
          "connectorId": "6aee1d6dd559f5a3171fd279",
          "unread": 0,
          "lastMessageAt": 1793991973276,
          "senderPhoneNumberId": "100000000001",
          "audienceType": "whatsapp_api",
          "status": "open",
          "matched": true
        },
        {
          "chatId": "6aee1d6ed559f5a3171fd295",
          "connectorId": "6aee1d6dd559f5a3171fd278",
          "unread": 0,
          "lastMessageAt": 1793896020000,
          "senderPhoneNumberId": null,
          "audienceType": "whatsapp_api",
          "status": "open",
          "matched": false
        }
      ]
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 25,
    "hasMore": false,
    "filtered": true
  }
}
```

### `GET /unified-contacts/:externalId/messages`

A linha do tempo "Todos", só de leitura: as mensagens de todas as conversas do contato que a pessoa pode ver, com `beforeId` e `limit`, como o histórico. Cada mensagem traz também `connectorId` e `senderPhoneNumberId`. Codifique o `externalId`, porque pode ter `@`. Contato que a pessoa não vê responde lista vazia.

Resposta `200`:

```json
{
  "messages": [
    {
      "id": "6aee1d6ed559f5a3171fd299",
      "chatId": "6aee1d6ed559f5a3171fd295",
      "connectorId": "6aee1d6dd559f5a3171fd278",
      "senderPhoneNumberId": null,
      "role": "user",
      "typeElement": "image",
      "content": "É essa aqui, da foto",
      "createdAt": 1793895300000
    }
  ],
  "hasMore": true,
  "oldestId": "6aee1d6ed559f5a3171fd299"
}
```

---

## Etiquetas: `/chat-tags`

`GET /chat-tags` lista em ordem de nome, 100 por página.

Resposta `200`:

```json
{
  "chatTags": [
    {
      "id": "6aee1d6ed559f5a3171fd317",
      "name": "aguardando-operador",
      "description": "A automação passou para uma pessoa",
      "color": "#f59e0b",
      "createdAt": 1793989998715
    },
    {
      "id": "6aee1d6ed559f5a3171fd318",
      "name": "atacado",
      "description": "Compra para revender",
      "color": "#4f46e5",
      "createdAt": 1793989998717
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 3,
    "total": 12,
    "totalPages": 4,
    "hasMore": true
  }
}
```

`POST` e `PATCH` com o envelope `chatTag`: `name` (vira slug: `Cliente Fiel` fica `cliente-fiel`), `color` (obrigatória), `description`.

`POST /chat-tags`:

```json
{
  "chatTag": {
    "name": "Cliente Fiel",
    "color": "#0891b2",
    "description": "Comprou mais de três vezes"
  }
}
```

Resposta `201`:

```json
{
  "chatTag": {
    "id": "6aee25255e6b67d74a2d0262",
    "name": "cliente-fiel",
    "description": "Comprou mais de três vezes",
    "color": "#0891b2",
    "createdAt": 1793991973434
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "tagNameTaken",
    "message": "Já existe uma etiqueta com esse nome.",
    "field": "name"
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "cor não pode ficar em branco",
    "field": "color",
    "details": {
      "color": [
        "não pode ficar em branco"
      ]
    }
  }
}
```

`DELETE /chat-tags/:id` apaga e tira de todas as conversas. `204`.

`GET /chat-tags/:id/assigns` conta as conversas com a etiqueta:

Resposta `200`:

```json
{
  "count": 1
}
```

### Aplicar e remover: `PUT` e `DELETE /chat-tags/:id/chats/:chatId`

Aplicar duas vezes é o mesmo que uma. A lista conectada recebe o `upsert` da conversa. Não cria nota no histórico, como na origem. Responde as etiquetas da conversa:

Resposta `200`:

```json
{
  "tagIds": [
    "6aee25255e6b67d74a2d0262"
  ]
}
```

Resposta `200`:

```json
{
  "tagIds": []
}
```

---

## Visões salvas: `/chat-views`

Um conjunto de filtros com nome. `personal: true` só a dona enxerga; a compartilhada, a organização inteira. `payload` é uma lista de condições no formato dos [filtros avançados](#filtros-avançados), guardada como veio. A lista traz as compartilhadas e as da pessoa.

Resposta `200`:

```json
{
  "chatViews": [
    {
      "id": "7eca6a81-b32b-49f2-8e32-073a36d968d3",
      "name": "Compra acima de R$ 500",
      "payload": [
        {
          "values": [
            "500"
          ],
          "valueType": "number",
          "attributeKey": "custom_attributes.ticket_medio",
          "queryOperator": "and",
          "filterOperator": "is_greater_than"
        }
      ],
      "personal": true,
      "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
      "createdAt": 1793989999125,
      "updatedAt": 1793989999125
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 2,
    "total": 5,
    "totalPages": 3,
    "hasMore": true
  }
}
```

`POST /chat-views`:

```json
{
  "chatView": {
    "name": "VIPs abertas",
    "personal": true,
    "payload": [
      {
        "attributeKey": "status",
        "filterOperator": "equal_to",
        "values": [
          "open"
        ],
        "queryOperator": "and"
      }
    ]
  }
}
```

Resposta `201`:

```json
{
  "chatView": {
    "id": "f1abc2d2-1547-4224-87a7-c7fafd32fdf3",
    "name": "VIPs abertas",
    "payload": [
      {
        "attributeKey": "status",
        "filterOperator": "equal_to",
        "values": [
          "open"
        ],
        "queryOperator": "and"
      }
    ],
    "personal": true,
    "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
    "createdAt": 1793991973649,
    "updatedAt": 1793991973649
  }
}
```

`GET`, `PATCH` e `DELETE /chat-views/:id` (`204`). A pessoal de outra pessoa responde `404`.

Resposta `422`:

```json
{
  "error": {
    "code": "invalidPayload",
    "message": "As condições desta visão não são válidas.",
    "field": "payload"
  }
}
```

---

## Mensagens rápidas: `/quick-replies`

Texto pronto que a pessoa chama no chat pelo atalho. `trigger` vira slug (`Frete Grátis` fica `frete-gratis`) e é único na organização. Para citar um anexo no texto, escreva `attachment_id_<id do anexo>`, como na origem: o envio troca a citação pelo arquivo.

Resposta `200`:

```json
{
  "quickReplies": [
    {
      "id": "8f0ae2b3-876a-4ec0-823e-5c5366a251a5",
      "name": "Agradecimento",
      "trigger": "obrigada",
      "content": "Obrigada pela compra! Qualquer coisa, é só chamar por aqui.",
      "createdAt": 1793989999086,
      "updatedAt": 1793989999086
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

`POST /quick-replies`:

```json
{
  "quickReply": {
    "name": "Frete grátis",
    "trigger": "Frete Grátis",
    "content": "Frete grátis para compras acima de R$ 300, em todo o Brasil."
  }
}
```

Resposta `201`:

```json
{
  "quickReply": {
    "id": "102eb144-9e09-4685-bdc1-d1b85349126c",
    "name": "Frete grátis",
    "trigger": "frete-gratis",
    "content": "Frete grátis para compras acima de R$ 300, em todo o Brasil.",
    "createdAt": 1793991973872,
    "updatedAt": 1793991973872
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "atalho já está em uso",
    "field": "trigger",
    "details": {
      "trigger": [
        "já está em uso"
      ]
    }
  }
}
```

`GET`, `PATCH` (ou `PUT`) e `DELETE /quick-replies/:id` (`204`).

---

## Anexos: `/attachments`

Biblioteca de arquivos da organização, que o composer do chat, as campanhas e os fluxos escolhem. Na origem pertencia a um assistente, e aqui é da organização. Até 100 MB por arquivo.

`GET /attachments`: `search` (em nome, descrição e nome do arquivo), `sortBy` (`name`, `created_at`, `updated_at`), `sortOrder` (`asc`, `desc`), `page`, `perPage` (padrão 20). Só a galeria: o que foi enviado pelo chat fica de fora.

`GET /attachments?perPage=2&sortBy=name&sortOrder=asc`

Resposta `200`:

```json
{
  "attachments": [
    {
      "id": "86a5b10d-78d9-4f2a-a802-c5943dc3d1e7",
      "name": "Guia de medidas",
      "description": "Medidas de cada tamanho, de PP a GG.",
      "private": false,
      "createdAt": 1793989998866,
      "updatedAt": 1793989998886,
      "file": {
        "id": "f042d51b-3cc1-4fe3-8171-5159edf95a6c",
        "filename": "guia-de-medidas.pdf",
        "contentType": "application/pdf",
        "byteSize": 254,
        "url": "/rails/active_storage/blobs/proxy/<assinatura>/guia-de-medidas.pdf"
      }
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 2,
    "total": 4,
    "totalPages": 2,
    "hasMore": true
  }
}
```

`POST /attachments`: multipart com `file`, `name`, `description`.

Resposta `201`:

```json
{
  "attachment": {
    "id": "2ff2eac1-1e9a-468b-86be-94410b70d1ed",
    "name": "Regulamento da promoção",
    "description": "Black Friday",
    "private": false,
    "createdAt": 1793991974084,
    "updatedAt": 1793991974091,
    "file": {
      "id": "739ce3c4-419b-457f-993e-cc080bebe348",
      "filename": "regulamento.pdf",
      "contentType": "application/pdf",
      "byteSize": 20,
      "url": "/rails/active_storage/blobs/proxy/<assinatura>/regulamento.pdf"
    }
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "arquivo não pode ficar em branco",
    "field": "file",
    "details": {
      "file": [
        "não pode ficar em branco"
      ]
    }
  }
}
```

`PATCH /attachments/:id` aceita JSON ou multipart; sem `file`, muda só nome e descrição. `DELETE /attachments/:id` responde `204`. `GET /attachments/:id` traz o mesmo objeto.

---

## Campos personalizados: `/custom-fields`

O que aparece como campo de um contato, gravado em `customAttributes[key]`, **sempre como texto**.

`key` nasce do nome (`Como conheceu` vira `como_conheceu`) e **não muda ao renomear**, porque é por ela que os valores estão gravados nas conversas. Dois nomes que dariam a mesma chave são recusados no campo `name`.

`valueType`: `text`, `number`, `list`, `checkbox`, `date`. `normalizationStrategy`: `min`, `avg`, `max`.

Resposta `200`:

```json
{
  "customFields": [
    {
      "id": "6aee1d6ed559f5a3171fd316",
      "name": "Canal de origem",
      "key": "canal_de_origem",
      "description": null,
      "valueType": "list",
      "defaultValue": null,
      "optionValues": [
        "Instagram",
        "Indicação",
        "Loja física",
        "Site",
        "Google"
      ],
      "autoNormalize": false,
      "normalizationStrategy": "min",
      "normalizationTargetKey": null,
      "createdAt": 1793989998692,
      "updatedAt": 1793989998692
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 2,
    "total": 6,
    "totalPages": 3,
    "hasMore": true
  }
}
```

`POST /custom-fields`:

```json
{
  "customField": {
    "name": "Como conheceu",
    "valueType": "list",
    "optionValues": [
      "Instagram",
      "Indicação"
    ],
    "description": "Para medir os canais."
  }
}
```

Resposta `201`:

```json
{
  "customField": {
    "id": "6aee25265e6b67d74a2d0265",
    "name": "Como conheceu",
    "key": "como_conheceu",
    "description": "Para medir os canais.",
    "valueType": "list",
    "defaultValue": null,
    "optionValues": [
      "Instagram",
      "Indicação"
    ],
    "autoNormalize": false,
    "normalizationStrategy": "min",
    "normalizationTargetKey": null,
    "createdAt": 1793991974424,
    "updatedAt": 1793991974424
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "nome já está em uso",
    "field": "name",
    "details": {
      "name": [
        "já está em uso"
      ]
    }
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "tipo não está na lista",
    "field": "valueType",
    "details": {
      "valueType": [
        "não está na lista"
      ]
    }
  }
}
```

`GET`, `PATCH` e `DELETE /custom-fields/:id` (`204`). Apagar o campo não tira o valor de `customAttributes` das conversas.

### `POST /custom-fields/:id/options`

Acrescenta uma opção a campo do tipo lista, sem precisar reescrever o campo inteiro. Na origem, o chat regravava o campo: com duas pessoas ao mesmo tempo, uma apagava a opção da outra. Só em campo `list` (`notListField`), e a opção que já existe, mesmo escrita de outro jeito, não duplica.

`POST /custom-fields/:id/options`:

```json
{
  "value": "Google"
}
```

Resposta `200`:

```json
{
  "customField": {
    "id": "6aee25265e6b67d74a2d0265",
    "key": "como_conheceu",
    "valueType": "list",
    "optionValues": [
      "Instagram",
      "Indicação",
      "Google"
    ]
  }
}
```

### `GET /custom-fields/:id/values?startDate=&endDate=`

Os valores distintos e quantas conversas têm cada um, do mais usado para o menos, até 500 (`truncated: true` se passou). `value: null` são as conversas sem o campo. `editable: false` são valores que não são texto simples (mapas de sistema), que a normalização não alcança.

Resposta `200`:

```json
{
  "values": [
    {
      "value": null,
      "count": 27,
      "editable": true
    },
    {
      "value": "Curitiba",
      "count": 3,
      "editable": true
    },
    {
      "value": "Belo Horizonte",
      "count": 2,
      "editable": true
    },
    {
      "value": "Fortaleza",
      "count": 1,
      "editable": true
    },
    {
      "value": "Londrina",
      "count": 1,
      "editable": true
    },
    {
      "value": "Rio de Janeiro",
      "count": 1,
      "editable": true
    },
    {
      "value": "Salvador",
      "count": 1,
      "editable": true
    },
    {
      "value": "São Paulo",
      "count": 1,
      "editable": true
    }
  ],
  "truncated": false
}
```

### `POST /custom-fields/:id/normalize`

Troca valores em massa. `mapping` (`{ "de": "para" }`, de 1 a 500 pares), `dryRun`, `convertToNumber`, `targetKey`, `startDate`, `endDate`. Com `targetKey`, grava em outro campo e preserva o original.

**Sem `dryRun`, só mostra a prévia.** Na origem, omitir aplicava de vez, e isto muda dados de conversas em massa sem volta. Para aplicar: `dryRun: false`.

`POST /custom-fields/:id/normalize`:

```json
{
  "mapping": {
    "Curitiba": "Curitiba/PR"
  }
}
```

Resposta `200`:

```json
{
  "dryRun": true,
  "changes": [
    {
      "from": "Curitiba",
      "to": "Curitiba/PR",
      "count": 3
    }
  ],
  "targetKey": null
}
```

`POST /custom-fields/:id/normalize`:

```json
{
  "mapping": {
    "Rio de Janeiro": "Rio de Janeiro/RJ"
  },
  "dryRun": false
}
```

Resposta `200`:

```json
{
  "dryRun": false,
  "changes": [
    {
      "from": "Rio de Janeiro",
      "to": "Rio de Janeiro/RJ",
      "count": 1
    }
  ],
  "targetKey": null
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "invalidMapping",
    "message": "Informe de 1 a 500 pares de valores para normalizar.",
    "field": "mapping"
  }
}
```

---

## Contatos: `/contacts`

Contato aqui é a conversa, então vale a mesma visibilidade de `chat_list_to`.

### `GET /contacts`

| Parâmetro | O que faz |
|---|---|
| `q` | Nome ou telefone. |
| `tagIds[]`, `connectorIds[]` | Etiquetas e canais. |
| `assignedUser` | `me`, `unassigned` ou o id da pessoa. |
| `status` | `open` ou `closed`. |
| `automationEnabled` | `true` ou `false`. |
| `hasSession` | `true`: só quem está na janela de 24 horas. `false` não filtra, como na origem. |
| `dateFrom`, `dateTo` | Data de criação, no fuso da organização. |
| `sortBy` | `last_message_at` (padrão), `created_at`, `user_name`, `status`, `unread_messages`. |
| `sortDir` | `asc` ou `desc` (padrão). |

`GET /contacts?perPage=2&sortBy=user_name&sortDir=asc`

Resposta `200`:

```json
{
  "contacts": [
    {
      "id": "6aee1d6ed559f5a3171fd2d9",
      "userName": "Aline Barros",
      "displayName": null,
      "externalId": "5531970000822",
      "phoneNumber": "5531970000822",
      "profilePictureUrl": null,
      "lastMessageAt": 1792768800000,
      "lastMessageFrom": "14d",
      "lastMessageType": "text",
      "lastMessageBy": "assistant",
      "lastMessageContent": "Para Curitiba, chega em até 2 dias úteis.",
      "status": "open",
      "automationEnabled": true,
      "assignedAccountId": null,
      "teamId": null,
      "connectorId": "6aee1d6dd559f5a3171fd278",
      "connectorName": "Doma Store",
      "connectorType": "whatsapp_web",
      "tagIds": [
        "6aee1d6dd559f5a3171fd281"
      ],
      "activeSession": false,
      "createdAt": 1792768320000,
      "unreadMessages": 0,
      "notes": null
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 2,
    "total": 37,
    "totalPages": 19,
    "hasMore": true
  }
}
```

### `GET /contacts/filters`

As opções dos filtros da tela: `connectors` no formato de `ConnectorSerializer`, `tags`, `users` e `teams`.

Resposta `200`:

```json
{
  "connectors": [
    {
      "id": "6aee1d6dd559f5a3171fd277",
      "type": "web_widget",
      "name": "Site da Doma Store",
      "status": "active",
      "active": true,
      "errorMessage": null,
      "sendCollaboratorName": false,
      "createdAt": 1793989997513,
      "botDisplayName": "Site da Doma Store",
      "botAvatarUrl": null,
      "primaryColor": "#5B93FF",
      "position": "bottom-right",
      "welcomeMessage": "Olá! Como podemos ajudar?",
      "allowedOrigins": [],
      "launcherIcon": "chat",
      "locale": "pt-BR"
    }
  ],
  "tags": [
    {
      "id": "6aee1d6ed559f5a3171fd317",
      "name": "aguardando-operador",
      "description": "A automação passou para uma pessoa",
      "color": "#f59e0b",
      "createdAt": 1793989998715
    }
  ],
  "users": [
    {
      "id": "31e43b45-d378-4fed-a0f9-41c73e5ea0b5",
      "name": "Beatriz Lima"
    }
  ],
  "teams": [
    {
      "id": "0c38b8ed-11f1-49d3-bd7a-dcf7fa67558a",
      "name": "Atendimento"
    }
  ]
}
```

### Ações em lote

`POST /contacts/bulk-add-tags`, `/bulk-remove-tags`, `/bulk-assign-user`, `/bulk-update-status`, `/bulk-toggle-automation`.

A seleção é uma de duas: `chatIds` (os marcados, até 5000), ou `selectAll: true` com `filters` (um objeto com os mesmos parâmetros de `GET /contacts`) e `excludedIds` (os desmarcados). Sempre dentro do que a pessoa pode ver: id de outra organização, ou de conversa que ela não vê, simplesmente não conta.

`updatedCount` é quantas mudaram de verdade: conversa que já estava assim não conta.

**Lote não avisa o tempo real nem escreve nota no histórico,** porque pode ter milhares. A tela recarrega a lista depois.

| Rota | Campo da ação |
|---|---|
| `bulk-add-tags`, `bulk-remove-tags` | `tagIds` |
| `bulk-assign-user` | `accountId` (`null` tira a atribuição) |
| `bulk-update-status` | `status`: `open` ou `closed` |
| `bulk-toggle-automation` | `automationEnabled` |

`POST /contacts/bulk-add-tags`:

```json
{
  "chatIds": [
    "6aee25245e6b67d74a2d025a"
  ],
  "tagIds": [
    "6aee1d6dd559f5a3171fd280"
  ]
}
```

Resposta `200`:

```json
{
  "updatedCount": 1
}
```

Todos do filtro:

`POST /contacts/bulk-add-tags`:

```json
{
  "selectAll": true,
  "filters": {
    "q": "Teresa"
  },
  "excludedIds": [],
  "tagIds": [
    "6aee1d6dd559f5a3171fd280"
  ]
}
```

Resposta `200`:

```json
{
  "updatedCount": 0
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "noChatsSelected",
    "message": "Selecione ao menos um contato.",
    "field": "chatIds"
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "invalidAssignee",
    "message": "Essa pessoa não pode receber atendimentos nesta organização.",
    "field": "accountId"
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "invalidStatus",
    "message": "Situação inválida: use aberta ou fechada.",
    "field": "status"
  }
}
```

Conversa de outra pessoa, para quem tem nível `assigned`, não entra na conta:

Resposta `200`:

```json
{
  "updatedCount": 0
}
```

### `GET /contacts/export`

CSV na hora, para listas pequenas. `chatIds[]`, ou `selectAll=true` com `excludedIds[]`, ou só os filtros soltos na query, como em `GET /contacts`. Até 5000 linhas; acima disso, `422 exportTooLarge` e use `ContactsExportChannel`.

O cabeçalho sai no idioma da requisição, as datas no fuso da organização, e cada campo personalizado vira uma coluna. Células que começam com `=`, `+`, `-` ou `@` são neutralizadas, para o Excel não executar fórmula vinda de um nome de contato.

Resposta `200`, `text/csv`, `attachment; filename="contatos-2026-11-06.csv"; filename*=UTF-8''contatos-2026-11-06.csv`:

```csv
Nome,Telefone,Canal,Situação,Automação,Atribuído a,Departamento,Etiquetas,Última mensagem,Criado em,Cidade,Tamanho preferido,Ticket médio,Aceita novidades,Aniversário,Canal de origem
Teresa Vidal,5541988887766,Doma Store,Fechada,Não,Marina Duarte,Atendimento,"",06/11/2026 16:06,06/11/2026 16:06,Curitiba,,400,,,
```

### `GET /contacts/download-export?token=`

O link que `ContactsExportChannel` entrega, **sem sessão**: o navegador abre direto, e quem autoriza é o token, que vale 1 hora e é só de quem pediu. Responde `302` para o proxy do Active Storage. O arquivo é removido 5 minutos depois de o link vencer.

Resposta `403`:

```json
{
  "error": {
    "code": "exportTokenInvalid",
    "message": "Este link de download não é válido."
  }
}
```

Resposta `400`:

```json
{
  "error": {
    "code": "exportTokenMissing",
    "message": "O link de download está incompleto.",
    "field": "token"
  }
}
```

---

## Importação de contatos: `/contact-imports`

As linhas viram conversas em segundo plano, no canal escolhido: `ProcessContactImportJob`, no Sidekiq. Acompanhe por `status` (`pending`, `processing`, `completed`, `failed`) em `GET /contact-imports/:id`. Conversa importada nasce com a automação desligada, `audienceType: "import_feature"` e data de dois dias atrás, para uma planilha não encher o topo da lista. Se o número já tem conversa nesse canal, por qualquer forma de escrevê-lo, não duplica: ela sobe na lista e recebe a atribuição, se veio.

`importedContactsCount` e `errorsCount` nascem da leitura das linhas (aproveitadas e descartadas) e são recontados ao terminar. `progressPercentage` é sobre essa leitura, e não sobre a criação das conversas: é o `status` que diz se terminou.

### `POST /contact-imports`

`connectorId`, `contacts` (até 1000), `includeCountryCode` (acrescenta o 55), `batchIndex`, `totalBatches`. Cada contato: `externalId`, `userName`, `assignedUserName`, `departmentName`, estes dois resolvidos pelo nome. Quem está em `setupOnly` não é atribuído. Listas maiores vão em vários lotes, um `POST` por lote, como na tela da origem.

`POST /contact-imports`:

```json
{
  "connectorId": "6aee1d6dd559f5a3171fd278",
  "includeCountryCode": true,
  "contacts": [
    {
      "externalId": "41977776666",
      "userName": "Vera Lúcia",
      "assignedUserName": "Camila Rocha",
      "departmentName": "Atendimento"
    },
    {
      "externalId": "41977775555",
      "userName": "Paulo César"
    },
    {
      "userName": "Sem número"
    }
  ]
}
```

Resposta `201`:

```json
{
  "contactImport": {
    "id": "c347251d-bb14-4953-bb0f-44506bbd111e",
    "connectorId": "6aee1d6dd559f5a3171fd278",
    "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
    "fileName": null,
    "status": "pending",
    "totalContacts": 3,
    "importedContactsCount": 2,
    "errorsCount": 1,
    "includeCountryCode": true,
    "batchIndex": null,
    "totalBatches": null,
    "successRate": 66.67,
    "progressPercentage": 100.0,
    "processingDuration": null,
    "startedAt": null,
    "completedAt": null,
    "createdAt": 1793991975599
  },
  "importedCount": 2,
  "totalContacts": 3
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "noContactsProvided",
    "message": "Nenhum contato informado.",
    "field": "contacts"
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "invalidConnector",
    "message": "Este canal não existe nesta organização.",
    "field": "connectorId"
  }
}
```

### `POST /contact-imports/file`

Multipart: `file` (CSV), `connectorId`, `includeCountryCode`. O arquivo é dividido em lotes de 1000 aqui. Separador `,` ou `;`, com ou sem BOM, em UTF-8 ou Latin-1. Cabeçalhos aceitos, sem diferença de maiúsculas ou acentos: `telefone`, `phone`, `whatsapp`, `celular`, `numero`, `external_id`; `nome`, `name`, `user_name`; `responsavel`, `assigned_user_name`; `departamento`, `department`, `department_name`.

Resposta `201`:

```json
{
  "contactImports": [
    {
      "id": "20d1bfea-6f19-4211-808c-33b0a3e36d7b",
      "connectorId": "6aee1d6dd559f5a3171fd278",
      "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
      "fileName": "clientes.csv",
      "status": "pending",
      "totalContacts": 2,
      "importedContactsCount": 2,
      "errorsCount": 0,
      "includeCountryCode": false,
      "batchIndex": 0,
      "totalBatches": 1,
      "successRate": 100.0,
      "progressPercentage": 100.0,
      "processingDuration": null,
      "startedAt": null,
      "completedAt": null,
      "createdAt": 1793991975704
    }
  ],
  "importedCount": 2,
  "totalContacts": 2,
  "totalBatches": 1,
  "fileName": "clientes.csv"
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "invalidCsv",
    "message": "Só é aceito arquivo CSV.",
    "field": "file"
  }
}
```

### `GET /contact-imports` e `GET /contact-imports/:id`

Resposta `200`:

```json
{
  "contactImports": [
    {
      "id": "20d1bfea-6f19-4211-808c-33b0a3e36d7b",
      "connectorId": "6aee1d6dd559f5a3171fd278",
      "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
      "fileName": "clientes.csv",
      "status": "completed",
      "totalContacts": 2,
      "importedContactsCount": 2,
      "errorsCount": 0,
      "includeCountryCode": false,
      "batchIndex": 0,
      "totalBatches": 1,
      "successRate": 100.0,
      "progressPercentage": 100.0,
      "processingDuration": 0.031713,
      "startedAt": 1793991975727,
      "completedAt": 1793991975758,
      "createdAt": 1793991975704
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 2,
    "total": 21,
    "totalPages": 11,
    "hasMore": true
  }
}
```

Resposta `200`:

```json
{
  "contactImport": {
    "id": "c347251d-bb14-4953-bb0f-44506bbd111e",
    "connectorId": "6aee1d6dd559f5a3171fd278",
    "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
    "fileName": null,
    "status": "completed",
    "totalContacts": 3,
    "importedContactsCount": 2,
    "errorsCount": 1,
    "includeCountryCode": true,
    "batchIndex": null,
    "totalBatches": null,
    "successRate": 66.67,
    "progressPercentage": 100.0,
    "processingDuration": 0.046593999999999997,
    "startedAt": 1793991975639,
    "completedAt": 1793991975686,
    "createdAt": 1793991975599
  }
}
```

---

## Tempo real

Conexão, autenticação e os outros canais em [connectors.md](connectors.md). Todo evento aqui chega como `{ "action": "...", "data": { ... } }`.

### `ContactsExportChannel`

Exportação em segundo plano. Sem parâmetros, exige `contacts`. O progresso volta só para quem pediu.

**Envie:** `perform("export", { selectAll, filters, chatIds, excludedIds })`, com a mesma seleção das ações em lote. Com `selectAll` sem filtros, são todos os que a pessoa vê.

**Receba:**

| `action` | `data` |
|---|---|
| `progress` | `{ processed, total }`, a cada lote. |
| `completed` | `{ downloadUrl, total, fileName }`. Sem nada para exportar: `{ downloadUrl: null, total: 0, message }`. |
| `error` | `{ error }`, o texto para mostrar. |

```json
{
  "action": "progress",
  "data": {
    "processed": 0,
    "total": 21
  }
}
```

```json
{
  "action": "completed",
  "data": {
    "downloadUrl": "/contacts/download-export?token=<token assinado>",
    "total": 21,
    "fileName": "contatos-2026-11-06.csv"
  }
}
```

`downloadUrl` é relativo: prefixe com a URL da API e abra no navegador. Não precisa de sessão.

### `CopilotChannel`

O copiloto do chat: uma conversa da pessoa com um agente que busca, lê, analisa e age nas conversas. Exige `chat`, e cada ferramenta respeita o `chat_list_to` de quem pergunta.

**Assinar:** `{ channel: "CopilotChannel", sessionId }`. `sessionId` é gerado pela tela (`[\w-]{1,100}`) e separa as abas: a resposta só chega à aba que perguntou. **O histórico é um só por pessoa, guardado aqui:** o que chega em `connected` é o que vale, e a tela não manda histórico nenhum.

**Envie:**

| Ação | Dados |
|---|---|
| `message` | `{ userMessage, skipSave? }`. `skipSave: true` é a nova tentativa: a mensagem já está guardada. Até 10 mil caracteres. |
| `clear_history` | Nada. |

**Receba:**

| `action` | `data` |
|---|---|
| `connected` | `{ message, sessionId, savedMessages }`, ao assinar. |
| `text_chunk` | `{ chunk, seq }`. Junte em ordem de `seq`. |
| `tool_activity` | `{ toolName, status: "started" \| "completed", activityType, icon, description, timestamp, success, ... }`. Em `completed`, também `input`, `output` (com teto de tamanho e profundidade, é para mostrar; o modelo recebe o inteiro) e `contact`, quando a ferramenta é sobre uma conversa. |
| `message_complete` | `{ text, toolCalls, changesApplied }`. É o texto inteiro: pode substituir o que veio em pedaços. |
| `credits_updated` | `{ messageCredits, consumedCredits }`: o saldo e quanto saiu nesta mensagem. |
| `error` | `{ error, code }`. `code`: `noCredits`, `unavailable`, `failed`, `blankMessage`, `messageTooLong`. |
| `history_cleared` | `{ success }`. |

Ao assinar (duas das mensagens guardadas):

```json
{
  "action": "connected",
  "data": {
    "message": "Conectado ao copiloto.",
    "sessionId": "e2e-8c7f7117",
    "savedMessages": [
      {
        "id": "6aee25205c3feee32260c20f",
        "role": "user",
        "content": "Quais conversas estão sem dono hoje?",
        "timestamp": 1793991968871,
        "toolCalls": null,
        "changesApplied": null,
        "toolActivities": null,
        "contentSegments": null
      },
      {
        "id": "6aee25205c3feee32260c210",
        "role": "assistant",
        "content": "Encontrei conversas sem dono, a mais recente é a da **Ana Beatriz Moura**, que quer fechar o vestido midi de linho até sexta. Quer que eu atribua a alguém do Comercial?",
        "timestamp": 1793991968874,
        "toolCalls": null,
        "changesApplied": null,
        "toolActivities": null,
        "contentSegments": null
      }
    ]
  }
}
```

Ferramenta começando:

```json
{
  "action": "tool_activity",
  "data": {
    "toolName": "search_chats",
    "status": "started",
    "activityType": "reading",
    "icon": "search",
    "description": "Buscando conversas...",
    "timestamp": 1793991980636,
    "success": true
  }
}
```

E terminando (uma conversa do resultado):

```json
{
  "action": "tool_activity",
  "data": {
    "toolName": "search_chats",
    "status": "completed",
    "activityType": "reading",
    "icon": "search",
    "description": "Buscando conversas...",
    "timestamp": 1793991980655,
    "success": true,
    "input": {
      "status": "open",
      "limit": 25
    },
    "output": {
      "total": 24,
      "returned": 24,
      "chats": [
        {
          "id": "6aee1d6dd559f5a3171fd28e",
          "user_name": "João Pedro Almeida",
          "display_name": null,
          "external_id": "visitante-joao-pedro",
          "phone_number": "visitante-joao-pedro",
          "status": "open",
          "automation_enabled": true,
          "assigned_name": "Camila Rocha",
          "unread_messages": 0,
          "last_message_at": "2026-11-06T13:18:00-03:00",
          "last_message_content": "Pronto, separada. Pode trazer a outra na loja até sexta ou pedir a coleta pelos Correios.",
          "last_message_from": "atendente",
          "tags": [
            "[...]"
          ]
        }
      ]
    }
  }
}
```

Texto em pedaços:

```json
{
  "action": "text_chunk",
  "data": {
    "chunk": "Você tem **18",
    "seq": 0
  }
}
```

Fim de uma mensagem que só leu:

```json
{
  "action": "message_complete",
  "data": {
    "text": "Você tem **18 conversas abertas sem dono** (de 24 abertas no total). A **Fernanda Lima** é uma dessas: está com a etiqueta **retorno** e ontem (05/11), às 13:27, mandou um áudio que ficou sem transcrição e ainda não foi respondido.",
    "toolCalls": [],
    "changesApplied": []
  }
}
```

Fim de uma mensagem que agiu. `changesApplied` diz o que mudou, para a tela recarregar:

```json
{
  "action": "message_complete",
  "data": {
    "text": "Apliquei a etiqueta **vip** na conversa da **Teresa Vidal** (aparece como \"Tê\"). Ela está atribuída a você, mas está **fechada**. Se quiser continuar o atendimento com ela, posso reabrir a conversa.",
    "toolCalls": [
      {
        "action": "assign_tag",
        "chatId": "6aee25245e6b67d74a2d025a",
        "tag": "vip"
      }
    ],
    "changesApplied": [
      {
        "action": "assign_tag",
        "chatId": "6aee25245e6b67d74a2d025a",
        "tag": "vip"
      }
    ]
  }
}
```

Cobrança:

```json
{
  "action": "credits_updated",
  "data": {
    "messageCredits": 138,
    "consumedCredits": 2
  }
}
```

Recusa:

```json
{
  "action": "error",
  "data": {
    "error": "Escreva uma mensagem.",
    "code": "blankMessage"
  }
}
```

Histórico limpo:

```json
{
  "action": "history_cleared",
  "data": {
    "success": true
  }
}
```

**Créditos.** Cada mensagem custa 2 créditos, na entrada, e é devolvida se nada útil saiu: nem texto, nem ação aplicada. Sem créditos, `error` com `noCredits`, antes de enfileirar. Os custos ainda não aparecem em `aiCosts` de `GET /catalog`.

**Sem nova tentativa automática.** Uma mensagem pode já ter enviado algo a um contato, e repetir enviaria de novo. Quem decide tentar outra vez é a pessoa, com `skipSave`.

#### Ferramentas

| Ferramenta | O que faz |
|---|---|
| `search_chats` | Busca por nome, número, situação, etiqueta, dono e período. |
| `get_chat_details` | A conversa e as últimas mensagens. |
| `summarize_chat` | Resumo, pelo modelo rápido. |
| `search_message_content` | Quem falou de um assunto, por termos. |
| `find_hot_leads` | Conversas mais quentes, por recência e atividade. |
| `qualify_chats` | Análise de um lote de conversas por um critério, pelo modelo rápido. Aparece também como `analyze_chat` em `tool_activity`, uma por conversa. |
| `list_tags`, `assign_tag`, `remove_tag` | Etiquetas. |
| `assign_chat`, `toggle_automation`, `close_chat` | Ações em uma conversa. |
| `send_messages` | Envia para até 50 conversas, uma por vez. Em `tool_activity`, aparece uma vez por contato e uma vez pelo lote. |
| `list_team_members`, `get_agent_performance`, `get_team_ranking` | A equipe. O ranking não usa conversão enquanto não há agenda. |
| `get_tag_distribution`, `get_chat_volume`, `get_hourly_activity` | Números do atendimento. `daily_active` em `get_chat_volume` conta pela última mensagem de cada conversa. |

Ficaram de fora, porque o domínio ainda não existe aqui: `list_appointments`, `get_appointment_details`, `cancel_appointment`, `reschedule_appointment`, `qualify_appointments` e `get_appointment_stats` (be-agenda), `get_chat_funnel` (be-insights). `get_token_usage` também ficou de fora, porque não há contagem de tokens por organização.

**Modelos.** Agente em `claude-opus-5-5`, com pensamento adaptativo e `fallbacks: :default`; resumo e qualificação em `claude-haiku-5-5`. Até 15 rodadas de ferramenta por mensagem. O histórico guarda até 200 mensagens, e as antigas viram resumo a partir de 15.

---

## Semente

`bin/rails db:seed`, idempotente e sem depender de rede, sobre as conversas da semente de connectors (conteúdo da Doma Store):

| O quê | Quantos |
|---|---|
| Campos personalizados, de todos os tipos | 6 |
| Mensagens rápidas, algumas citando anexo | 8 |
| Anexos, com arquivo de verdade (PDF e PNG) | 4 |
| Visões, pessoais e compartilhadas | 5 |
| Etiquetas | 12 |
| Importação, com conversas importadas pelo job de verdade | 1 |
| Conversas, com as 5 importadas | 35 |
| Conversa de exemplo com o copiloto, da Marina | 1 |

Os campos ficam preenchidos nas conversas que já existem (sempre como texto), as etiquetas ficam aplicadas, e rodar de novo não desfaz o que a pessoa mudou.

## Para o deploy

- `bin/rails db:migrate`: `quick_replies`, `chat_views`, `attachments`, `contact_imports`, `contact_import_rows`.
- `bin/rails db:mongoid:create_indexes`: `CustomField`, `CustomFieldValue` e `CopilotThread` têm índices novos, um deles único.
- `ANTHROPIC_API_KEY`, para o copiloto e a resposta sugerida. Sem ela, `unavailable` e `suggestionFailed`, e nada é cobrado.
- `ffmpeg` na imagem, para converter áudio. Sem ele, o arquivo sai como veio.
- Sidekiq com as filas `default` e `low`: exportação, importação e copiloto na `default`, remoção do arquivo exportado na `low`.

## Limites conhecidos

- **Tempo real em lote:** ações em lote e importação não avisam a lista conectada. A tela recarrega.
- **`ChatChannel` ainda não confere `chat_list_to`** ao assinar e enviar, ao contrário de REST. A correção é `Chat.visible_to(current_account)` em `ChatChannel`, que é do núcleo.
- **`ChatListChannel` e REST divergem no nível `team`:** conversa sem departamento, mas com dono, aparece em REST e não chega em tempo real.
- **`aiCosts` em `GET /catalog`** não lista copiloto nem resposta sugerida. Os custos são os daqui: 2 e 1.
- **Áudio sem transcrição:** `content` é `"-"`. O modelo recebe `[áudio sem transcrição]`, e a tela precisa olhar `typeElement`.
- **Agendamento e funil no copiloto** esperam os domínios deles.

## O que não foi exercitado

Com Puma, Sidekiq e cliente real, foram exercitadas todas as rotas e os dois canais deste contrato, com três níveis de visibilidade e uma segunda organização. Ficou de fora, ou só em spec:

- **Provedor de verdade.** Áudio, arquivo, reação e o envio do copiloto foram até um servidor falso, que imita a resposta da Evolution. O WhatsApp não recebeu nada, e a conversão por `ffmpeg` rodou, mas ninguém ouviu o resultado.
- **Apagar para todos com sucesso.** Só a Z-API revoga, e o endereço dela é fixo no código. O caminho feliz de `DELETE .../messages/:id`, e `everyone` em `bulk-delete`, estão só em spec, com a Z-API simulada. Pela API de verdade foi exercitada a recusa da Evolution.
- **Exportação e importação grandes.** Rodaram com dezenas de linhas. Os limites (5000 ids, 1000 por lote) estão em spec, sem volume real.
- **Link de download vencido** (`410`) e o job que remove o arquivo: só em spec, para não esperar 1 hora.
- **Sem créditos, `busy` e falha do modelo** na resposta sugerida e no copiloto: só em spec. O caminho feliz foi com a API da Anthropic de verdade.
- **`assign_chat`, `remove_tag`, `toggle_automation` e `close_chat`** no copiloto: só em spec. Pelo modelo de verdade passaram `search_chats`, `get_chat_details`, `summarize_chat`, `qualify_chats`, `assign_tag`, `send_messages`, `get_team_ranking`, `get_chat_volume`, `get_hourly_activity` e `get_tag_distribution`. As demais de leitura rodaram direto no banco de desenvolvimento, sem o modelo.
- **A tela.** Não há front neste domínio ainda: nenhum hook da origem foi ligado a estas rotas de verdade. A tabela abaixo é a conferência no código.

## De cada hook da origem ao endpoint

Conferido contra `aiva-frontend/src/api`. Na origem o id da conta ia na URL, e aqui a organização vem da sessão.

### `src/api/chat/`

| Arquivo | Hook ou função | Aqui |
|---|---|---|
| `conversation-actions.ts` | `saveUserAttributes` | `PUT /chats/:id/attributes` |
| | `sendConversationAudio` | `POST /chats/:id/messages/audio` |
| | `sendConversationFiles` | `POST /chats/:id/messages/attachments` |
| | `updateConversation` | `PATCH /chats/:id` |
| | `deleteConversation` | `DELETE /chats/:id` |
| | `generateMessageAi` | `POST /chats/:id/suggest-reply` |
| | `createConversation` | `POST /chats` |
| `conversation-list-helpers.ts` | `buildConversationsPath`, `toQueryConditions` | `GET /chats`, `POST /chats/search`, com `filters` |
| | `matchesConversationQuery`, `upsertAcrossPages` e os outros | Só cliente |
| `use-infinite-conversations.ts` | `useInfiniteConversations` | `GET /chats`, `POST /chats/search`, `ChatListChannel` (`request_recent`) |
| `use-conversations-legacy.ts` | `useGetConversations` | `GET /chats` |
| `use-self-filter.ts` | `useSelfFilter` | `GET /chats/self-filter`. `organizations` (assistentes) não existe aqui. |
| `use-tags.ts` | `useTags`: lista e criação | `GET` e `POST /chat-tags` |
| | atribuir e remover | `PUT` e `DELETE /chat-tags/:id/chats/:chatId` |
| | contar | `GET /chat-tags/:id/assigns` |
| | alterar e apagar | `PATCH` e `DELETE /chat-tags/:id` |
| `use-auto-remove-waiting-tag.ts` | `useAutoRemoveWaitingTag` | `DELETE /chat-tags/:id/chats/:chatId`. A regra é da tela, e a chave fica em `organization.settings.chatSettings.autoRemoveWaitingOperatorTag`. |
| `use-chat-messages.ts` | `useGetChatMessages`: histórico | `GET /chats/:id/messages` |
| | apagar uma | `DELETE /chats/:id/messages/:id` |
| | apagar em lote | `POST /chats/:id/messages/bulk-delete` (na origem, `DELETE` com corpo) |
| | enviar, reagir e receber | `ChatChannel`. Reagir também em `POST .../messages/:id/reaction`. |
| `use-infinite-unified-contacts.ts` | `useInfiniteUnifiedContacts` | `GET /unified-contacts`, `ChatListChannel` |
| `use-unified-contact-messages.ts` | `useUnifiedContactMessages` | `GET /unified-contacts/:externalId/messages`, `ChatChannel` por conversa |
| `use-instance-variable-definitions.ts` | `useInstanceVariableDefinitions` | `GET /custom-fields` |
| `use-scheduled-automations.ts`, `scheduled-automations-*.ts` | | **be-agenda**, não está aqui |
| `use-live-sync-guard.ts`, `conversation-event-queue.ts`, `parse-chat-timestamp.ts`, `types.ts`, `index.ts` | | Só cliente |

### Os outros

| Arquivo | Hook ou função | Aqui |
|---|---|---|
| `useContacts.ts` | `useContacts` | `GET /contacts` |
| | `useContactsFilters` | `GET /contacts/filters` |
| | `bulkAddTags`, `bulkRemoveTags` | `POST /contacts/bulk-add-tags`, `/bulk-remove-tags` |
| | `bulkAssignUser` | `POST /contacts/bulk-assign-user` |
| | `bulkUpdateStatus` | `POST /contacts/bulk-update-status` |
| | `bulkToggleAutomation` | `POST /contacts/bulk-toggle-automation` |
| | `getExportUrl` | `GET /contacts/export` |
| `hooks/use-contacts-export.ts` | | `ContactsExportChannel`, `GET /contacts/download-export` |
| `useConversations.ts` | `useConversations` | `GET /chats/lookup` |
| `useChatSnippets.js` | | `GET`, `POST`, `PATCH` e `DELETE /quick-replies` |
| `chat-filters.js` | | `GET`, `POST`, `PATCH` e `DELETE /chat-views` |
| `attachments.js` | Por assistente na origem | `/attachments`, sem `automationId` |
| `useAttachments.ts` | | `GET`, `POST`, `PATCH` e `DELETE /attachments` |
| `use-custom-fields.ts` | | `GET`, `POST`, `PATCH` e `DELETE /custom-fields` |
| `use-custom-field-values.ts` | `useCustomFieldValues` | `GET /custom-fields/:id/values` |
| | `normalizeCustomField` | `POST /custom-fields/:id/normalize`. **Mande `dryRun: false` para aplicar.** |
| `useIntegrations.ts` | `import_contacts`, `import_contacts_file` | `POST /contact-imports`, `POST /contact-imports/file` |
| `components/chat-assistant/use-chat-assistant.ts` | | `CopilotChannel` |
| `contactNotificationPreview.ts` | | `GET /chats/:id/messages?limit=&initial=true`, que exige `chat`. Ver pendência para be-agenda. |
| `class-session-dialog.tsx`, `ClassGroupEnrollmentsDialog.tsx` | Busca de conversa | `GET /chats/lookup` |
| `pages/campaigns/wizard/step-config.tsx` | Etiquetas | `GET /chat-tags` |

`currentWorkspace.unified_contacts_enabled`, em `pages/apps/chat.jsx` e `chat-mobile.jsx`, não tem equivalente: o recurso é sempre ligado.

### Campos que mudaram para o front

Tudo em camelCase e com data em milissegundos. Além disso, mudou de nome:

| Na origem | Aqui |
|---|---|
| `integration_id` | `connectorId` |
| `integration_provider` (`z_api`) | `connectorProvider` (`zapi`) |
| `integrations` em `self_filter` | `connectors` |
| `assigned_user_id` | `assignedAccountId` |
| `department_id` | `teamId` |
| `conversation_id`, `conversations` em contato unificado | `chatId`, `chats` |
| `data`, `page`, `limit` em contato unificado | `contacts`, `meta` |
| `admin_user_id` em reação | `accountId` |
| Snippet, `chat_filter` e `definition`, como recursos | `quickReply`, `chatView` e `customField` |
| `payload` da visão, em texto | `payload`, lista de verdade |
