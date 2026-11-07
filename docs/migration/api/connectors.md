# Contrato da API: domínio "connectors"

O coração do atendimento: conversa, mensagem e canais (WhatsApp Cloud, WhatsApp Web com os provedores Evolution, AIVA e Z-API, Z-API direta, Instagram Direct, Messenger, LeadChat e widget do site), webhooks de entrada, mídia e tempo real.

**A listagem de conversas e de mensagens por REST não está aqui:** é do domínio inbox, em cima de `ChatSerializer` e `ChatMessageSerializer` (formatos em [Conversa e mensagem](#conversa-e-mensagem)). Aqui ficam os canais de tempo real, que já enviam e recebem.

**De onde vêm os exemplos.** São respostas reais, preenchidas a partir da captura, nunca escritas à mão. Só `visitorJwt` foi encurtado.

- REST e canais: servidor de desenvolvimento (Puma, Sidekiq e Redis) com a semente, e um cliente WebSocket de verdade falando `actioncable-v1-json`. A Evolution era um servidor falso em socket local, porque não há instância real aqui.
- Rotas que dependem da Meta (perfil, números, modelos, criação da WABA): sem credencial no desenvolvimento, saíram de uma request spec com a Meta simulada por WebMock. A resposta é a do código de verdade, mas nenhuma foi conferida contra a Meta real. É por isso que esses exemplos falam de "Clínica Vida" e os outros, de "Doma Store".
- O Ruby da seção [Como outros domínios enviam mensagem e criam conversa](#como-outros-domínios-enviam-mensagem-e-criam-conversa) foi executado como está escrito.

`localhost:3101` nos exemplos é a porta do ambiente da captura. Em desenvolvimento normal, a API fica em `http://localhost:3040`.

## Regras gerais

- **Autenticação:** `Authorization: Bearer <token>`. Sem sessão válida, `401 unauthorized`. `/inbound/*` e `/widget/v1/*` têm autenticação própria, descrita em cada seção.
- **A organização vem da sessão.** Não há id de organização na URL. Id de outra organização responde `404 notFound`, nunca `403`.
- **Entrada:** corpo JSON solto, sem envelope, em camelCase: `{ "sendCollaboratorName": true }`. É diferente do domínio access. `components` (modelos) e `context` (widget) são mapas livres e passam como vieram.
- **Saída:** chaves em camelCase, datas em milissegundos desde a época, ids como string. Conector, conversa e mensagem têm id do Mongo (24 hexadecimais); conta, departamento e organização, UUID.
- **Listagens:** `{ "<recurso>": [...], "meta": { "page", "perPage", "total", "totalPages", "hasMore" } }`, com `?page=` e `?perPage=`.
- **Mídia:** `mediaUrl` e `audioUrl` são um caminho relativo (`/rails/active_storage/...`, mídia guardada aqui), que a tela prefixa com a URL da API, ou uma URL absoluta (mídia que veio de fora). Trate os dois casos.
- **Idioma:** `message` sai no idioma da requisição (`?locale=` ou `Accept-Language`). `code` é o contrato de máquina.

### Permissões

| Chave | O que libera |
|---|---|
| `chat` | Assinar `ChatChannel` e `ChatListChannel` e enviar por eles. |
| `chat_list_to` | Quais conversas a lista transmite: `all`, `team` ou `assigned`. |
| `core_settings` | Tudo que muda um canal: criar, ligar, pausar, modelos, widget e `PATCH /automation-settings`. Também o QR code. |

Sem permissão de configuração continua aberto: `GET /connectors`, `GET /connectors/:id`, `GET /connectors/:id/templates` e `GET /automation-settings`, porque o chat e as campanhas precisam conhecer os canais. Nenhuma dessas respostas traz token, chave ou segredo.

### Erros

Sempre `{ "error": { "code", "message", "field"?, "details"? } }`. `code` é o contrato; `message` é o que mostrar quando a tela não conhece o código.

| Status | `code` | Quando |
|---|---|---|
| 400 | `unauthorized` | Desafio de webhook da Meta com o token de verificação errado. |
| 400 | `invalidVisitorId` | Widget: `visitorId` fora do formato. `field: "visitorId"`. |
| 400 | `contentRequired` | Widget: mensagem em branco. `field: "content"`. |
| 400 | `missingFields` | Widget: falta campo do formulário. `details.fields` diz quais, em camelCase. |
| 401 | `unauthorized` | Sem sessão, sessão vencida ou JWT do visitante inválido. No widget, também `pk` desconhecida. |
| 403 | `forbidden` | Sem a permissão da rota. |
| 403 | `invalidSignature` | Webhook da Meta sem assinatura válida, com o segredo configurado. |
| 403 | `connectorInactive` | Widget desligado. |
| 403 | `originNotAllowed` | Widget em um site fora de `allowedOrigins`. |
| 403 | `mediaHostNotAllowed` | `/media/*` para um host que não é permitido. |
| 404 | `notFound` | Não existe, ou é de outra organização. |
| 404 | `templateNotFound` | Modelo que não existe neste canal. |
| 413 | `mediaTooLarge` | Arquivo além do limite do proxy de mídia. |
| 422 | `unprocessable` | Validação. `field` é o primeiro campo inválido (`base` quando não é de um campo só) e `details` traz todos. |
| 422 | `invalidConnectorType` | `connectorType` desconhecido em `POST /connectors`. |
| 422 | `connectorTypeMismatch` | A ação não existe neste tipo de canal. Ver a [tabela de ações](#o-que-cada-canal-faz). |
| 422 | `connectorActionFailed` | O provedor falhou na ação, sem motivo que valha mostrar. O detalhe fica no log. |
| 422 | `connectorProviderError` | O provedor recusou e `message` traz o motivo dele. |
| 422 | `fileRequired`, `invalidFileType`, `fileTooLarge`, `invalidSlot`, `uploadFailed` | Envio de arquivo. |
| 422 | `mediaReferenceRequired`, `invalidMediaUrl` | `/media/*` sem referência ou com URL inválida. |
| 422 | `invalidEmail`, `contentTooLong`, `contextTooLarge` | Widget. |
| 429 | `rateLimited` | Widget: limite por IP ou visitante. `details.retryAfter` em segundos, quando vem do limite por janela. |
| 429 | `dailyQuotaExceeded`, `visitorQuotaExceeded` | Widget: teto diário de mensagens ou de visitantes novos. |
| 502 | `mediaUpstreamError` | O CDN de origem falhou no proxy de mídia. |

---

## Canais: `/connectors`

### Tipos e o que criar precisa

| `connectorType` | `type` na resposta | Corpo | Depois de criar |
|---|---|---|---|
| `whatsapp_cloud` | `whatsapp_cloud` | `code` (Embedded Signup) ou `accessToken`; `phoneNumberId`, `wabaId`, `businessId` | `active`, ou `failed` com o motivo |
| `whatsapp_web` | `whatsapp_web` | `providerApi?` (`evolution_api`, `aiva_api`, `zapi`), `phoneNumberPairing?` | `pending`: o QR code chega por `ConnectorsChannel` |
| `zapi` | `zapi` | `instanceId`, `token`, `accountToken` | `pending` |
| `lead_chat` | `lead_chat` | `phoneNumberId`, `accessToken` | `active`, ou `failed` |
| `meta_channels` | `facebook_messenger`, e `instagramConnector` se a página tiver conta profissional | `code` (Facebook Login) | `active` |
| `instagram_direct` | `instagram_direct` | `code` (Instagram Login), `redirectUri` | `active` |
| `web_widget` | `web_widget` | nada | `inactive`: a pessoa personaliza e liga em `PATCH /connectors/:id/widget` |

`aiva_api` em `providerApi` cria sobre a Evolution, como a tela de escolha da origem fazia. Sem `providerApi`, vale a flag `zapi` da organização ou `WHATSAPP_WEB_DEFAULT_PROVIDER`.

**Se a ativação falhar, a resposta continua `201`,** com `status: "failed"` e o motivo em `errorMessage`: o canal fica criado para a pessoa ver e tentar de novo em `POST /connectors/:id/activate`, em vez de sobrar um órfão a cada tentativa.

### Estados

| `status` | Significa |
|---|---|
| `inactive` | Nunca ligado, ou desligado. |
| `pending` | Esperando o QR code ser lido. |
| `active` | Conectado. `active: true` só neste estado. |
| `paused` | Pausado pela pessoa: a automação não roda. **Em WhatsApp Web pela Evolution ou AIVA, o que chega durante a pausa é descartado e não volta**, como na origem. Avise ao pedir a confirmação. |
| `failed` | A conexão falhou. O motivo está em `errorMessage`. |
| `closed` | Desconectado (pela pessoa, pelo celular ou pelo provedor). |
| `reject` | O WhatsApp bloqueou o número. Não volta sozinho. |

### O que cada canal faz

| Ação | Cloud | Web | Z-API | Instagram | Messenger | LeadChat | Widget |
|---|---|---|---|---|---|---|---|
| `activate` | sim, com `code` | sim, gera QR | sim, gera QR | sim, com `code` | sim, com `code` | sim | sim |
| `pause` | sim | sim | sim | sim | sim | sim | sim |
| `reload` | falha¹ | sim | nada a fazer | não² | não² | nada a fazer | nada a fazer |
| `shutdown` | falha¹ | sim | sim | não² | não² | sim | sim |
| `disconnect` | não² | não² | sim | sim | sim | não² | sim |

¹ Responde `422 connectorActionFailed`: a WABA não tem instância para reiniciar, como na origem. Não ofereça.
² Responde `422 connectorTypeMismatch`.

Diferenças úteis por provedor em `whatsapp_web`: `reactionsSupported` (só Evolution) e `deleteForEveryoneSupported` (só Z-API) vêm no próprio conector. A tela esconde o que não existe.

### `GET /connectors`

Todos os canais da organização, do mais antigo para o mais novo. Exemplo com a semente, resumido a dois canais:

Resposta `200`:

```json
{
  "connectors": [
    {
      "id": "6aee08c135c5f09ba177beab",
      "type": "web_widget",
      "name": "Site da Doma Store",
      "status": "active",
      "active": true,
      "errorMessage": null,
      "sendCollaboratorName": false,
      "createdAt": 1793984705689,
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
      "id": "6aee08c135c5f09ba177beac",
      "type": "whatsapp_web",
      "name": "Doma Store",
      "status": "active",
      "active": true,
      "errorMessage": null,
      "sendCollaboratorName": false,
      "createdAt": 1793984705697,
      "providerApi": "evolution_api",
      "profileName": "Doma Store",
      "profilePictureUrl": null,
      "numberId": "5541930001234",
      "numberFormatted": "(41) 93000-1234",
      "reactionsSupported": true,
      "deleteForEveryoneSupported": false
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 100,
    "total": 4,
    "totalPages": 1,
    "hasMore": false
  }
}
```

Os campos depois de `createdAt` dependem do `type`:

Resposta `200`:

```json
{
  "connector": {
    "id": "6aee08c135c5f09ba177beae",
    "type": "instagram_direct",
    "name": "@domastore",
    "status": "inactive",
    "active": false,
    "errorMessage": null,
    "sendCollaboratorName": false,
    "createdAt": 1793984705708,
    "accountName": "Doma Store",
    "profileName": "domastore",
    "profilePictureUrl": null,
    "instagramAccountId": "178410000000001",
    "instagramUsername": "domastore",
    "biography": null,
    "followersCount": 12480,
    "followsCount": 320,
    "mediaCount": 412,
    "website": null,
    "accountType": null,
    "authProvider": "instagram_login",
    "linkedMessengerConnectorId": null
  },
  "extras": {}
}
```

Enquanto não há perfil, `name` no WhatsApp Web é o nome interno da instância (`IWA-<id>`). Mostre outro texto enquanto `status` for `pending`.

### `GET /connectors/:id`

`extras.qrCode` é o QR code guardado, para a tela abrir já com ele, e `extras.pairCode` é o código de pareamento, quando a conexão pediu um. Os dois só saem para quem tem `core_settings`.

Resposta `200`:

```json
{
  "connector": {
    "id": "6aee08c6c52c3e668e7ee2a9",
    "type": "whatsapp_web",
    "name": "IWA-6aee08c6c52c3e668e7ee2a9",
    "status": "pending",
    "active": false,
    "errorMessage": null,
    "sendCollaboratorName": false,
    "createdAt": 1793984710406,
    "providerApi": "evolution_api",
    "profileName": null,
    "profilePictureUrl": null,
    "numberId": null,
    "numberFormatted": null,
    "reactionsSupported": true,
    "deleteForEveryoneSupported": false
  },
  "extras": {
    "qrCode": "data:image/png;base64,QRDETESTE"
  }
}
```

Quem só atende recebe o mesmo conector, com `extras` vazio.

### `POST /connectors`

Exige `core_settings`. WhatsApp Web, com o QR code já chegando pelo canal:

`POST /connectors`:

```json
{
  "connectorType": "whatsapp_web",
  "providerApi": "evolution_api"
}
```

Resposta `201`:

```json
{
  "connector": {
    "id": "6aee08c6c52c3e668e7ee2a9",
    "type": "whatsapp_web",
    "name": "IWA-6aee08c6c52c3e668e7ee2a9",
    "status": "pending",
    "active": false,
    "errorMessage": null,
    "sendCollaboratorName": false,
    "createdAt": 1793984710406,
    "providerApi": "evolution_api",
    "profileName": null,
    "profilePictureUrl": null,
    "numberId": null,
    "numberFormatted": null,
    "reactionsSupported": true,
    "deleteForEveryoneSupported": false
  },
  "instagramConnector": null
}
```

WABA, com o que a pessoa cola no painel da Meta (`webhookUrl` e `verificationToken` saem só na resposta da criação):

`POST /connectors`:

```json
{
  "connectorType": "whatsapp_cloud",
  "code": "codigo-do-embedded-signup",
  "phoneNumberId": 123,
  "wabaId": 456,
  "businessId": 789
}
```

Resposta `201`:

```json
{
  "connector": {
    "id": "6aee0afaa020ece2240219db",
    "type": "whatsapp_cloud",
    "name": "Clínica Vida",
    "status": "active",
    "active": true,
    "errorMessage": null,
    "sendCollaboratorName": false,
    "createdAt": 1793985274621,
    "profileName": "Clínica Vida",
    "fbStatus": "CONNECTED",
    "qualityRating": "GREEN",
    "businessId": "789",
    "wabaId": "456",
    "phoneNumberId": "123",
    "displayPhoneNumber": "+55 31 3333-0000",
    "phoneNumberDetails": {
      "123": {
        "about": "Atendimento em Belo Horizonte",
        "address": "Rua da Bahia, 1000",
        "description": "Clínica de nutrição",
        "email": "contato@clinicavida.com.br",
        "profilePictureUrl": "https://cdn.exemplo.com/perfil.jpg",
        "websites": [
          "https://clinicavida.com.br"
        ]
      }
    },
    "phoneNumberList": [
      {
        "id": "123",
        "verifiedName": "Clínica Vida",
        "displayPhoneNumber": "+55 31 3333-0000",
        "qualityRating": "GREEN",
        "isPinEnabled": null,
        "isOfficialBusinessAccount": null,
        "accountMode": null,
        "certificate": null,
        "codeVerificationStatus": null,
        "eligibilityForApiBusinessGlobalSearch": null,
        "nameStatus": null,
        "newNameStatus": null,
        "status": "CONNECTED",
        "searchVisibility": null
      }
    ],
    "webhookUrl": "http://localhost:3101/inbound/whatsapp-cloud/6aee0afaa020ece2240219db",
    "verificationToken": "7hhsq6aosltwxbpdqbmxmvx7t8c283vb"
  },
  "instagramConnector": null
}
```

Facebook Login, criando os dois canais:

Resposta `201`:

```json
{
  "connector": {
    "id": "6aee0afba020ece2240219e1",
    "type": "facebook_messenger",
    "name": "Loja da Ana",
    "status": "active",
    "active": true,
    "errorMessage": null,
    "sendCollaboratorName": false,
    "createdAt": 1793985275870,
    "profileName": "Loja da Ana",
    "profilePictureUrl": "https://cdn.exemplo.com/pagina.jpg",
    "pageId": "9900",
    "pageUrl": null,
    "linkedInstagramConnectorId": "6aee0afba020ece2240219e2",
    "webhookUrl": "http://localhost:3101/inbound/meta-messaging",
    "verificationToken": "qn4ejpx4kd58rrx64b6prb5tlmb26e2m"
  },
  "instagramConnector": {
    "id": "6aee0afba020ece2240219e2",
    "type": "instagram_direct",
    "name": "@lojadaana",
    "status": "active",
    "active": true,
    "errorMessage": null,
    "sendCollaboratorName": false,
    "createdAt": 1793985275889,
    "accountName": "Loja da Ana",
    "profileName": "lojadaana",
    "profilePictureUrl": "https://cdn.exemplo.com/ana.jpg",
    "instagramAccountId": "1784",
    "instagramUsername": "lojadaana",
    "biography": "Roupas feitas à mão",
    "followersCount": 1200,
    "followsCount": 300,
    "mediaCount": 87,
    "website": "https://lojadaana.com.br",
    "accountType": "BUSINESS",
    "authProvider": "facebook_login",
    "linkedMessengerConnectorId": "6aee0afba020ece2240219e1",
    "webhookUrl": "http://localhost:3101/inbound/meta-messaging",
    "verificationToken": "e2zevd8ethnvzotxk9c19xks8h9p7n5m"
  }
}
```

Tipo desconhecido:

Resposta `422`:

```json
{
  "error": {
    "code": "invalidConnectorType",
    "message": "Tipo de conector inválido.",
    "field": "connectorType"
  }
}
```

### `PATCH /connectors/:id`

Só `sendCollaboratorName`: assina a mensagem com o nome de quem atendeu.

`PATCH /connectors/:id`:

```json
{
  "sendCollaboratorName": true
}
```

Resposta `200`:

```json
{
  "connector": {
    "id": "6aee08c135c5f09ba177beac",
    "type": "whatsapp_web",
    "name": "Doma Store",
    "status": "active",
    "active": true,
    "errorMessage": null,
    "sendCollaboratorName": true,
    "createdAt": 1793984705697,
    "providerApi": "evolution_api",
    "profileName": "Doma Store",
    "profilePictureUrl": null,
    "numberId": "5541930001234",
    "numberFormatted": "(41) 93000-1234",
    "reactionsSupported": true,
    "deleteForEveryoneSupported": false
  }
}
```

### `POST /connectors/:id/activate`

Liga, religa ou tira da pausa. Corpo opcional: `code` e `redirectUri`, nos canais da Meta; `phoneNumberPairing`, no WhatsApp Web, para reconectar por código de pareamento naquele número. Mandar `phoneNumberPairing: null` volta ao QR code; sem a chave, vale o número que já estava gravado.

**A resposta é `200` mesmo quando o provedor recusa:** olhe `status` e `errorMessage`.

Resposta `200`:

```json
{
  "connector": {
    "id": "6aee08c135c5f09ba177bead",
    "type": "whatsapp_cloud",
    "name": "Doma Store",
    "status": "failed",
    "active": false,
    "errorMessage": "An access token is required to request this resource.",
    "sendCollaboratorName": false,
    "createdAt": 1793984705703,
    "profileName": "Doma Store",
    "fbStatus": "CONNECTED",
    "qualityRating": "GREEN",
    "businessId": "300000000001",
    "wabaId": "200000000001",
    "phoneNumberId": "100000000001",
    "displayPhoneNumber": "+55 41 3000-1234",
    "phoneNumberDetails": {},
    "phoneNumberList": []
  }
}
```

### `POST /connectors/:id/pause`, `/reload`, `/shutdown`, `/disconnect`

Sem corpo. Todos devolvem `{ "connector": ... }` atualizado. `shutdown` e `disconnect` também abrem o aviso de desconexão da organização, e `activate` o resolve.

Resposta `200`:

```json
{
  "connector": {
    "id": "6aee08c135c5f09ba177beac",
    "type": "whatsapp_web",
    "name": "Doma Store",
    "status": "closed",
    "active": false,
    "errorMessage": null,
    "sendCollaboratorName": true,
    "createdAt": 1793984705697,
    "providerApi": "evolution_api",
    "profileName": "Doma Store",
    "profilePictureUrl": null,
    "numberId": "5541930001234",
    "numberFormatted": "(41) 93000-1234",
    "reactionsSupported": true,
    "deleteForEveryoneSupported": false
  }
}
```

Ação que não existe no tipo:

Resposta `422`:

```json
{
  "error": {
    "code": "connectorTypeMismatch",
    "message": "Esta ação não existe para este tipo de conector."
  }
}
```

Provedor fora do ar, ou ação que a WABA não tem:

Resposta `422`:

```json
{
  "error": {
    "code": "connectorActionFailed",
    "message": "Não foi possível concluir. Tente de novo em instantes."
  }
}
```

### Perfil da WABA: `GET` e `PATCH /connectors/:id/business-profile`

`?phoneNumberId=` escolhe outro número da mesma conta. `PATCH` aceita `about`, `address`, `description`, `email`, `vertical` e `websites` (lista), e devolve o conector relido.

Resposta `200`:

```json
{
  "businessProfile": {
    "about": "Atendimento em Belo Horizonte",
    "address": "Rua da Bahia, 1000",
    "description": "Clínica de nutrição",
    "email": "contato@clinicavida.com.br",
    "profilePictureUrl": "https://cdn.exemplo.com/perfil.jpg",
    "websites": [
      "https://clinicavida.com.br"
    ],
    "vertical": "HEALTH"
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "connectorProviderError",
    "message": "O e-mail não é válido"
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "connectorProviderError",
    "message": "invalid vertical PADARIA. See the supported types in the official documentation https://developers.facebook.com/docs/whatsapp/cloud-api/reference/business-profiles",
    "field": "vertical"
  }
}
```

`POST /connectors/:id/business-profile/picture`, multipart com `file` (JPEG ou PNG) responde `{ "mediaId": "..." }`.

### Números da WABA: `GET /connectors/:id/phone-numbers` e `POST .../phone-numbers/refresh`

`GET` não chama a Meta. `POST .../refresh` relê de lá e guarda.

Resposta `200`:

```json
{
  "phoneNumbers": [
    {
      "id": "123",
      "verifiedName": "Clínica Vida",
      "displayPhoneNumber": "+55 31 3333-0000",
      "qualityRating": "GREEN",
      "isPinEnabled": null,
      "isOfficialBusinessAccount": null,
      "accountMode": null,
      "certificate": null,
      "codeVerificationStatus": null,
      "eligibilityForApiBusinessGlobalSearch": null,
      "nameStatus": null,
      "newNameStatus": null,
      "status": "CONNECTED",
      "searchVisibility": null
    }
  ],
  "primaryPhoneNumberId": "123"
}
```

### Perfil do Instagram: `GET /connectors/:id/instagram-profile`

Relê da Meta e devolve o conector. Se falhar, a resposta é `200` com o que está guardado e o motivo em `refreshError`, um texto técnico que vale só como detalhe:

Resposta `200`:

```json
{
  "connector": {
    "id": "6aee0afba020ece2240219e3",
    "type": "instagram_direct",
    "name": "@lojadaana",
    "status": "active",
    "active": true,
    "errorMessage": null,
    "sendCollaboratorName": false,
    "createdAt": 1793985275909,
    "accountName": "Loja da Ana",
    "profileName": "lojadaana",
    "profilePictureUrl": "https://cdn.exemplo.com/ana.jpg",
    "instagramAccountId": "178414",
    "instagramUsername": "lojadaana",
    "biography": "Roupas feitas à mão",
    "followersCount": 1200,
    "followsCount": 300,
    "mediaCount": 87,
    "website": "https://lojadaana.com.br",
    "accountType": "BUSINESS",
    "authProvider": "instagram_login",
    "linkedMessengerConnectorId": null
  },
  "refreshError": "execution expired"
}
```

---

## Modelos da WABA: `/connectors/:connectorId/templates`

Só em `whatsapp_cloud`; nos outros, `422 connectorTypeMismatch`. A Meta é a fonte da verdade.

### `GET`

Sincroniza com a Meta antes de responder. Se ela falhar, a tela recebe o que está guardado, sem erro. Modelos removidos da conta só saem com `?includeRemoved=true`: campanhas guardam o id deles.

Resposta `200`:

```json
{
  "templates": [
    {
      "id": "6aee0afaa020ece2240219dc",
      "connectorId": "6aee0afaa020ece2240219db",
      "templateId": "meta-1",
      "name": "pedido_saiu_para_entrega",
      "language": "pt_BR",
      "category": "UTILITY",
      "subCategory": null,
      "previousCategory": null,
      "correctCategory": null,
      "rejectedReason": null,
      "qualityScore": {},
      "parameterFormat": null,
      "messageSendTtlSeconds": null,
      "status": "approved",
      "removed": false,
      "removedAt": null,
      "lastSyncedAt": 1793985274951,
      "components": [
        {
          "type": "BODY",
          "text": "Olá, {{1}}! Seu pedido {{2}} saiu para entrega."
        }
      ],
      "headerFormat": "TEXT",
      "headerMediaUrl": null,
      "headerAttachmentId": null,
      "hasMediaHeader": false,
      "hasLocationHeader": false,
      "hasParameters": true,
      "buttons": [],
      "createdAt": 1793985274951,
      "updatedAt": 1793985274951
    }
  ]
}
```

`status`: `approved`, `pending`, `rejected`, `paused`, `disabled`, `in_appeal`, `limit_exceeded`, `archived`, `pending_deletion`, `deleted` e `removed`. Só `approved` deve ser oferecido para envio.

### `POST`

`name` é normalizado para o formato da Meta (`Nome Inválido!` vira `nome_invalido`).

`POST /connectors/:id/templates`:

```json
{
  "name": "lembrete_carrinho",
  "language": "pt_BR",
  "category": "MARKETING",
  "components": [
    {
      "type": "BODY",
      "text": "{{1}}, as peças que você escolheu ainda estão esperando."
    }
  ]
}
```

Resposta `201`:

```json
{
  "template": {
    "id": "6aee0afba020ece2240219de",
    "connectorId": "6aee0afaa020ece2240219db",
    "templateId": "meta-3",
    "name": "lembrete_carrinho",
    "language": "pt_BR",
    "category": "MARKETING",
    "subCategory": null,
    "previousCategory": null,
    "correctCategory": null,
    "rejectedReason": null,
    "qualityScore": {},
    "parameterFormat": null,
    "messageSendTtlSeconds": null,
    "status": "pending",
    "removed": false,
    "removedAt": null,
    "lastSyncedAt": null,
    "components": [
      {
        "type": "BODY",
        "text": "{{1}}, as peças que você escolheu ainda estão esperando."
      }
    ],
    "headerFormat": "TEXT",
    "headerMediaUrl": null,
    "headerAttachmentId": null,
    "hasMediaHeader": false,
    "hasLocationHeader": false,
    "hasParameters": true,
    "buttons": [],
    "createdAt": 1793985275728,
    "updatedAt": 1793985275728
  }
}
```

Quando a Meta recusa:

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Já existe um modelo com esse nome",
    "field": "base",
    "details": {
      "base": [
        "Já existe um modelo com esse nome"
      ]
    }
  }
}
```

### `PATCH /:id` e `DELETE /:id`

`PATCH` manda `components` à Meta, que é o que ela deixa mudar. `DELETE` remove na Meta e aqui, e responde `204`.

Resposta `404`:

```json
{
  "error": {
    "code": "templateNotFound",
    "message": "Modelo de mensagem não encontrado."
  }
}
```

---

## Widget do site: configuração

`/connectors/:connectorId/widget`. Tudo exige `core_settings`, e só vale em `web_widget`.

### `GET` e `PATCH`

`PATCH` aceita `primaryColor`, `position`, `welcomeMessage`, `botAvatarUrl`, `botDisplayName`, `launcherIcon`, `locale`, `rateLimitPerMin`, `preChatFields`, `dailyMessageCap`, `dailyVisitorCap`, `autoPageContext`, `proactiveEnabled`, `launcherImageUrl`, `launcherSize`, as cores (`headerBgColor`, `headerTextColor`, `userBubbleColor`, `userBubbleTextColor`, `assistantBubbleColor`, `assistantBubbleTextColor`, `messageAreaBg`), `bubbleRadius`, `panelRadius`, `fontFamily`, `customCss`, `deliveryMode`, `pinnedVersion`, `allowedOrigins` (lista) e `active` (liga e desliga).

`customCss` é higienizado antes de gravar. `allowedOrigins` vazio aceita qualquer site.

Resposta `200`:

```json
{
  "widget": {
    "primaryColor": "#7C3AED",
    "position": "bottom-right",
    "welcomeMessage": "Oi! Como podemos ajudar?",
    "botAvatarUrl": null,
    "botDisplayName": "Site da Doma Store",
    "launcherIcon": "chat",
    "locale": "pt-BR",
    "preChatFields": "name_phone",
    "autoPageContext": true,
    "proactiveEnabled": true,
    "launcherImageUrl": null,
    "launcherSize": 60,
    "headerBgColor": null,
    "headerTextColor": null,
    "userBubbleColor": null,
    "userBubbleTextColor": null,
    "assistantBubbleColor": null,
    "assistantBubbleTextColor": null,
    "messageAreaBg": null,
    "bubbleRadius": 16,
    "panelRadius": 18,
    "fontFamily": "",
    "customCss": "",
    "id": "6aee08c135c5f09ba177beab",
    "status": "active",
    "active": true,
    "publicToken": "pk_widget_D_wKHiqBcLHxeeqXiGX2AWd4oatxpKTc",
    "rateLimitPerMin": 20,
    "dailyMessageCap": 0,
    "dailyVisitorCap": 0,
    "allowedOrigins": [
      "https://domastore.exemplo.com.br"
    ],
    "deliveryMode": "rolling",
    "pinnedVersion": null,
    "widgetSri": null,
    "cspScriptHash": "'sha256-Xolf+A6zWgg9pH7oAewzLHGNVSdA2i4jaaqrdONMpvA='",
    "cspDirectives": {
      "script-src": "https://widget.vekoo.app 'sha256-Xolf+A6zWgg9pH7oAewzLHGNVSdA2i4jaaqrdONMpvA='",
      "connect-src": "http://localhost:3101 ws://localhost:3101",
      "img-src": "http://localhost:3101 data:",
      "media-src": "http://localhost:3101 data:",
      "style-src": "'unsafe-inline'"
    },
    "cspHeader": "script-src https://widget.vekoo.app 'sha256-Xolf+A6zWgg9pH7oAewzLHGNVSdA2i4jaaqrdONMpvA='; connect-src http://localhost:3101 ws://localhost:3101; img-src http://localhost:3101 data:; media-src http://localhost:3101 data:; style-src 'unsafe-inline'",
    "availableVersions": [
      {
        "version": "1.2.0",
        "sri": "sha384-zjDxcrI1lnGk4tVbafnNHZCo50LgaX+KV8JMKFa/BPJraxGHNaY2jE7EEFsSSs7R",
        "releasedAt": "2026-08-06",
        "notes": "Primeira release versionada e pinável. Inclui allowlist de host para data-api-base/data-cable-url, validação de esquema em media_url, escape de URL em CSS, folha de estilo adotada (CSP sem unsafe-inline) e remoção de query string na captura automática de página."
      }
    ],
    "installSnippet": "<script>\n  window.aiva = window.aiva || function(){(window.aiva.q = window.aiva.q || []).push(arguments)};\n  (function(d,s,p){var w=d.createElement(s);w.async=1;\n  w.src='https://widget.vekoo.app/widget.v1.js';\n  w.dataset.pk=p; d.head.appendChild(w);})\n  (document,'script','pk_widget_D_wKHiqBcLHxeeqXiGX2AWd4oatxpKTc');\n</script>"
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Position não está na lista",
    "field": "position",
    "details": {
      "position": [
        "não está na lista"
      ]
    }
  }
}
```

### `DELETE`

Desliga o widget (`closed`). Não apaga nada, e religar é `PATCH` com `active: true`.

### `POST .../regenerate-token`

Troca `publicToken` e o segredo que assina os JWT. **Quem está no site cai** até o snippet novo entrar. Peça confirmação. Devolve `{ "widget": ... }`.

### `POST .../upload-image`

Multipart com `file` (JPEG, PNG, WebP ou GIF, até 2 MB) e `slot` (`launcher` ou `avatar`). Devolve `{ "widget": ... }`, com a URL absoluta no campo do slot.

Resposta `422`:

```json
{
  "error": {
    "code": "invalidSlot",
    "message": "Destino da imagem inválido.",
    "field": "slot"
  }
}
```

---

## Automação: `/automation-settings`

Como a automação se comporta nas conversas. Na origem era do assistente; aqui é da organização. `GET` é aberto a qualquer sessão, e `PATCH` exige `core_settings` e mescla (o que não vier continua como está).

| Campo | O que faz |
|---|---|
| `automationEnabled` | Desliga todo disparo de fluxo da organização. |
| `defaultAutomationEnabled` | Automação das conversas novas. |
| `automationPausePeriod`, `automationPauseTimeTo` | Quanto a automação fica pausada quando uma pessoa intervém: `minutes`, `hours`, `days` e a quantidade. Com `disabled`, não volta sozinha. |
| `businessWorkEnabled`, `businessWork` | Janela de atendimento. Fora dela o disparo espera a próxima abertura. `dayOfWeek` de `0` (domingo) a `6`. |
| `autoClearContextEnabled`, `autoClearContextInterval` | Limpa o contexto da conversa depois dessa quantidade de horas sem mensagem. |
| `flowDebounceSeconds` | Quanto o fluxo espera a pessoa terminar de escrever, de `0` (sem espera) a `60`; fora disso, vale o limite. Padrão: `3`. `null` volta ao padrão. |
| `timezone` | Só leitura. É o fuso da organização, usado na janela. |

`PATCH /automation-settings`:

```json
{
  "automationPausePeriod": "hours",
  "automationPauseTimeTo": 2,
  "businessWorkEnabled": true,
  "businessWork": {
    "days": [
      {
        "dayOfWeek": "1",
        "enabled": "true",
        "windows": [
          {
            "start": "09:00",
            "end": "18:00"
          }
        ]
      }
    ]
  }
}
```

Resposta `200`:

```json
{
  "automationSettings": {
    "automationEnabled": true,
    "defaultAutomationEnabled": true,
    "automationPausePeriod": "hours",
    "automationPauseTimeTo": 2,
    "businessWorkEnabled": true,
    "businessWork": {
      "days": [
        {
          "dayOfWeek": "1",
          "enabled": "true",
          "windows": [
            {
              "start": "09:00",
              "end": "18:00"
            }
          ]
        }
      ]
    },
    "autoClearContextEnabled": false,
    "autoClearContextInterval": 48,
    "timezone": "America/Sao_Paulo"
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "unprocessable",
    "message": "Janela de atendimento (segunda-feira): o início deve ser anterior ao fim",
    "field": "base",
    "details": {
      "base": [
        "Janela de atendimento (segunda-feira): o início deve ser anterior ao fim"
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
    "message": "Período de pausa da automação inválido",
    "field": "base",
    "details": {
      "base": [
        "Período de pausa da automação inválido"
      ]
    }
  }
}
```

---

## Mídia: `/media/download` e `/media/metadata`

Exigem sessão. `?url=` recebe o `mediaUrl` da mensagem; `?key=`, só o id do objeto.

`/media/download` entrega os bytes com o nome original e `Content-Disposition: attachment`, inclusive de CDN sem CORS. Hosts externos só os de `MEDIA_PROXY_ALLOWED_HOSTS`, inclusive nos redirecionamentos. Até 100 MB. Em um exemplo real: `Content-Disposition: `attachment; filename="semente-foto-0.png"; filename*=UTF-8''semente-foto-0.png``.

`/media/metadata` responde sem baixar os bytes:

Resposta `200`:

```json
{
  "key": "e469to8isfzzbrj4155zxcc4yb7d",
  "filename": "semente-foto-0.png",
  "contentType": "image/png",
  "byteSize": 1195,
  "checksum": "vl/MC1BSoht6JtiFlwf2yQ==",
  "createdAt": 1793984002588,
  "source": "active_storage"
}
```

Resposta `403`:

```json
{
  "error": {
    "code": "mediaHostNotAllowed",
    "message": "Este endereço de mídia não é permitido."
  }
}
```

Resposta `422`:

```json
{
  "error": {
    "code": "mediaReferenceRequired",
    "message": "Informe a URL ou o identificador da mídia."
  }
}
```

---

## Webhooks: `/inbound/*`

Quem chama é o provedor, nunca a tela. Sem sessão. Respondem `200` sem corpo e jogam o trabalho para `Inbound::ProcessWebhookJob` (fila `critical`, 3 tentativas): o provedor nunca espera o processamento.

| Método e caminho | Provedor | Conferência |
|---|---|---|
| `GET`, `POST /inbound/whatsapp-cloud/:id` | WhatsApp Cloud | Desafio com `verificationToken` do conector. Assinatura `X-Hub-Signature-256`. |
| `GET`, `POST /inbound/meta-messaging` | Instagram e Messenger | Desafio com `META_MESSAGING_VERIFY_TOKEN`. Assinatura `X-Hub-Signature-256`. |
| `POST /inbound/evolution/:codename?token=` | Evolution e AIVA | `codename` é `IWA-<id do conector>`. `token`, abaixo. |
| `POST /inbound/lead-chat/:id/event?token=` | LeadChat | `token`, abaixo. |
| `POST /inbound/zapi/:connectorId/on-message-received`, `on-message-send`, `on-whatsapp-disconnected`, `on-whatsapp-connected`, todas com `?token=` | Z-API | `token`, abaixo. |

Evolution, Z-API e LeadChat não assinam o que mandam. O `token` é um HMAC do id do conector, derivado de `secret_key_base` (`Connector::Base#inbound_token`), e vai na URL que a ativação entrega ao provedor. Token ausente ou errado responde `404`, igual a conector que não existe. Conector criado antes disso precisa ter o webhook configurado de novo no provedor. Trocar `secret_key_base` invalida todos, como já invalida os tokens cifrados.

A assinatura vale contra `META_APP_SECRET` ou `INSTAGRAM_APP_SECRET`. Sem nenhum dos dois, em desenvolvimento não há o que conferir, e em produção responde `403 invalidSignature`. Como o webhook de aplicativo da Meta é um só, o `entry.id` do evento escolhe o conector da WABA, e só conta quem a Meta já confirmou: `waba_verified_at`, gravado na ativação. Conector ativado antes disso precisa ser ativado de novo para receber por essa rota. Quem configura o webhook é a própria ativação do canal, exceto Meta, onde a pessoa cola `webhookUrl` e `verificationToken` no painel.

O que acontece com a mensagem recebida, em todos os canais: acha ou cria a conversa pelas variantes do telefone, grava, reabre se a organização pediu, atualiza `lastMessage*`, transmite por `ChatChannel` e `ChatListChannel` e chama `Flows::InboundDispatcher`.

---

## Widget do site: API pública, `/widget/v1`

É o que o script embutido no site do cliente chama. Qualquer origem passa pelo CORS, e a origem é conferida por widget, em `allowedOrigins`. Todos os limites respondem `429`.

**Mudança para o bundle:** `aiva-frontend/widget` falava snake_case e segundos. Este contrato é camelCase e milissegundos, em REST e no canal. O bundle ficou fora desta migração e precisa se adaptar.

As chaves dentro de `context` são dados do site e voltam como vieram, inclusive `captured_at`.

### `GET /widget/v1/config?pk=<publicToken>`

Aparência, sem sessão, para desenhar o botão.

Resposta `200`:

```json
{
  "config": {
    "primaryColor": "#7C3AED",
    "position": "bottom-right",
    "welcomeMessage": "Oi! Como podemos ajudar?",
    "botAvatarUrl": "http://localhost:3101/rails/active_storage/blobs/proxy/eyJfcmFpbHMiOnsiZGF0YSI6IjY1NDAyYjhhLTQzMzMtNGVjMC04YjBjLThkYmJiODA1MGU4NyIsInB1ciI6ImJsb2JfaWQifX0=--64fefa42df7794347d5de42d12d2ef292175eb85/avatar.png",
    "botDisplayName": "Site da Doma Store",
    "launcherIcon": "chat",
    "locale": "pt-BR",
    "preChatFields": "name_phone",
    "autoPageContext": true,
    "proactiveEnabled": true,
    "launcherImageUrl": null,
    "launcherSize": 60,
    "headerBgColor": null,
    "headerTextColor": null,
    "userBubbleColor": null,
    "userBubbleTextColor": null,
    "assistantBubbleColor": null,
    "assistantBubbleTextColor": null,
    "messageAreaBg": null,
    "bubbleRadius": 16,
    "panelRadius": 18,
    "fontFamily": "",
    "customCss": ""
  }
}
```

### `POST /widget/v1/session`

Corpo `{ "pk", "visitorId" }`. `visitorId` é gerado no navegador (UUID) e identifica o visitante. Devolve `visitorJwt` (24 horas), que vai em `Authorization: Bearer` no resto e em `?token=` no cable.

Resposta `200`:

```json
{
  "visitorJwt": "eyJhbGciOiJIUzI1NiJ9.eyJ...",
  "visitorId": "aaaaaaaa-bbbb-4ccc-8ddd-001793984711",
  "config": {
    "primaryColor": "#7C3AED",
    "position": "bottom-right",
    "welcomeMessage": "Oi! Como podemos ajudar?",
    "botAvatarUrl": "http://localhost:3101/rails/active_storage/blobs/proxy/eyJfcmFpbHMiOnsiZGF0YSI6IjY1NDAyYjhhLTQzMzMtNGVjMC04YjBjLThkYmJiODA1MGU4NyIsInB1ciI6ImJsb2JfaWQifX0=--64fefa42df7794347d5de42d12d2ef292175eb85/avatar.png",
    "botDisplayName": "Site da Doma Store",
    "launcherIcon": "chat",
    "locale": "pt-BR",
    "preChatFields": "name_phone",
    "autoPageContext": true,
    "proactiveEnabled": true,
    "launcherImageUrl": null,
    "launcherSize": 60,
    "headerBgColor": null,
    "headerTextColor": null,
    "userBubbleColor": null,
    "userBubbleTextColor": null,
    "assistantBubbleColor": null,
    "assistantBubbleTextColor": null,
    "messageAreaBg": null,
    "bubbleRadius": 16,
    "panelRadius": 18,
    "fontFamily": "",
    "customCss": ""
  }
}
```

Resposta `400`:

```json
{
  "error": {
    "code": "invalidVisitorId",
    "message": "Identificador de visitante inválido.",
    "field": "visitorId"
  }
}
```

### `GET` e `POST /widget/v1/visitor`

O perfil do visitante. `POST` recebe `{ "name", "phone", "email" }`, conforme `preChatFields` do widget, e cria a conversa se preciso.

`POST /widget/v1/visitor`:

```json
{
  "name": "Ana Beatriz",
  "phone": "41999990000",
  "email": "ana@exemplo.com.br"
}
```

Resposta `200`:

```json
{
  "profile": {
    "name": "Ana Beatriz",
    "phone": "41999990000",
    "email": "ana@exemplo.com.br",
    "captured": true
  }
}
```

Resposta `400`:

```json
{
  "error": {
    "code": "missingFields",
    "message": "Preencha os campos obrigatórios.",
    "details": {
      "fields": [
        "phone"
      ]
    }
  }
}
```

### `POST /widget/v1/messages`

Corpo: `{ "content", "clientMessageId"?, "proactiveMessage"?, "visitorName"?, "context"? }`.

`POST /widget/v1/messages`:

```json
{
  "content": "Oi! Vocês têm o vestido midi no M?",
  "clientMessageId": "cli-1",
  "context": {
    "page": {
      "url": "https://domastore.exemplo.com.br/vestido-midi-linho",
      "title": "Vestido Midi de Linho"
    }
  }
}
```

Resposta `201`:

```json
{
  "messageId": "6aee08c7c52c3e668e7ee2ae",
  "chatId": "6aee08c7c52c3e668e7ee2ac",
  "status": "queued"
}
```

Resposta `400`:

```json
{
  "error": {
    "code": "contentRequired",
    "message": "Escreva uma mensagem.",
    "field": "content"
  }
}
```

### `GET /widget/v1/messages?since=<id>`

As 100 mais recentes, em ordem cronológica. Com `since`, só as depois dela.

Resposta `200`:

```json
{
  "messages": [
    {
      "id": "6aee08c7c52c3e668e7ee2ae",
      "role": "user",
      "content": "Oi! Vocês têm o vestido midi no M?",
      "senderName": "Ana Beatriz",
      "createdAt": 1793984711497,
      "context": {
        "page": {
          "url": "https://domastore.exemplo.com.br/vestido-midi-linho",
          "title": "Vestido Midi de Linho",
          "captured_at": "2026-11-06T17:05:11Z"
        }
      }
    }
  ]
}
```

### `PUT /widget/v1/context`

Corpo `{ "context": { "page", "product", "visitor", "events" } }`. Nunca cria conversa: antes da primeira mensagem responde `202` com `{ "stored": false }`, e o widget manda o contexto junto com o próximo `POST /messages`.

Resposta `200`:

```json
{
  "stored": true
}
```

---

## Tempo real

### Conexão

`ws://<api>/cable?token=<token da sessão>`, subprotocolo `actioncable-v1-json`. A origem precisa estar em `FRONTEND_ORIGINS`. No front: `useChannel("ChatChannel", params, handler)`.

Token inválido: `{ "type": "disconnect", "reason": "unauthorized", "reconnect": false }`. Assinatura recusada: `{ "type": "reject_subscription", "identifier": "..." }`.

Validado de ponta a ponta contra o Redis: o webhook entra no Puma, o Sidekiq processa em outro processo e a mensagem chega no WebSocket.

### `ChatChannel`

A conversa aberta. Params: `{ "chatId" }`. Exige `chat`. Conversa que não existe ou é de outra organização é recusada.

**Recebe**, uma mensagem nova ou alterada (status, reação, apagada, conteúdo que chegou depois). **Funda por `id`**, sem tratar como evento à parte.

Mensagem recebida do contato:

```json
{
  "id": "6aee0814109ff006f85e9aec",
  "chatId": "6aee08126ec9f3a898937127",
  "role": "user",
  "roleBaseType": null,
  "typeElement": "text",
  "content": "Mensagem de verdade pelo webhook REAL-1793984532",
  "caption": null,
  "mediaType": null,
  "mediaUrl": null,
  "audioUrl": null,
  "mediaProperties": null,
  "messageId": "REAL-1793984532",
  "messageOrigin": "platform",
  "senderName": null,
  "accountId": null,
  "status": null,
  "statusMessage": null,
  "replyToMessageId": null,
  "reactions": [],
  "contextMessage": {},
  "externalAdReply": null,
  "hasSpan": false,
  "isSpan": false,
  "missingMessage": null,
  "campaignId": null,
  "deletedAt": null,
  "deletedScope": null,
  "createdAt": 1793984532000
}
```

A que a pessoa enviou, depois de o provedor aceitar:

```json
{
  "id": "6aee08148eca2af5d76f85a1",
  "chatId": "6aee08126ec9f3a898937127",
  "role": "assistant",
  "roleBaseType": null,
  "typeElement": "text",
  "content": "Resposta de teste pelo cable",
  "caption": null,
  "mediaType": null,
  "mediaUrl": null,
  "audioUrl": null,
  "mediaProperties": null,
  "messageId": "FAKE-TEXT-1",
  "messageOrigin": "frontend",
  "senderName": "Marina Duarte",
  "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
  "status": "delivery_ack",
  "statusMessage": null,
  "replyToMessageId": null,
  "reactions": [],
  "contextMessage": null,
  "externalAdReply": null,
  "hasSpan": false,
  "isSpan": false,
  "missingMessage": null,
  "campaignId": null,
  "deletedAt": null,
  "deletedScope": null,
  "createdAt": 1793984532971
}
```

Nota do histórico (`role: "base"`):

```json
{
  "id": "6aee08148eca2af5d76f85a0",
  "chatId": "6aee08126ec9f3a898937127",
  "role": "base",
  "roleBaseType": "automation-toggle-notation",
  "typeElement": "text",
  "content": "Marina Duarte pausou a automação.",
  "caption": null,
  "mediaType": null,
  "mediaUrl": null,
  "audioUrl": null,
  "mediaProperties": null,
  "messageId": null,
  "messageOrigin": "platform",
  "senderName": null,
  "accountId": null,
  "status": null,
  "statusMessage": null,
  "replyToMessageId": null,
  "reactions": [],
  "contextMessage": null,
  "externalAdReply": null,
  "hasSpan": false,
  "isSpan": false,
  "missingMessage": null,
  "campaignId": null,
  "deletedAt": null,
  "deletedScope": null,
  "createdAt": 1793984532900
}
```

Com reação:

```json
{
  "id": "6aee0814109ff006f85e9aec",
  "chatId": "6aee08126ec9f3a898937127",
  "role": "user",
  "roleBaseType": null,
  "typeElement": "text",
  "content": "Mensagem de verdade pelo webhook REAL-1793984532",
  "caption": null,
  "mediaType": null,
  "mediaUrl": null,
  "audioUrl": null,
  "mediaProperties": null,
  "messageId": "REAL-1793984532",
  "messageOrigin": "platform",
  "senderName": null,
  "accountId": null,
  "status": null,
  "statusMessage": null,
  "replyToMessageId": null,
  "reactions": [
    {
      "emoji": "👍",
      "from": "assistant",
      "senderName": "Marina Duarte",
      "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
      "reactedAt": 1793984533048
    }
  ],
  "contextMessage": {},
  "externalAdReply": null,
  "hasSpan": false,
  "isSpan": false,
  "missingMessage": null,
  "campaignId": null,
  "deletedAt": null,
  "deletedScope": null,
  "createdAt": 1793984532000
}
```

Reação recusada, para reverter a atualização otimista. É o único evento com `event`:

```json
{
  "event": "message_reaction_failed",
  "id": "6aee0814109ff006f85e9aec",
  "reactions": [
    {
      "emoji": "👍",
      "from": "assistant",
      "senderName": "Marina Duarte",
      "accountId": "b56a981d-00e7-5f4f-a618-de6c0a991000",
      "reactedAt": 1793984533048
    }
  ],
  "errors": [
    "A reação deve ser um único emoji."
  ]
}
```

**Envia**, por `perform`:

| Ação | Dados | Efeito |
|---|---|---|
| `send_message` | `{ chatId, message, replyToMessageId? }` | Pausa a automação (é intervenção humana) e envia. Volta pelo próprio canal, primeiro sem `status` e depois com ele. |
| `send_reaction` | `{ chatId, messageId, emoji }` | Emoji vazio remove. Só Evolution (`reactionsSupported`). Sucesso volta como mensagem com `reactions`. Falha, como `message_reaction_failed`. |
| `send_template_message` | `{ chatId, templateId, components }` | `templateId` é o `templateId` da Meta. Pausa a automação e envia o modelo. |

`components` vai no formato da Meta. Variável com nome leva `parameter_name`: `{ "type": "body", "parameters": [{ "type": "text", "parameter_name": "nome", "text": "Ana" }] }`. Cabeçalho de texto com variável é `{ "type": "header", "parameters": [...] }`, botão de link dinâmico é `{ "type": "button", "sub_type": "url", "index": "0", "parameters": [...] }`, e cabeçalho de mídia o servidor preenche sozinho.

Falha no envio de texto ou de modelo volta na própria mensagem, com `status: "failed"` e o motivo em `statusMessage`.

Uma mensagem longa pode sair em partes: a original (`hasSpan: true`) não é transmitida, e cada parte chega com `isSpan: true`.

### `ChatListChannel`

A lista de conversas. Sem params. Exige `chat`. `chat_list_to` decide o que chega: `all` recebe tudo; `team`, as dos departamentos da pessoa e as sem dono; `assigned`, as dela e as sem dono. Outro valor é recusado.

| Evento | Payload |
|---|---|
| Criada ou alterada | `{ "action": "upsert", "event": <Conversa> }` |
| Removida da lista | `{ "action": "remove", "event": { "id" } }` |
| Resposta de `request_recent` | `{ "action": "recent_chats", "events": [<Conversa>] }` |

```json
{
  "action": "upsert",
  "event": {
    "id": "6aee08126ec9f3a898937127",
    "connectorId": "6aee08126ec9f3a89893710a",
    "audienceId": "6aee08126ec9f3a898937128",
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
    "teamId": "4dde7efe-ad89-470c-9457-39253fd68dd0",
    "unreadMessages": 1,
    "senderPhoneNumberId": null,
    "sessionStartAt": 1793891220000,
    "activeSession": false,
    "lastMessageAt": 1793984532000,
    "lastMessageFrom": "0s",
    "lastMessageType": "text",
    "lastMessageBy": "user",
    "lastMessageContent": "Mensagem de verdade pelo webhook REAL-1793984532",
    "notes": null,
    "tagIds": [
      "6aee08126ec9f3a898937112",
      "6aee08126ec9f3a898937110"
    ],
    "customAttributes": {},
    "funnelStages": {},
    "createdAt": 1793891220000,
    "updatedAt": 1793984530615
  }
}
```

**Envia:** `request_recent`, sem dados, para refazer as 30 mais recentes ao reconectar, sem recarregar a lista.

### `ConnectorsChannel`

A conexão de um canal. Params: `{ "connectorId" }`. Exige `core_settings`, porque com o QR code qualquer um conecta o próprio WhatsApp ao canal. Ao assinar, já recebe o QR code guardado, se houver, com o código de pareamento junto: quem assina depois do webhook não fica sem ele.

| `status` | Payload | Significa |
|---|---|---|
| `qr_updated` | `{ status, base64, pairCode }` | QR code novo. `pairCode` só vem quando a conexão pediu código de pareamento. Na Evolution ele chega como `qrcode.pairingCode`, tanto na resposta de criar a instância quanto no webhook. |
| `success_scan` | `{ status, base64: "" }` | Leu e conectou. Releia o conector. |
| `qr_timeout` | `{ status, base64: "" }` | Expirou. O conector fica `failed`. |
| `qr_error` | `{ status, error }` | Z-API recusou gerar o QR code. |

```json
{
  "status": "qr_updated",
  "base64": "data:image/png;base64,QRDETESTE",
  "pairCode": "ABCD-1234"
}
```

```json
{
  "status": "success_scan",
  "base64": ""
}
```

**Envia:** `generate_qr_code`, sem dados, a cada 8 segundos na tela de QR da Z-API, que invalida o código em 20. Nos outros provedores não faz nada.

### `Widget::ChatChannel`

O visitante no site, em servidor próprio: `ws://<api>/widget-cable?token=<visitorJwt>`, sem params. Origem conferida por `allowedOrigins`, com até 60 conexões por minuto, por IP.

| `type` | Payload |
|---|---|
| `message` | `{ type, role, messageId, content, sentAt, senderName?, context?, mediaType?, mediaUrl? }` |
| `presence` | `{ type, value: "composing" \| "paused" }` |

O eco do que o próprio visitante enviou, útil em outra aba:

```json
{
  "type": "message",
  "role": "user",
  "messageId": "6aee08158eca2af5d76f85a4",
  "content": "Oi, sou o visitante do teste",
  "sentAt": 1793984533512,
  "context": null
}
```

A resposta de quem atende, em que `senderName` é o nome do widget e não o da pessoa:

```json
{
  "type": "message",
  "role": "assistant",
  "messageId": "7c94170d-6ffe-453c-88c8-89ee1200cecf",
  "content": "Resposta de quem atende, por outro processo",
  "senderName": "Site da Doma Store",
  "sentAt": 1793984534973
}
```

---

## Conversa e mensagem

### Conversa (`ChatSerializer`)

O mesmo formato em `ChatListChannel` e no ponto de partida da API do domínio inbox. Campos que pedem explicação:

| Campo | Observação |
|---|---|
| `externalId`, `phoneNumber` | O identificador no canal. Telefone só com dígitos, nos canais de WhatsApp. |
| `audienceType` | `whatsapp_api`, `instagram`, `facebook` ou `web`. |
| `status` | `open` ou `closed`. Mensagem nova pode reabrir, conforme `reopen_conversation_on_inbound_enabled` da organização. |
| `automationEnabled`, `automationResumeAt` | Pausada, e quando volta sozinha (`null` se não volta). |
| `activeSession` | `sessionStartAt` nas últimas 24 horas. Fora disso, a WABA só aceita modelo. |
| `tagIds` | Ids de `ChatTag`. |
| `unreadMessages`, `lastMessage*` | A prévia da lista, já calculada. |
| `lastMessageFrom` | Tempo relativo curto, como `5m`. |
| `funnelStages` | Reservado ao domínio pipelines. |

### Mensagem (`ChatMessageSerializer`)

| Campo | Valores |
|---|---|
| `role` | `user` (contato), `assistant` (nosso lado), `base` (nota do histórico). |
| `typeElement` | `text`, `image`, `audio`, `media`. |
| `messageOrigin` | `frontend` (pessoa, pela tela), `platform` (o resto). |
| `status` | Só nas nossas: `pending`, `server_ack`, `delivery_ack`, `read`, `failed`. Nunca regride. |
| `statusMessage` | Motivo da falha, pronto para mostrar. Também vem sem falha, com `status` de enviada, quando a mensagem citava um anexo que não existe mais: o resto foi. Dividida em partes, o aviso fica na última. A mudança chega por `ChatChannel`. |
| `deletedAt`, `deletedScope` | Apagada. A tela mostra o aviso no lugar do conteúdo. |
| `replyToMessageId` | Id (Mongo) da mensagem citada. |
| `reactions` | `[{ emoji, from, senderName, accountId, reactedAt }]`, no máximo uma por lado. |
| `externalAdReply` | Cartão do anúncio de onde o contato veio. |
| `missingMessage` | `true` enquanto o WhatsApp não entregou o conteúdo, e a mensagem volta por `ChatChannel` quando chega. |
| `campaignId` | Id da campanha que enviou (texto, sem associação). |

`roleBaseType`, em `role: "base"`: `assigned-user-notation`, `automation-toggle-notation`, `automation-stopped`, `context-clear`, `context-fup`, `waiting-message`, `instagram-ad-greeting` (com `externalAdReply`), `widget-context` (com `contextMessage`) e `error`.

**Agrupar mídia em grade é da tela:** mídias consecutivas sem legenda, do mesmo `role` e `senderName`, com `createdAt` a até 2 minutos.

---

## Como outros domínios enviam mensagem e criam conversa

Esta é a interface pública de Ruby. Agenda, campanhas, fluxos, pipelines e chat API usam isto e não falam direto com o provedor.

### Regras do Mongo

- **Nunca carregue por id vindo de fora sem a organização:** `Chat.scoped(organization.id, id)` e `Connector::Base.scoped(organization.id, id)`, que devolvem `nil` se for de outra.
- Mensagem sempre pela conversa: `ChatMessage::Base.where(chat_id: chat.id)`. Para a lista da tela, `.visible.order_by(created_at: :asc)`.
- Job recebe o escopo junto com o id: `perform_later(chat.id.to_s, organization.id)`.
- Sem `.first` ou `.last` sem `order_by`. Use `.take`.
- Da organização: `organization.chats`, `organization.connectors`, `organization.chat_tags`. Conversas e canais estão no Mongo, por isso são consultas e não `has_many`.

### Achar ou criar a conversa

```ruby
connector = Connector::Base.scoped(organization.id, connector_id)

chat = Chats::Locator.find_or_create(
  connector: connector,
  phone: "+55 (31) 97181-0932",
  attributes: { user_name: "Fernanda Lima" } # só usados se precisar criar
)

Chats::Locator.find(connector: connector, phone: "553171810932") # a mesma conversa, ou nil
```

- **Sempre por aqui.** O 9º dígito (`553171810932` e `5531971810932`), máscara e o sufixo `@s.whatsapp.net` são cobertos, e duas chamadas simultâneas não abrem duas conversas.
- **O número precisa vir com o DDI.** `(31) 97181-0932` sem o `55` grava `31971810932`: outra conversa, em um número que o WhatsApp não conhece. Nada adivinha o país.
- Na WABA, passe `sender_phone_number_id:` quando a conta tiver vários números: cada número tem a própria conversa com o contato.
- A conversa nova herda `default_automation_enabled` da organização, e `attributes` pode sobrescrever.

Em canal sem telefone (Instagram, Messenger, `@lid`), com a mesma trava:

```ruby
chat = Chats::Locator.create_once("#{connector.id}.#{psid}", find: -> { Chat.where(connector_id: connector.id, external_id: psid).take }) do
  Chat.create!(connector: connector, organization_id: connector.organization_id, external_id: psid, status: "open")
end
```

### Enviar texto

```ruby
message = chat.send_text_message("Seu horário é amanhã às 9h", "Agenda", { campaign_id: campaign.id.to_s })
# => ChatMessage::Text, com message_id do provedor e status "pending"
```

- Assinatura: `send_text_message(text, sender_name = nil, attributes = {})`. Sem `sender_name`, vale o nome da organização.
- **Levanta quando o canal levanta** (Evolution, por exemplo): a mensagem já está gravada como `failed`, com a causa, e a exceção segue para você decidir sobre nova tentativa.
- **A recusa da Meta não levanta:** a mensagem volta `failed`, com o motivo em `status_message`. Olhe `message.status` no retorno.
- Atualiza a prévia e sobe a conversa na lista. Não mexe na automação.

Quando não deve subir na lista nem levantar (lembrete, por exemplo):

```ruby
external_id = chat.send_text_message_without_event("Lembrete", "Agenda", false)
# => o id do provedor, ou nil se falhou. O terceiro argumento: false não sobe a conversa
```

### Enviar como uma pessoa

```ruby
Chats::SendOperatorMessage.call(chat: chat, account: account, text: "Oi, Fernanda!", reply_to_message_id: nil)
```

É o que `send_message` do `ChatChannel` usa: **pausa a automação** pelo período da organização, assina com o nome da pessoa, quebra em partes quando precisa e leva a citação à primeira parte.

### Enviar modelo (só WABA)

```ruby
template = chat.connector.whatsapp_templates.available.where(name: "pedido_saiu_para_entrega").take

message = Chats::SendTemplate.call(
  chat: chat,
  template: template,
  components: [ { type: "body", parameters: [ { type: "text", text: "Roberto" }, { type: "text", text: "48213" } ] } ],
  sender_name: "Campanha de Natal",        # ou account: account, quando foi uma pessoa
  attributes: { campaign_id: campaign.id.to_s }
)
# => a mensagem, com o texto preenchido em content. status "delivery_ack", ou "failed" com o motivo
```

- **Não levanta:** a recusa da Meta fica em `status` e `status_message`. Olhe `message.status`.
- `components` no formato da Meta. Cabeçalho de mídia é preenchido a partir do modelo.
- Se a Meta recusar o idioma (132001), tenta nos idiomas disponíveis do modelo e corrige o registro.
- Não mexe na automação.

### Enviar mídia

```ruby
blob = Media::Storage.store_io(file, filename: "tabela.pdf", content_type: "application/pdf")
media = MediaMessageDto.new("document", "tabela.pdf", nil, nil, "Nossa tabela", media_url: Media::Storage.path_for(blob))

message = Chats::SendMedia.call(chat: chat, media: media, sender_name: "Campanha", attributes: { campaign_id: campaign.id.to_s })
# => ChatMessage::Media, status "delivery_ack", ou "failed" com o motivo
```

- `media_type`: `image`, `audio`, `video` ou `document`. `audio` sai como áudio gravado.
- Guarde o **caminho** (`Media::Storage.path_for`), e a URL absoluta é montada na hora, com `BACKEND_URL`: o provedor precisa alcançar esse endereço.
- Não levanta e não mexe na automação.

### Pausar, retomar e etiquetar

```ruby
chat.pause_automation_for_human!        # pelo período de automation_pause_period
chat.disable_automation_to("hours", 2)  # período explícito. Fora de minutes, hours ou days, não volta sozinha
chat.update(automation_enabled: true)   # retoma, com a nota no histórico

chat.add_tag!("urgente", color: "#dc2626")
chat.sync_system_tags!(:deal, :won)     # grupos exclusivos: :deal (:won, :lost), :attendance (:show, :no_show)
ChatTag.system_tag!(:professional, organization.id)

chat.clear_context!                     # registra a limpeza de contexto no histórico
```

A automação volta sozinha por `EnableContactJob`, que confere um token: pausa mais nova invalida a anterior. Escrever `updated_by_account` antes de um `update` faz a nota dizer quem foi.

### Reação e apagar

```ruby
Messages::ReactionService.new(message: message, emoji: "👍", account: account).call
Messages::DeletionService.new(message: message).call                                     # para todos
Messages::BulkDeletionService.new(chat: chat, message_ids: ids, scope: "everyone", account: account).call
```

Todos devolvem um resultado com `success?` e `errors`, já traduzidos. Em lote, se alguma mensagem não puder ser apagada para todos (só Z-API, só as nossas, em até 60 horas), o lote inteiro cai para `me`, que apaga só daqui: olhe `scope_applied`.

### Receber: o ponto de entrada da automação

Todo canal termina em `Chats::InboundFlow`, que chama:

```ruby
Flows::InboundDispatcher.call(chat: chat, text: "Quero marcar", event: "first_message", message_id: "EXT-1")
```

- O corpo é do domínio automation (`docs/migration/api/automation.md`), com debounce. Em `event`: `first_message`, `message_received`, e também `human_handoff` e `contact_created`, que nascem na própria conversa.
- `text` é a legenda ou a transcrição, nas mídias.
- Só chega quando pode rodar: automação ligada na conversa e na organização, conector `active`, contato sem bloqueio por excesso de mensagens e dentro da janela de atendimento. Fora dela, `Chats::DispatchInboundJob` adia para a próxima abertura.
- A mensagem já está gravada e transmitida quando ele é chamado.

Canal novo, ou mensagem criada por outro caminho:

```ruby
message = ChatMessage::Text.create!(role: "user", content: "Quero marcar", chat: chat, message_id: "EXT-1")
Chats::InboundFlow.call(chat: chat, message: message, text: "Quero marcar", first_message: true)
```

### Tempo real

Mensagem transmite sozinha ao ser criada e quando `status`, `deleted_at`, `reactions` ou `missing_message` mudam. Conversa, em `chat.dispatch_event!` (upsert) e `chat.dispatch_removal!`. `ignore_events: true` silencia os dois, em carga em lote e semente.

### Onde cada domínio pendura o que é seu

| Ponto | Para quê |
|---|---|
| `ChatRelations::Inbox`, `Pipelines`, `Agenda`, `Outreach`, `Automation` (`app/models/concerns/chat_relations/`) | Concerns vazias, já incluídas em `Chat`. Associações e métodos de cada domínio entram na sua, sem disputar `chat.rb`. |
| `ChatMessage::Base#campaign_id` | Texto, sem associação. Passe em `attributes:`. |
| `Chat#flow_data`, `flow_next_node_id`, `funnel_stages`, `widget_context` | Campos prontos para fluxos e pipelines. |
| `Media::AttachmentLookup` | Único ponto que toca em `Attachment`, do domínio inbox. Quando ele existir, basta a interface descrita ali. |
| `ConnectorEventService` | Avisa conectores de eventos da agenda. Os nomes de campo de serviço e profissional precisam ser ligados aos do domínio agenda. |
| `chat.contact` | `Contact` sem coleção: `id`, `external_id`, `name`, `phone`, `profile_picture_url`, tirados da conversa. |
| `organization.automation_enabled?`, `default_automation_enabled`, `automation_pause_period`, `business_work_enabled`, ... | O que na origem vinha do assistente. Ver `OrganizationRelations::Connectors`. |

Conector, para quem precisar falar direto com o canal: `send_text_message(to, text, chat = nil, reply_to_external_id: nil)`, `send_media_message(to, media_dto, chat = nil)`, `send_audio_message_by_url(to, url, chat = nil)`, `mark_read_message(to, message_id)` e `send_presence(to, presence)`. Mas isso não grava histórico: prefira o que está acima.

---

## Semente

`db/seeds/connectors.rb`, na organização de `marina.duarte@exemplo.com.br`, com a Doma Store. É idempotente, sem credencial nem rede.

- **Canais:** widget ativo (o único que funciona de ponta a ponta sem provedor: dá para responder às conversas dele), WhatsApp Web `closed` (`evolution.invalid`), WABA e Instagram `inactive`. Enviar pelos desligados termina em `failed`.
- **30 conversas e 77 mensagens** espalhadas por 27 dias: texto, imagem, áudio, documento, reação, citação, apagada, recusada pela janela de 24 horas, cartão de anúncio, notas, atribuição, departamentos, abertas, fechadas e não lidas.
- **9 etiquetas**, inclusive `ganho` e `perdido`, e **4 modelos** (aprovados, pendente e removido).
- As imagens, o áudio e o PDF são gerados em Ruby: quadrados de cor, um tom de dois segundos e um PDF em branco. As mídias são arquivos de verdade, e dá para baixar.

A semente não preenche `DailyChatStat`: o formato de `metrics` é do domínio insights.

---

## Para o deploy

- **Índices do Mongo:** `bin/rails db:mongoid:create_indexes` antes de receber tráfego. As buscas por conversa dependem deles.
- `ffmpeg` é opcional: sem ele, o áudio da WABA fica em ogg, que nem todo navegador toca.
- Jobs recorrentes em `config/schedule/connectors.yml`: `InstagramTokenRefreshJob` (ligado) e `InstancesReloadJobs` (desligado, como na origem).

| Variável | Para quê |
|---|---|
| `BACKEND_URL` | URL pública da API: webhooks e mídia que os provedores buscam. Precisa ser alcançável de fora. |
| `META_APP_ID`, `META_APP_SECRET` | App da Meta. O segredo também confere a assinatura dos webhooks. |
| `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` | App do Instagram Login, que é outro. |
| `META_MESSAGING_VERIFY_TOKEN` | Desafio do webhook de Instagram e Messenger. |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY` | Servidor da Evolution. |
| `WHATSAPP_API_URL`, `WHATSAPP_API_KEY` | Servidor do provider AIVA. |
| `WHATSAPP_WEB_DEFAULT_PROVIDER` | Provedor padrão do WhatsApp Web. |
| `ZAPI_ACCOUNT_TOKEN`, `ZAPI_CLIENT_TOKEN` | Conta da Z-API. |
| `OPENAI_ACCESS_TOKEN` | Transcrição de áudio pelo Whisper. Sem ela, o áudio fica sem transcrição. |
| `MEDIA_PROXY_ALLOWED_HOSTS` | Hosts externos aceitos em `/media/*`. |
| `WIDGET_BASE_URL`, `WIDGET_API_BASE_URL`, `WIDGET_ASSETS_BASE_URL` | De onde o snippet do widget carrega o script e fala com a API. |

---

## Limitações conhecidas

- **`presence.update`** da Evolution vai para `ChatChannel` como `{ event: "presence", value }` (`composing`, `recording`, `paused`, `available`) e fica 10 s em cache, em `presence.<chatId>`, para a automação. É o único provedor que informa "digitando": nos outros, a tela só não mostra.
- **Mídia sem id do provedor:** o LeadChat devolve `nil` no tempo esgotado ignorado, e a mensagem fica `delivery_ack`.
- **`/media/*` não confere a organização:** o acesso é por chave ou id assinado, como capacidade.
- **Vídeo e figurinha recebidos na WABA** não viram mensagem, como na origem.
- **`allowedOrigins`** compara o endereço exato, sem curinga de subdomínio.
- Mensagem em branco de quem atende cria uma mensagem vazia e pausa a automação, como na origem. Bloqueie na tela.
- `message` em erro de validação pode trazer o nome do campo em inglês (`Position não está na lista`), porque os campos do Mongo não têm tradução. Traduza por `field` e `details`.
