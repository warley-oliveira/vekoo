# Contrato da API: domínio "agenda"

O calendário: calendários, agendamentos, profissionais, serviços, turmas, sequências de comparecimento, lembretes, Google Agenda e as ações agendadas da conversa. As respostas de exemplo são reais, capturadas com Puma, Sidekiq e um cliente HTTP e WebSocket contra a semente. A exceção é o Google, que não tem credencial em desenvolvimento: `authorizationUrl` aparece abreviado, e o resto daquele fluxo foi exercitado com a biblioteca real e a rede fechada.

Nomes de domínio, para quem vem da origem: `Appointment` é agendamento (`Agenda::Booking`), `Collaborator` é profissional (`Agenda::Professional`), `Service` continua **serviço** na API (a classe é `Agenda::Offering`, para não confundir com service object), `Conversation` é conversa (`Chat`).

## Regras gerais

- **A organização vem da sessão.** Nenhuma URL leva o id dela. Id de outra organização responde `404`, sem dizer que existe. Quando o id vem no corpo (profissional, serviço, conversa de um agendamento), responde `422` no campo.
- **Entrada com envelope**, em camelCase: `{ "calendar": { "name": "..." } }`. As ações pequenas leem os campos soltos e estão marcadas aqui.
- **Saída** em camelCase. Ids são texto. Datas em **milissegundos**, com duas exceções que são dias e não instantes: `startDate` e `endDate` da turma, em `AAAA-MM-DD`.
- **Listagens** têm `{ <recurso>: [...], meta: { page, perPage, total, totalPages, hasMore } }`, com `?page=` e `?perPage=`. Até 100 por página, e 100 é o padrão aqui. `GET /calendar-events` não é paginado: quem limita é o intervalo.

### Fuso (leia antes de escrever a tela)

- Cada calendário tem `timeZone`, um nome IANA (`America/Sao_Paulo`). A origem usava um deslocamento inteiro (`-3`), que este contrato recusa com `422`.
- O servidor roda em UTC e nada depende disso: janelas, aulas e lembretes valem como **hora de parede no fuso do calendário**.
- **Mostrar** um horário: milissegundos formatados com `Intl`, no `timeZone` do calendário do evento. No fuso do navegador, uma pessoa viajando veria outra hora.
- **Mandar** um horário, em qualquer `start` e `end`:
  - milissegundos, os mesmos que a API devolve;
  - ISO-8601 com deslocamento (`2026-11-10T14:00:00-03:00`): vale o instante;
  - sem deslocamento (`2026-11-10 14:00`): vale a hora de parede no fuso do calendário.
- Em `GET /calendar-events`, `month-counts` e `/dashboard/calendar-stats`, que podem cruzar calendários, texto sem deslocamento e os agrupamentos por dia usam o fuso da organização.

### Permissões

| Recurso | Vale para |
|---|---|
| `calendar` | Tudo em `/calendars`, `/calendar-events`, `/professionals`, `/services`, `/class-sessions`. O nível `own` vale como `all`: a origem não tinha esse recorte. |
| `chat` | `/chats/:chatId/scheduled-actions`. |
| `dashboard` **ou** `calendar` | `/dashboard/calendar-stats`. |

`GET /calendar-events?chatId=` continua exigindo `calendar`. O painel do chat precisa conferir `useCan("calendar")` antes de pedir os agendamentos do contato: quem só tem `chat` recebe `403`.

### Erros

Sempre `{ "error": { "code", "message", "field?", "details?" } }`. `code` é o contrato de máquina, e `message` já vem no idioma da requisição.

```json
{ "error": { "code": "unauthorized", "message": "Você precisa entrar para continuar." } }
{ "error": { "code": "notFound", "message": "Não encontrado." } }
{
  "error": {
    "code": "unprocessable",
    "message": "Nome não pode ficar em branco",
    "field": "name",
    "details": {
      "name": ["não pode ficar em branco"],
      "timeZone": ["não é um fuso horário conhecido. Use um nome como America/Sao_Paulo."]
    }
  }
}
```

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `parameterMissing` | Faltou o envelope ou um campo obrigatório solto (`chatId`, `sequenceId`, `bookingId`, `code`, `attendanceSequences`). |
| 401 | `unauthorized` | Sem sessão. |
| 403 | `forbidden` | Sem a permissão do recurso. |
| 404 | `notFound` | Não existe, ou é de outra organização. |
| 409 | `busy` | Simulação com IA enquanto outra geração da organização está em voo. |
| 422 | `unprocessable` | Validação, com `field` e `details`. |
| 422 | `invalidTime` | Horário que não dá para ler. |
| 422 | `rangeTooLong` | Intervalo de mais de 400 dias em `GET /calendar-events` e `month-counts`: as aulas são calculadas dia a dia. |
| 422 | `conflict` | Dois cliques ao mesmo tempo: quem chegou depois. |
| 422 | `noAvailability` | Sem horário livre em 30 dias. |
| 422 | `classGroupFull` | Turma cheia. |
| 422 | `alreadyInSession` | O contato já está nesta aula. |
| 422 | `invalidSlot` | O horário pedido não está na grade da turma. |
| 422 | `invalidAttendanceStatus` | Presença em lote com situação que não existe. |
| 422 | `bookingWithoutChat`, `bookingNotActive`, `sequenceNotFound`, `sequenceDisabled`, `sequenceMismatch`, `sequenceWithoutSteps` | Inscrição em sequência e simulação. |
| 422 | `noCredits` | Simulação com IA sem créditos. |
| 422 | `googleNotConfigured`, `invalidState`, `googleNotStarted`, `googleAuthorizationFailed`, `googleConnectionFailed` | Conexão com o Google. |
| 503 | `failed` | A simulação com IA não saiu. O crédito volta. |

---

## Mapa dos endpoints

| Método e caminho | O que faz |
|---|---|
| `GET` `POST /calendars`, `GET` `PATCH /calendars/:id` | Calendários. |
| `POST /calendars/:calendarId/google-calendar/connect` | Começa a conexão com o Google. |
| `POST /calendars/:calendarId/google-calendar/callback` | Termina a conexão. |
| `DELETE /calendars/:calendarId/google-calendar` | Desconecta. |
| `GET /calendars/:calendarId/availability` | Horários livres de um serviço. |
| `GET` `PUT /calendars/:calendarId/attendance-sequences` | Sequências de comparecimento. |
| `GET .../attendance-sequences/bookings`, `POST .../attendance-sequences/preview` | Testar um passo. |
| `GET .../contact-notification-preview/bookings`, `POST .../contact-notification-preview` | Testar um lembrete. |
| `GET` `POST /calendars/:calendarId/professionals`, `GET` `PATCH` `DELETE .../:id` | Profissionais. |
| `GET /professionals` | Os de todos os calendários da organização. |
| `GET` `POST /calendars/:calendarId/services`, `GET` `PATCH` `DELETE .../:id` | Serviços. |
| `GET /services` | Os de todos os calendários da organização. |
| `GET` `POST /calendars/:calendarId/class-groups`, `GET` `PATCH` `DELETE .../:id` | Turmas. |
| `GET` `POST .../class-groups/:classGroupId/sessions`, `GET` `PATCH .../:id`, `POST .../:id/cancel` | Aulas. |
| `GET` `POST .../class-groups/:classGroupId/enrollments`, `DELETE .../:id` | Inscrições. |
| `GET` `POST /class-sessions/:classSessionId/attendances`, `PUT` `DELETE .../:id` | Presença. |
| `GET .../attendances/schedule`, `POST .../attendances/bulk-update` | Grade da turma e presença em lote. |
| `GET` `POST /calendar-events`, `PATCH` `DELETE /calendar-events/:id` | O calendário em si. |
| `GET /calendar-events/month-counts`, `GET /calendar-events/filters` | Mini calendário e painel de filtros. |
| `POST` `DELETE /calendar-events/:id/sequence` | Inscrever e tirar de uma sequência. |
| `GET /dashboard/calendar-stats` | O bloco do calendário no dashboard. |
| `GET /chats/:chatId/scheduled-actions`, `DELETE .../:id` | O que a conversa ainda vai enviar. |
| `POST /inbound/google-calendar/:id` | O aviso do Google, sem sessão. |

Canal de tempo real: `AgendaChannel`. E dois eventos novos em `ChatChannel`.

---

## Calendários: `/calendars`

`calendarType` é `professional` (agenda por profissional) ou `class_group` (turmas). **Não há `DELETE`:** a origem respondia `204` sem apagar nada, e apagar um calendário leva junto agendamentos e histórico. Precisa de decisão de produto.

### `GET /calendars` e `GET /calendars/:id`

```json
{
  "id": "6aee1e4afadc616d2b03c524",
  "name": "Estúdio Doma",
  "description": "Provas, ajustes e consultorias com hora marcada.",
  "timeZone": "America/Sao_Paulo",
  "calendarType": "professional",
  "color": "#b06046",
  "rebalancingPeriod": "week",
  "professionalNotificationsSettings": [
    { "timeBefore": 1, "period": "hours", "message": "Daqui a pouco: {{servico}} com {{nome}}, às {{hora}}.", "push": true, "whatsapp": false }
  ],
  "professionalEventNotifications": [],
  "professionalEventRules": [
    { "push": true, "whatsapp": true, "message": "Olá, {{profissional}}! Você tem um novo agendamento com {{nome}} em {{data}} às {{hora}}.", "event": "created" },
    { "push": true, "whatsapp": true, "message": "Olá, {{profissional}}. O agendamento com {{nome}} em {{data}} às {{hora}} foi cancelado.", "event": "canceled" },
    { "push": false, "whatsapp": true, "message": "Olá, {{profissional}}. O agendamento com {{nome}} mudou de horário: agora é {{data}} às {{hora}}.", "event": "rescheduled" }
  ],
  "professionalWhatsappConnectorId": null,
  "schedulingNotificationEnabled": true,
  "schedulingNotificationConfig": [
    { "interval": 1, "period": "days", "message": "Oi, {{nome}}! Passando para lembrar: amanhã, às {{hora}}, é o seu horário de {{servico}} aqui no Estúdio Doma. Se precisar remarcar, é só responder esta mensagem." },
    { "interval": 2, "period": "hours", "message": "{{nome}}, te esperamos daqui a pouco, às {{hora}}, para {{servico}} com {{profissional}}. Estamos na Rua Pernambuco, 1.000, na Savassi." }
  ],
  "schedulingNotificationReactivateAutomation": false,
  "schedulingNotificationIgnoreAutomationPaused": false,
  "attendanceSequences": [ ... ],
  "googleCalendarAvailable": false,
  "googleCalendarConnected": false,
  "googleCalendarConnector": null,
  "createdAt": 1793990218558,
  "updatedAt": 1793990218558
}
```

- `rebalancingPeriod`: `day`, `week` ou `month`, o período em que a distribuição dos serviços é contada.
- `attendanceSequences`: o mesmo de `GET .../attendance-sequences`.
- `professionalEventRules`, **só leitura**: as três regras já resolvidas contra os padrões. É daqui que a tela lê; `professionalEventNotifications` é só o que foi mudado. `push` em `rescheduled` nasce desligado, como na origem.
- `googleCalendarAvailable`: o servidor tem as credenciais do Google. Falso, esconda o botão de conectar.
- `googleCalendarConnector`: `{ id, type, status, googleEmail, connectedAt, errorMessage }`, ou `null`.

### `POST /calendars` e `PATCH /calendars/:id`

`POST` responde `201`, e `PATCH` responde `200`, os dois com o calendário.

```json
{
  "calendar": {
    "name": "Teste de ponta a ponta",
    "description": null,
    "timeZone": "America/Sao_Paulo",
    "calendarType": "professional",
    "color": "#123456",
    "rebalancingPeriod": "week",
    "schedulingNotificationEnabled": true,
    "schedulingNotificationReactivateAutomation": false,
    "schedulingNotificationIgnoreAutomationPaused": false,
    "schedulingNotificationConfig": [
      { "interval": 1, "period": "days", "message": "Oi, {{nome}}! É amanhã, às {{hora}}.", "aiPrompt": "Lembre com carinho" }
    ],
    "professionalNotificationsSettings": [
      { "timeBefore": 1, "period": "hours", "message": "Daqui a pouco com {{nome}}", "push": true, "whatsapp": false }
    ],
    "professionalEventNotifications": [
      { "event": "canceled", "push": true, "whatsapp": false, "message": "Cancelou: {{nome}}" }
    ],
    "professionalWhatsappConnectorId": "..."
  }
}
```

- Sem `timeZone`, nasce no da organização.
- Lista vazia ou `null` apaga todas as regras daquela lista.
- `schedulingNotificationConfig`, os lembretes ao contato: `period` é `minutes`, `hours` ou `days`. **`message` é o texto, com as variáveis abaixo, e sai de graça.** Com `aiPrompt`, o texto é gerado e cobrado (1 crédito), e `message` vira o que sai se a geração não for possível. Sem `message`, nesse caso sai um lembrete padrão. Precisa de pelo menos um dos dois.
- `professionalNotificationsSettings`: `push` e `whatsapp` ausentes valem ligado.
- `schedulingNotificationEnabled` falso pausa, sem apagar as regras. Vale também para lembrete já agendado.
- Por padrão o lembrete só sai com a automação ligada na organização e na conversa. `...ReactivateAutomation` religa a conversa antes de enviar. `...IgnoreAutomationPaused` envia sem religar, passando também por cima da organização.
- `professionalWhatsappConnectorId`: canal dos avisos ao profissional. Só canal não oficial entrega (WhatsApp Web ou Z-API): a WABA recusa texto livre fora da janela de 24 horas, e o profissional nunca escreve primeiro. Vazio, usa o canal da conversa do agendamento, se servir. Canal de outra organização fica `null`.

### Variáveis das mensagens

Valem em todo texto configurado e em toda instrução para a IA, sempre no fuso do calendário:

`{{nome}}` (`{{user_name}}`), `{{telefone}}`, `{{servico}}`, `{{profissional}}` (`{{colaborador}}`), `{{titulo}}`, `{{data}}` ("14 de janeiro de 2030"), `{{hora}}` ("22:30"), `{{link_reuniao}}`.

### Google Agenda

Sem as credenciais, o resto do calendário funciona igual.

1. `POST /calendars/:id/google-calendar/connect` devolve para onde mandar a pessoa:

   ```json
   { "authorizationUrl": "https://accounts.google.com/o/oauth2/auth?...", "connectorId": "..." }
   ```

   Sem credencial: `422 googleNotConfigured`.

2. O Google devolve a pessoa para `GOOGLE_CALENDAR_REDIRECT_URI`, uma rota da tela, com `code` e `state`.
3. O id do calendário é o começo do `state`, antes do primeiro ponto. A tela chama `POST /calendars/<id>/google-calendar/callback` com `{ "code", "state" }`, soltos, e recebe `{ "calendar": { ... } }`.

   O `state` é assinado e vale 15 minutos, para a pessoa que começou. O erro `invalidState` é para pedir que comece de novo.

4. `DELETE /calendars/:id/google-calendar` desconecta e responde `{ "calendar": { ... } }`. Os agendamentos ficam. Sem conexão: `404`.

O que acontece depois de conectar:

- **Daqui para o Google:** criar, remarcar, mudar título ou descrição e cancelar vão para o Google em job. O link do Meet chega depois, em `update` no `AgendaChannel`, no campo `googleMeetUrl`.
- **Do Google para cá:** o aviso chega em `/inbound/google-calendar/:id`, o job lê o que mudou, e o evento novo vira agendamento, sem avisar ninguém. O profissional vem do e-mail de um convidado. Mudar ou apagar lá um agendamento que já existe é como remarcar ou cancelar aqui, com os avisos, mas não volta para o Google. Evento de dia inteiro começa à meia-noite no fuso do calendário.
- **Acesso revogado:** o conector fica `failed`, com `errorMessage`, e sobe um alerta `google_calendar_revoked` na organização.

O escopo é `calendar.app.created`: o app só enxerga o calendário que ele mesmo cria na conta ("Vekoo Agendamento"), e não a agenda pessoal.

---

## Profissionais

### `GET /calendars/:calendarId/professionals`

Em ordem de nome. `GET /professionals` é o mesmo, com os de todos os calendários. Cada item, igual ao de `GET .../:id`:

```json
{
  "id": "6aee1fc1b937b571fd1c2b42",
  "calendarId": "6aee1fc1b937b571fd1c2b41",
  "accountId": null,
  "name": "Dra. Teste",
  "email": "marina.duarte@exemplo.com.br",
  "phone": "5531983794137",
  "externalId": null,
  "color": "#20cc95",
  "avatarUrl": null,
  "serviceIds": [],
  "rule": {
    "id": "6aee1fc1b937b571fd1c2b43",
    "days": [
      { "dayOfWeek": 1, "enabled": true, "windows": [ { "start": "09:00", "end": "12:00" }, { "start": "14:00", "end": "18:00" } ] },
      { "dayOfWeek": 2, "enabled": false, "windows": [] }
    ],
    "blockedTimes": [ { "start": "2030-01-14 13:00", "end": "2030-01-14 15:00" } ]
  },
  "createdAt": 1793990593996,
  "updatedAt": 1793990593996
}
```

- `avatarUrl`: a foto da conta ligada, passada em `apiAssetUrl`. Não há cópia no Mongo: troca de foto vale na próxima leitura.
- `dayOfWeek`: 0 é domingo. Dia desligado não atende, mesmo com janelas guardadas.
- `blockedTimes`: bloqueios pontuais, em hora de parede no fuso do calendário.

### `POST` e `PATCH`

```json
{
  "professional": {
    "name": "Dra. Teste",
    "email": "ana@exemplo.com.br",
    "phone": "(31) 98379-4137",
    "color": "#20cc95",
    "externalId": "ERP-1",
    "accountId": null,
    "rule": { "days": [ ... ], "blockedTimes": [ ... ] }
  }
}
```

- Sem `rule` no `POST`: segunda a sexta das 9h às 17h, e sábado das 9h às 12h. Sem `rule` no `PATCH`: a regra fica como está.
- Telefone sai na forma canônica, só dígitos e com DDI. O `55` só entra quando é reconhecidamente um número brasileiro.
- Com `accountId`, nome e e-mail vêm da conta. Conta de outra organização: `422`.
- Janela inválida, início depois do fim, sobreposição ou dia ligado sem janela: `422` em `days`, e nada é gravado.

### `DELETE`

Responde `204`. Leva a regra e tira o profissional da distribuição dos serviços. **Os agendamentos ficam, sem profissional.** A soma da distribuição deixa de dar 100, de propósito: a pessoa reparte de novo na tela do serviço.

---

## Serviços

### `GET /calendars/:calendarId/services`

`GET /services` é o mesmo, de todos os calendários.

```json
{
  "id": "6aee1fc2b937b571fd1c2b44",
  "calendarId": "6aee1fc1b937b571fd1c2b41",
  "name": "Avaliação",
  "description": "Primeira conversa",
  "duration": 30,
  "bufferBefore": 0,
  "bufferAfter": 10,
  "timeIncrementInterval": 15,
  "guestLimit": 1,
  "externalId": null,
  "successMessage": null,
  "distribution": { "6aee1fc1b937b571fd1c2b42": 100 },
  "createdAt": 1793990594044,
  "updatedAt": 1793990594044
}
```

### `POST` e `PATCH`

```json
{ "service": { "name": "Avaliação", "duration": 30, "bufferBefore": 0, "bufferAfter": 10, "timeIncrementInterval": 15, "guestLimit": 1, "description": "...", "successMessage": "...", "externalId": "...", "distribution": { "<professionalId>": 100 } } }
```

- `distribution`: quanto de cada atendimento vai para cada profissional. **Soma 100**, e os profissionais são deste calendário: senão `422`. Porcentagem zero tira o profissional do serviço. Como na origem, serviço sem distribuição não é aceito: crie os profissionais antes.
- `duration` e `timeIncrementInterval`, em minutos, maiores que zero.

### `DELETE`

Responde `204`. **Os agendamentos ficam, sem serviço.** A origem os apagava junto.

---

## Disponibilidade: `GET /calendars/:calendarId/availability`

Parâmetros: `serviceId`, `start`, `end`, `professionalId?`. Sem profissional, escolhe o da vez pela distribuição e pelo `rebalancingPeriod`, e devolve quem foi em `professionalId`, para criar o agendamento com ele. Sem horário no período, olha 30 dias à frente e devolve o primeiro dia, com `fallback: true`.

`slots` é por dia (`AAAA-MM-DD`, no fuso do calendário), com a hora de parede de cada início. A tela formata a data no idioma dela. Com profissional escolhido, `priorityProfessionalName` diz quem seria o da vez, se for outro.

```json
{
  "professionalId": "6aee2507b6bad85bec4949ef",
  "professionalName": "Renata Vieira",
  "serviceName": "Ajuste de roupa",
  "slots": {
    "2026-11-07": ["09:00", "09:30", "10:00"],
    "2026-11-09": ["09:00", "09:30", "10:00"]
  },
  "priorityProfessionalName": null,
  "fallback": false
}
```

O início oferecido deixa o serviço inteiro dentro da janela. Conta a folga antes e depois (`bufferBefore`, `bufferAfter`), os bloqueios, e `guestLimit`: só lota quando bate o limite. Cancelado libera o horário.

---

## O calendário: `/calendar-events`

### `GET /calendar-events`

| Parâmetro | |
|---|---|
| `start`, `end` | Intervalo, até 400 dias. Sem eles, a semana atual. |
| `calendarIds`, `serviceIds`, `professionalIds`, `tagIds` | Lista separada por vírgula. |
| `chatId` | Todos os agendamentos da conversa, sem intervalo e sem aulas. É o painel do chat. |

Responde `{ "events": [...] }`, em ordem de início, com agendamentos e aulas misturados: olhe `type`. Filtro de serviço, profissional ou etiqueta deixa as aulas de fora, que não têm nenhum dos três. Agendamento arquivado nunca aparece, e cancelado aparece, com `status: "canceled"`.

Agendamento:

```json
{
  "id": "6aee1e4bfadc616d2b03c53a",
  "type": "booking",
  "calendarId": "6aee1e4afadc616d2b03c524",
  "professionalId": "6aee1e4afadc616d2b03c525",
  "professionalName": "Camila Rocha",
  "professionalAvatarUrl": null,
  "serviceId": "6aee1e4afadc616d2b03c52b",
  "serviceName": "Prova com hora marcada",
  "chatId": "6aee1e49fadc616d2b03c4a1",
  "contactExternalId": "visitante-joao-pedro",
  "userName": "João Pedro Almeida",
  "profilePictureUrl": null,
  "customAttributes": {},
  "title": "Prova com hora marcada - João Pedro Almeida & Camila Rocha",
  "description": null,
  "color": "#b06046",
  "start": 1793620800000,
  "end": 1793623500000,
  "status": "active",
  "attendanceStatus": "show",
  "externalId": "seed-agenda-9",
  "googleMeetUrl": null,
  "enrolledSequenceId": null,
  "sequenceEnrolledAt": null,
  "eventHistory": [
    { "userName": "Marina Duarte", "byUser": true, "updatedAt": 1793990219132, "eventName": "create" },
    { "userName": "Marina Duarte", "byUser": true, "updatedAt": 1793990219139, "eventName": "show" }
  ],
  "createdAt": 1793990219132,
  "updatedAt": 1793990219139
}
```

- `status`: `active`, `canceled` ou `archived`. `attendanceStatus`: `show`, `no_show` ou `null`.
- `customAttributes`: os campos do contato, com o nome do campo como chave. Até o domínio inbox existir, a chave é a crua.
- `eventHistory.eventName`: `create`, `canceled`, `archived`, `time_update` (com `start` e `end`, `[antes, depois]`, em milissegundos), `title_update` (com `title`), `show`, `no_show`, `attendance_cleared`, `sequence_enrolled` (com `sequenceId`, `sequenceName`, `trigger`, `stepsCount`, `auto`), `sequence_unenrolled`. Guarda os últimos 100.

Aula calculada, que ainda não tem documento (`virtual: true`):

```json
{
  "id": "vcs_6aee1e4bfadc616d2b03c55b_20261107_1000",
  "type": "class_session",
  "virtual": true,
  "start": 1794056400000,
  "end": 1794061800000,
  "status": "active",
  "title": "Clube do tecido",
  "notes": null,
  "classGroupId": "6aee1e4bfadc616d2b03c55b",
  "classGroupName": "Clube do tecido",
  "calendarId": "6aee1e4bfadc616d2b03c551",
  "color": "#0891b2",
  "textColor": "#ffffff",
  "instructorName": "Camila Rocha",
  "room": "Loja",
  "location": "Estúdio Doma, Savassi",
  "enrollmentCount": 3,
  "maxStudents": 12,
  "attendanceSummary": null,
  "scheduleDayOfWeek": 6,
  "scheduleWindowStart": "10:00"
}
```

O id `vcs_<turma>_<AAAAMMDD>_<HHMM>` vale em todas as rotas de aula, e a primeira ação nele materializa o documento. Com documento, é o mesmo formato, com `virtual: false`, `createdAt`, `updatedAt` e `attendanceSummary: { total, show, noShow, pending }`. `scheduleDayOfWeek` e `scheduleWindowStart` são o horário da grade que a aula ocupa, no fuso do calendário: a tela não precisa ler nada do id, e a aula movida continua com eles.

### `POST /calendar-events`

Responde `201` com o evento.

```json
{
  "event": {
    "calendarId": "6aee1fc1b937b571fd1c2b41",
    "start": "2026-11-06T18:40:21.209Z",
    "end": "2026-11-06T19:10:21.209Z",
    "title": "Lembrete de verdade",
    "description": null,
    "color": null,
    "professionalId": "6aee1fc1b937b571fd1c2b42",
    "serviceId": "6aee1fc2b937b571fd1c2b44",
    "chatId": "6aee1e49fadc616d2b03c49b",
    "externalId": null
  }
}
```

- Sem título, o evento mostra "serviço - contato & profissional". Sem cor, a do profissional.
- **Não recusa conflito, como na origem:** quem atende pode encaixar. Para oferecer só o que está livre, use `availability`.
- `calendarId`, `start` e `end` são obrigatórios. Fim antes do início: `422` em `end`. Fim igual ao início é aceito, porque o Google manda assim. Profissional e serviço precisam ser do calendário, e a conversa, da organização.
- Na criação: avisa o profissional (sino, push e WhatsApp, conforme as regras), agenda os lembretes ao contato e ao profissional, e agenda a inscrição por tempo na sequência de falta, se houver.

### `PATCH /calendar-events/:id`

Mesmo envelope `event`, sem `calendarId`, com `status` e `attendanceStatus` a mais. Responde `200` com o evento.

- **Remarcar** (`start`, `end`): os lembretes antigos ficam como reagendados, os novos entram, e o profissional é avisado.
- **Cancelar** (`status: "canceled"`): os lembretes morrem, o profissional é avisado, e o evento sai do Google.
- **Comparecimento** (`attendanceStatus`): `show`, `no_show`, e texto vazio ou `null` limpa. Etiqueta a conversa com `compareceu` ou `nao-compareceu`, tirando a outra, e inscreve na sequência automática daquele resultado.
- `chatId` vazio tira a conversa. Pôr a conversa depois agenda os lembretes.

### `DELETE /calendar-events/:id`

Responde `204`. **Arquiva:** some da tela e do Google, e fica no banco, com o histórico.

### `POST /calendar-events/:id/sequence`

Campo solto `{ "sequenceId" }`.

```json
{
  "enrolledSequenceId": "8c6722ca-0a12-4858-b686-b4449bad4637",
  "sequenceEnrolledAt": 1793990365935,
  "steps": [ { "stepId": "9e0d958a-bbd5-4cf9-8698-db0df0167eb1", "runAt": 1793990365934 } ]
}
```

Reinscrever cancela os passos da inscrição anterior. Falhas: `bookingWithoutChat`, `bookingNotActive`, `sequenceNotFound`, `sequenceDisabled`, `sequenceMismatch` (a sequência é de outro resultado), `sequenceWithoutSteps`.

### `DELETE /calendar-events/:id/sequence`

Responde `204`. Os passos que faltam chegam e não fazem nada.

### `GET /calendar-events/month-counts`

`start` e `end`, com o mês atual como padrão. Conta os agendamentos e as aulas de cada dia, sem cancelados nem arquivados: os agendamentos no fuso da organização, e as aulas no do calendário da turma. Fica em cache por 2 minutos (24 horas, se for mês passado).

```json
{ "2026-11-02": 1, "2026-11-03": 1, "2026-11-04": 1, "2026-11-10": 2 }
```

### `GET /calendar-events/filters`

As opções do painel de filtros, em uma ida só.

```json
{
  "calendars": [ { "id": "6aee1e4afadc616d2b03c524", "name": "Estúdio Doma", "timeZone": "America/Sao_Paulo", "calendarType": "professional" } ],
  "professionals": [ { "id": "6aee1e4afadc616d2b03c525", "name": "Camila Rocha", "calendarId": "6aee1e4afadc616d2b03c524", "color": "#b06046" } ],
  "services": [ { "id": "6aee1e4afadc616d2b03c52c", "name": "Ajuste de roupa", "calendarId": "6aee1e4afadc616d2b03c524" } ],
  "tags": [ { "id": "6aee1e49fadc616d2b03c48e", "name": "cliente-novo", "description": "Primeiro contato", "color": "#7c3aed", "createdAt": 1793990217551 } ],
  "teams": [ { "id": "8aae2834-c3e4-4317-b15a-05a7a7452661", "name": "Atendimento" } ]
}
```

---

## Sequências de comparecimento

Depois de marcar quem veio ou faltou, a conversa recebe uma série de mensagens.

### `GET /calendars/:calendarId/attendance-sequences`

```json
{
  "attendanceSequences": [
    {
      "id": "seed-faltou",
      "name": "Recuperar quem faltou",
      "trigger": "no_show",
      "enabled": true,
      "autoEnroll": false,
      "stopOnReply": true,
      "ignoreAutomationPaused": false,
      "reactivateAutomation": false,
      "autoEnrollAnchors": ["attendance_mark"],
      "autoEnrollMinutesAfterEnd": 120,
      "steps": [
        { "id": "seed-faltou-1", "name": "Mesmo dia", "message": "Oi, {{nome}}! Sentimos sua falta hoje. Quer marcar outro horário?", "runAfter": 2, "runAfterUnit": "hours", "timeFrom": 9, "timeAt": 19, "allDay": false }
      ]
    }
  ]
}
```

### `PUT /calendars/:calendarId/attendance-sequences`

Campo solto `{ "attendanceSequences": [...] }`. **Substitui a lista inteira**, e responde igual ao `GET`. Quem vem sem `id` ganha um.

- `trigger`: `show` ou `no_show`.
- `autoEnroll` liga a inscrição automática. `autoEnrollAnchors`: `attendance_mark` (ao marcar o comparecimento) e `after_event_end` (`autoEnrollMinutesAfterEnd` depois do fim, 60 se não vier: ninguém marcou nada, então o sistema marca a falta e inscreve. Só para `no_show`). Sem âncora, vale ao marcar.
- `stopOnReply`: encerra se o contato responder depois da inscrição.
- `reactivateAutomation` e `ignoreAutomationPaused`: como nos lembretes.
- Passo: `message` e, opcional, `aiPrompt` (ao menos um). Com `aiPrompt`, é gerado (1 crédito), e o modelo pode ver horários livres, ler e gravar campos do contato e mexer nas etiquetas. Sem `message`, se a geração falhar, o passo não envia nada.
- Cada passo sai `runAfter` (`minutes`, `hours`, `days`) depois do anterior, jogado para a janela `timeFrom`-`timeAt`, em horas do fuso do calendário. Vazio é das 8 às 17. `allDay` ignora a janela.

O histórico da conversa ganha notas `roleBaseType: "sequence-notation"`, com `contextMessage: { sequenceName, stepIndex, trigger }`, e `sequence-exit-notation`.

---

## Testar uma mensagem

Nada é enviado nem gravado. Sem `aiPrompt`, sai o texto preenchido, de graça. Com `aiPrompt`, gera pelo modelo e cobra 1 crédito: `422 noCredits`, `409 busy`, `503 failed` (o crédito volta).

### `GET .../attendance-sequences/bookings` e `GET .../contact-notification-preview/bookings`

Os últimos 50 agendamentos do calendário que têm conversa.

```json
{
  "bookings": [
    {
      "id": "6aee1e4bfadc616d2b03c54e",
      "chatId": "6aee1e49fadc616d2b03c4af",
      "userName": "Carlos Eduardo Santos",
      "title": "Prova com hora marcada - Carlos Eduardo Santos & Thiago Almeida",
      "start": 1795095000000,
      "end": 1795097700000,
      "serviceName": "Prova com hora marcada",
      "professionalName": "Thiago Almeida",
      "attendanceStatus": null
    }
  ]
}
```

### `POST .../contact-notification-preview`

Campos soltos: `bookingId`, `message`, `aiPrompt`, `messageIds?`. Os `messageIds` escolhem o histórico que entra: sem o campo, as últimas 30 mensagens; com `[]`, nenhuma.

```json
// { "bookingId": "...", "message": "Oi, {{nome}}! É {{data}} às {{hora}}." }
{ "message": "Oi, João Pedro Almeida! É 02 de novembro de 2026 às 09:00." }

// { "bookingId": "...", "aiPrompt": "Lembre a pessoa do horário em uma frase curta.", "messageIds": [] }
{ "message": "Oi, Carlos Eduardo! Passando pra lembrar da sua prova com o Thiago Almeida dia 19 de novembro, às 10:30." }
```

### `POST .../attendance-sequences/preview`

Campos soltos: `bookingId`, `message`, `aiPrompt`. O modelo pode usar as ferramentas, mas nada é gravado.

```json
// { "bookingId": "...", "aiPrompt": "Use a ferramenta check_availability e ofereça o primeiro horário livre." }
{ "message": "Oi, Carlos! Ficamos no aguardo do retorno da diretoria. Se quiser já ir garantindo um horário, tenho vaga hoje às 16h, viu?" }
```

As mensagens do histórico da conversa vêm de `GET /chats/:id/messages`, do domínio inbox.

---

## Turmas: `.../class-groups`

### `GET /calendars/:calendarId/class-groups`

Filtros: `active=true`, `visible=true`. Responde `{ classGroups, meta }`.

```json
{
  "id": "6aee1e4bfadc616d2b03c55b",
  "calendarId": "6aee1e4bfadc616d2b03c551",
  "name": "Clube do tecido",
  "description": "A cada quinzena, um tecido novo em mãos e o que fazer com ele.",
  "externalId": null,
  "color": "#0891b2",
  "textColor": "#ffffff",
  "maxStudents": 12,
  "minStudents": 4,
  "defaultDurationMinutes": 90,
  "startDate": "2026-10-09",
  "endDate": null,
  "schedule": [
    { "dayOfWeek": 5, "enabled": false, "windows": [] },
    { "dayOfWeek": 6, "enabled": true, "windows": [ { "start": "10:00", "end": "11:30" } ] }
  ],
  "location": "Estúdio Doma, Savassi",
  "room": "Loja",
  "address": null,
  "instructorName": "Camila Rocha",
  "instructorAccountId": null,
  "active": true,
  "visible": true,
  "recurrenceType": "biweekly",
  "recurrenceEndType": "never",
  "recurrenceOccurrences": null,
  "tags": [],
  "category": "Encontro",
  "priceCents": 4500,
  "priceCurrency": "BRL",
  "notes": null,
  "activeEnrollmentCount": 3,
  "createdAt": 1793990219843,
  "updatedAt": 1793990219843
}
```

### `POST` e `PATCH`

Envelope `classGroup`, com os mesmos campos, menos `activeEnrollmentCount`.

- `recurrenceType`: `weekly`, `biweekly` ou `monthly` (de 4 em 4 semanas). Conta a partir de `startDate` (sem ela, da criação da turma), então a mesma aula aparece em qualquer período pedido.
- `recurrenceEndType`: `date`, `occurrences` (com `recurrenceOccurrences`) ou `never`. `endDate` vale em todos.
- Janela sem `end` usa `defaultDurationMinutes`.
- **Mudar a grade** leva junto as aulas futuras que têm documento e as inscrições daquele horário, por posição dentro do dia. As passadas ficam, e continuam no calendário. Janela que sumiu não leva nada. A aula que alguém já moveu à mão fica onde está.

### `DELETE`

Responde `204`. Leva as inscrições, as aulas com documento e as presenças.

---

## Aulas: `.../class-groups/:classGroupId/sessions`

`:id` é o da aula gravada ou o calculado (`vcs_...`). Horário fora da grade ou id quebrado: `404`.

### `GET .../sessions`

Só as gravadas, sem as canceladas: `includeCanceled=true` traz. Filtro `start` e `end`. As calculadas vêm em `GET /calendar-events`. Responde `{ sessions, meta }`.

### `GET .../sessions/:id`

A aula, com `attendances`:

```json
{
  "id": "vcs_6aee1e4bfadc616d2b03c552_20261103_1900",
  "type": "class_session",
  "virtual": true,
  "start": 1793743200000,
  "end": 1793750400000,
  "status": "active",
  "title": "Oficina de costura criativa",
  "enrollmentCount": 3,
  "maxStudents": 8,
  "attendanceSummary": null,
  "scheduleDayOfWeek": 2,
  "scheduleWindowStart": "19:00",
  "attendances": [
    {
      "id": "ve_6aee1e4bfadc616d2b03c553",
      "classSessionId": null,
      "classEnrollmentId": "6aee1e4bfadc616d2b03c553",
      "chatId": "6aee1e49fadc616d2b03c49b",
      "attendanceStatus": null,
      "checkedAt": null,
      "checkedBy": null,
      "guest": false,
      "userName": "Ana Beatriz Moura",
      "profilePictureUrl": null,
      "contactExternalId": "visitante-ana-beatriz"
    }
  ]
}
```

### `POST .../sessions`

Aula avulsa, ou reposição. Envelope `classSession`: `start`, `end`, `title`, `notes`, `color`. Responde `201`. Aparece em `GET /calendar-events` mesmo fora da grade e depois do fim da turma, e só some com a turma desativada. Já existe aula da turma nesse instante: `422 conflict`.

```json
{
  "id": "6aee1fdbb937b571fd1c2b53",
  "type": "class_session",
  "virtual": false,
  "start": 1930309200000,
  "end": 1930312800000,
  "status": "active",
  "title": "Aula avulsa",
  "notes": "Reposição",
  "classGroupId": "6aee1e4bfadc616d2b03c55b",
  "classGroupName": "Clube do tecido",
  "calendarId": "6aee1e4bfadc616d2b03c551",
  "color": "#0891b2",
  "textColor": "#ffffff",
  "instructorName": "Camila Rocha",
  "room": "Loja",
  "location": "Estúdio Doma, Savassi",
  "enrollmentCount": 3,
  "maxStudents": 12,
  "attendanceSummary": { "total": 0, "show": 0, "noShow": 0, "pending": 0 },
  "scheduleDayOfWeek": 1,
  "scheduleWindowStart": "10:00",
  "createdAt": 1793990619318,
  "updatedAt": 1793990619318
}
```

### `PATCH .../sessions/:id` e `POST .../sessions/:id/cancel`

Mesmo envelope, com `status` a mais. Aula calculada é materializada antes. Responde a aula. Cancelada, ela continua em `GET /calendar-events`, com `status: "canceled"`.

**Mover** é mandar `start` e `end`: a aula aparece só no horário novo, sem o antigo voltar como calculada, e leva os inscritos do horário da grade. O id calculado antigo continua achando a mesma aula.

```json
// PATCH .../sessions/vcs_6aee2508b6bad85bec494a15_20310408_1900
// { "classSession": { "start": 1933459200000, "end": 1933466400000 } }
{
  "id": "6aee2535075f9d2113706c98",
  "virtual": false,
  "start": 1933459200000,
  "end": 1933466400000,
  "enrollmentCount": 3,
  "scheduleDayOfWeek": 2,
  "scheduleWindowStart": "19:00"
}
```

---

## Inscrições: `.../class-groups/:classGroupId/enrollments`

Inscrição com dia e hora vale para aquele horário. Sem, vale para todos.

### `GET`

`includeCanceled=true` traz as canceladas.

```json
{
  "enrollments": [
    {
      "id": "6aee1fdbb937b571fd1c2b51",
      "classGroupId": "6aee1e4bfadc616d2b03c55b",
      "chatId": "6aee1e49fadc616d2b03c4a8",
      "status": "active",
      "enrolledAt": 1793990619210,
      "scheduleDayOfWeek": 6,
      "scheduleWindowStart": "10:00",
      "externalId": null,
      "notes": null,
      "userName": "Fernanda Lima",
      "profilePictureUrl": null,
      "contactExternalId": "5531971810932"
    }
  ],
  "activeCount": 4,
  "maxStudents": 12,
  "meta": { "page": 1, "perPage": 100, "total": 4, "totalPages": 1, "hasMore": false }
}
```

### `POST`

Campo solto `{ "chatId" }`. Responde `201`, com a inscrição, em todos os horários. Conversa de outra organização: `404`. Turma cheia: `422 classGroupFull`. Já inscrito: `422` em `chatId`. Quem cancelou pode se inscrever de novo.

### `DELETE .../:id`

Responde `204`. Cancela **todas** as inscrições ativas do mesmo contato nesta turma.

---

## Presença: `/class-sessions/:classSessionId/attendances`

O id da aula é o gravado ou o calculado. `attendanceStatus`: `show`, `no_show` ou `null`.

### `GET`

`{ "attendances": [...] }`: os registros, mais quem está inscrito e sem registro, com id `ve_<inscrição>`. Quem se inscreveu depois da aula não aparece nela.

### `PUT .../:id`

Campo solto `{ "attendanceStatus" }`. O `:id` pode ser `ve_...`. Materializa a aula e o registro, e guarda quem marcou.

```json
{
  "id": "6aee1fdab937b571fd1c2b4d",
  "classSessionId": "6aee1fdab937b571fd1c2b4c",
  "classEnrollmentId": "6aee1e4bfadc616d2b03c55c",
  "chatId": "6aee1e49fadc616d2b03c4af",
  "attendanceStatus": "show",
  "checkedAt": 1793990618731,
  "checkedBy": "Marina Duarte",
  "guest": false,
  "userName": "Carlos Eduardo Santos",
  "profilePictureUrl": null,
  "contactExternalId": "5511987651234"
}
```

### `POST`

Campos soltos. Responde `201`.

- `{ "chatId" }`: entra como **convidado**, só nesta aula. Responde o registro, com `guest: true`. Repetido: `422 alreadyInSession`.
- `{ "chatId", "enrollAll": true, "slots": [ { "dayOfWeek": 6, "windowStart": "10:00" } ] }`: **inscreve** em cada horário (sem `slots`, no horário desta aula), reativando a cancelada. Responde `{ "enrolledAll": true, "enrollmentsCreated": 1 }`. Horário fora da grade: `422 invalidSlot`. Como na origem, este caminho não confere a lotação.

### `DELETE .../:id`

Responde `204`. Tira o registro de presença.

### `GET .../schedule`

As janelas da grade, para perguntar em quais horários inscrever.

```json
{ "windows": [ { "dayOfWeek": 2, "windowStart": "19:00", "windowEnd": "21:00", "current": true }, { "dayOfWeek": 4, "windowStart": "19:00", "windowEnd": "21:00", "current": false } ] }
```

### `POST .../bulk-update`

Campo solto `{ "attendanceStatus" }`, com `null` para desmarcar. Marca todos os inscritos do horário.

```json
{ "attendanceSummary": { "total": 3, "show": 0, "noShow": 3, "pending": 0 } }
```

---

## Dashboard: `GET /dashboard/calendar-stats`

Parâmetros `dateStart` e `dateEnd`, com o último ano como padrão. Dia, dia da semana e hora no fuso da organização. `byDayOfWeek` tem 7 posições a partir do domingo, e `byHour`, 24. `upcoming` são os próximos 5 ativos dos próximos 7 dias, fora do período pedido.

```json
{
  "total": 12,
  "show": 7,
  "noShow": 2,
  "pending": 3,
  "canceled": 1,
  "active": 11,
  "attendanceRate": 77.8,
  "cancellationRate": 8.3,
  "daily": [ { "date": "2026-10-13", "show": 1, "noShow": 0 } ],
  "upcoming": [
    { "id": "6aee1e4bfadc616d2b03c53c", "title": "Prova com hora marcada - Ana Beatriz Moura & Camila Rocha", "start": 1794229200000, "end": 1794231900000, "status": "active", "attendanceStatus": null, "color": "#b06046" }
  ],
  "byProfessional": [ { "id": "6aee1e4afadc616d2b03c525", "name": "Camila Rocha", "color": "#b06046", "show": 4, "noShow": 0, "total": 5 } ],
  "byDayOfWeek": [0, 2, 2, 3, 2, 3, 0],
  "byHour": [0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 2, 0, 1, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0],
  "avgPerDay": 0.0
}
```

As taxas são `null` sem base de cálculo. `pending` conta o que não tem comparecimento marcado, inclusive cancelado, como na origem.

---

## Ações agendadas da conversa: `/chats/:chatId/scheduled-actions`

O que a conversa ainda vai enviar sozinha. Hoje, os lembretes de agendamento: na origem eram também os follow-ups de assistente, que não existem aqui.

### `GET`

```json
{
  "actions": [
    {
      "id": "6aee1ec5b937b571fd1c2b35",
      "chatId": "6aee1e49fadc616d2b03c49b",
      "kind": "booking_reminder",
      "name": "Lembrete: 1 minuto antes",
      "status": "pending",
      "scheduledAt": 1793990361209,
      "bookingId": "6aee1ec5b937b571fd1c2b33",
      "metadata": { "configIndex": 0, "bookingTitle": "Lembrete de verdade", "bookingStart": 1793990421209, "professionalName": "Dra. Teste" }
    }
  ],
  "automation": { "enabled": true, "reactivatesAt": null }
}
```

- Só as pendentes, da mais próxima para a mais distante. Passou mais de uma hora da hora marcada, sai da lista: o job se perdeu.
- `automation`: se a automação da conversa está ligada, e quando volta sozinha.
- `metadata.fallbackReason` aparece quando a IA não pôde gerar e saiu o texto configurado: `no_credits`, `unavailable`, `failed` ou `empty`.

### `DELETE .../:id`

Responde `204`. O job continua na fila, chega e não faz nada. Já executada: `404`.

---

## Tempo real

### `AgendaChannel`

Sem parâmetros. Exige `calendar`. Stream da organização inteira, e a tela filtra pelo que está vendo. Recebe `{ action, type, ... }`:

| `action` | `type` | Corpo |
|---|---|---|
| `create`, `update` | `booking` | `event`, o mesmo de `GET /calendar-events`. |
| `destroy` | `booking` | `event`. Vem ao arquivar e ao apagar. Cancelar é `update`. |
| `create`, `update` | `class_session` | `event`. |
| `destroy` | `class_session` | `event`. Vem ao cancelar a aula também. |
| `attendance_update` | `class_session` | Abaixo. |
| `enrollment_update` | `class_session` | Abaixo. |

```json
{
  "action": "create",
  "type": "booking",
  "event": { "id": "6aee1ec5b937b571fd1c2b33", "type": "booking", "title": "Lembrete de verdade", "start": 1793990421209, "...": "..." }
}
{
  "action": "attendance_update",
  "type": "class_session",
  "classSessionId": "6aee1edeb937b571fd1c2b3a",
  "classGroupId": "6aee1e4bfadc616d2b03c552",
  "scheduleDayOfWeek": 2,
  "scheduleWindowStart": "19:00",
  "attendanceSummary": { "total": 1, "show": 1, "noShow": 0, "pending": 0 },
  "enrollmentCount": 3
}
{
  "action": "enrollment_update",
  "type": "class_session",
  "classGroupId": "6aee1e4bfadc616d2b03c552",
  "scheduleDayOfWeek": 2,
  "scheduleWindowStart": "19:00",
  "enrollmentCount": 4
}
```

Para aplicar `attendance_update` e `enrollment_update` nas aulas calculadas: compare `classGroupId`, `scheduleDayOfWeek` e `scheduleWindowStart`, que os eventos também trazem. Quando a inscrição é da turma inteira, `scheduleDayOfWeek` vem `null`: atualize todas as aulas da turma.

Quando uma aula calculada é materializada, chega `create` com o id gravado, e o id `vcs_` deixa de sair nas listagens. Tire da tela a calculada com o mesmo `classGroupId`, `scheduleDayOfWeek` e `scheduleWindowStart` naquele dia, ou releia o período.

### `ChatChannel`, dois eventos novos

Além das mensagens (ver `connectors.md`), a stream da conversa recebe:

```json
{ "event": "bookings_changed", "chatId": "6aee1e49fadc616d2b03c49b" }
```

Agendamento da conversa mudou: revalide `GET /calendar-events?chatId=`. Não leva dados, porque o evento é grande.

```json
{
  "event": "scheduled_actions_changed",
  "chatId": "6aee1e49fadc616d2b03c49b",
  "scheduledWork": { "actions": [ ... ], "automation": { "enabled": true, "reactivatesAt": null } }
}
```

O retrato inteiro, igual ao `GET`: grave no cache e pronto. Vem quando um lembrete é agendado, sai ou é cancelado, e quando a automação da conversa muda, por qualquer caminho.

Mensagens que a agenda cria na conversa: o lembrete e o passo de sequência saem como `role: "assistant"`, `messageOrigin: "platform"`, com `senderName` "<organização> [Lembrete da agenda]" ou "<organização> [Sequência]". Novos `roleBaseType`, em mensagens `role: "base"`: `sequence-notation` e `sequence-exit-notation`. O resto da mensagem é o formato de `connectors.md`.

```json
{
  "role": "base",
  "roleBaseType": "sequence-notation",
  "content": "Agradecer",
  "contextMessage": { "sequenceName": "Pós-consulta", "stepIndex": 1, "trigger": "show" }
}
```

### Avisos

O profissional ligado a uma conta, ou com o e-mail de uma conta da organização, recebe `AccountNotice`, na categoria `calendar`, pelo `NotificationsChannel` de sempre: "Novo agendamento", "Agendamento cancelado", "Agendamento remarcado" (se ligado), "Lembrete de agendamento". O texto sai no idioma da conta. Em `GET /notifications`:

```json
{
  "id": "6aee1fdab937b571fd1c2b4b",
  "key": null,
  "at": 1793990618527,
  "read": false,
  "title": "Agendamento cancelado",
  "description": "O agendamento com Ana Beatriz Moura em 08/11, 15:43 foi cancelado.",
  "url": "/calendar",
  "category": "calendar",
  "actions": [ { "action": "navigate", "title": "Abrir agenda", "urlPath": "/calendar" }, { "action": "dismiss", "title": "Dispensar" } ],
  "readAt": null,
  "archivedAt": null
}
```

---

## Webhook: `POST /inbound/google-calendar/:id`

Sem sessão. Responde `200` e deixa o trabalho para o job. O token que combinamos ao abrir o canal volta em `X-Goog-Channel-Token`: sem ele, `403`. Conector desligado ou inexistente: `200`, sem fazer nada.

---

## Interface de Ruby

Para quem liga a agenda a outro domínio. As extensões `scheduling` e `class_group_scheduling` do motor de scripts são de outra frente, e têm aqui tudo de que precisam.

```ruby
calendar = Agenda::Calendar.scoped(organization.id, calendar_id)  # ou .default_for(organization.id)
service = Agenda::BookingService.new(calendar, chat: chat)
```

| Extensão `scheduling` (origem) | Aqui |
|---|---|
| `AppointmentService.new(organization, user_id, conversation:)` | `Agenda::BookingService.new(calendar, chat:)`. O calendário vinha do assistente: agora vem de quem chama. |
| `available_slots(service_name:, date_start:, date_end:, employee_name:)` | Igual. |
| `list_services` | Igual. |
| `list_collaborators` | `list_professionals` |
| `cancel_appointment(appointment_id:)` | `cancel_booking(booking_id:)` |
| `create_appointment(employee_name:, service_name:, start_time:, external_id:)` | `create_booking(...)`, com os mesmos argumentos. |
| `list_appointments(full_fields)` | `list_bookings(full_fields)` |
| `update_external_id(appointment_id:, external_id:)` | `update_external_id(booking_id:, external_id:)` |
| `created_appointment?` | `created_booking?` |
| `Conversation#future_appointments_json` | `Chat#future_bookings_json` |

Os erros continuam em inglês, porque são para o script. `@organization.tag?('trinks-integration')` caiu: `external_id` e `service_duration` saem sempre que existem.

Para a extensão `class_group_scheduling`: `Agenda::Calendar.where(organization_id:, calendar_type: "class_group")`, `Agenda::ClassGroup` (`active`, `visible`, `class_enrollments`, `active_enrollment_count`), `Agenda::ClassEnrollment` e `Agenda::SessionGeneratorService.new(class_group, from, to).call`. Essa chamada devolve hashes com **chaves em símbolo e camelCase, e datas em milissegundos**: `event[:status]`, `event[:start]`, `event[:scheduleDayOfWeek]`, `event[:scheduleWindowStart]`.

Outros pontos:

- `Agenda::EnrollAttendanceSequenceService.new(booking, sequence_id, auto: false).call` devolve `Agenda::Result` (`success?`, `data`, `code`, `message`).
- `ScheduledAction`: para um domínio novo agendar trabalho de conversa, some um `kind` em `KINDS`, grave a linha e passe `token` ao job. O job lê a linha `pending` e faz `claim!` antes de agir. Cancelar é mudar o status.
- `Chats::BackfillSystemTagsService` cuida do grupo `:attendance`. O `be-pipelines` soma o `:deal` ali (`bin/rails "chats:backfill_system_tags[<organization_id>]"`).
- `Ai::Chat#complete_with_tools(system:, prompt:, tools:) { |nome, entrada| resultado }` é o laço de ferramentas, novo na camada `Ai::`.

---

## Hooks da origem

Todo hook de `aiva-frontend/src/api` e o que ele chama aqui.

| Hook ou função | Origem | Aqui |
|---|---|---|
| **`calendar.js`** | | |
| `useGetCalendarData` | `GET /calendar` | `GET /calendar-events`, mais `AgendaChannel`. `organizations` caiu. |
| `useGetMonthCounts` | `GET /calendar/month_counts` | `GET /calendar-events/month-counts` |
| `useGetCalendarOrganizations` | `GET /calendar/organizations` | Sem equivalente: era a lista de assistentes. Filtre por `GET /calendar-events/filters`. |
| `createCalendarEvent` | `POST /calendar` | `POST /calendar-events` |
| `updateCalendarEvent` | `PUT /calendar/:id` | `PATCH /calendar-events/:id` |
| `deleteCalendarEvent` | `POST /calendar/:id` (rota que não existia) | `DELETE /calendar-events/:id` |
| `useListCollaborators` | `GET /calendar/organizations/:id/collaborators` | `GET /professionals`, ou `/calendars/:id/professionals`, ou `filters` |
| `enrollAppointmentSequence` | `POST /calendar/:id/enroll_sequence` | `POST /calendar-events/:id/sequence` |
| `unenrollAppointmentSequence` | `DELETE /calendar/:id/enroll_sequence` | `DELETE /calendar-events/:id/sequence` |
| `useGetCalendarList` | `GET /calendar/calendar_list` | `GET /calendars` |
| `useGetCalendarById` | `GET /calendar/:id/calendars` (rota que não existia) | `GET /calendars/:id` |
| `updateCalendar` | `PUT /calendar/:id` (caía no agendamento) | `PATCH /calendars/:id` |
| `createCalendar` | `POST /calendar/calendar_list` (rota que não existia) | `POST /calendars` |
| `useConversationAppointments`, `conversationAppointmentsKey` | `GET /calendar?conversation_id=` | `GET /calendar-events?chatId=`, revalidado por `bookings_changed` |
| `CalendarFilters.jsx` | `GET /calendar/{organizations,departments,tags}` | `GET /calendar-events/filters` |
| **`calendarCollaborator.js`** | | |
| `useCalendarCollaborators` (listar, criar, editar, excluir) | `/calendar/:id/collaborators` | `/calendars/:id/professionals`. `scheduling_rule_attributes` é `rule`. |
| **`calendarService.js`** | | |
| `useCalendarServices` (listar, criar, editar, excluir) | `/calendar/:id/services` | `/calendars/:id/services` |
| **`collaborators.js`** | | |
| `useCollaborators` (listar, ver, criar, editar, excluir) | `/automations/:id/collaborators` | `/calendars/:id/professionals`. Era por assistente. |
| **`services.js`** | | |
| `useServices` (listar, ver, criar, editar, excluir) | `/automations/:id/services` | `/calendars/:id/services`. Era por assistente. |
| **`useCalendars.ts`** | | |
| `useCalendars` (listar, criar, editar) | `/calendars` | `/calendars` |
| `destroyCalendar` | `DELETE /calendars/:id` (respondia 204 sem apagar nada) | Sem rota: precisa de decisão de produto. Esconda o botão. |
| `useCalendar` | `GET /calendars/:id` | Igual. |
| `connectGoogleCalendar` | `POST /calendars/:id/connect_google_calendar` | `POST /calendars/:id/google-calendar/connect` |
| `validateGoogleCallback` | `POST /calendars/:id/validate_google_callback` | `POST /calendars/:id/google-calendar/callback`, agora com `state`. |
| `disconnectGoogleCalendar` | `DELETE /calendars/:id/disconnect_google_calendar` | `DELETE /calendars/:id/google-calendar` |
| **`useClassGroups.ts`** | | |
| `useClassGroups` (listar, criar, editar, `deleteClassGroup`), `useClassGroup` | `/calendar/:id/class_groups` | `/calendars/:id/class-groups` |
| **`useClassSessions.ts`** | | |
| `useClassSessions`, `createSession`, `updateSession` | `.../class_groups/:id/sessions` | `.../class-groups/:id/sessions` |
| `cancelSession` | `POST .../sessions/:id/cancel` | Igual. |
| `useClassSession` | `GET .../sessions/:id` | Igual. |
| **`useClassEnrollments.ts`** | | |
| `useClassEnrollments`, `enrollParticipant`, `unenrollParticipant` | `.../class_groups/:id/enrollments` | `.../class-groups/:id/enrollments` |
| **`useClassAttendances.ts`** | | |
| `useClassAttendances`, `updateAttendance`, `addParticipant` | `/class_sessions/:id/attendances` | `/class-sessions/:id/attendances` |
| `bulkUpdateAttendances` | `POST .../attendances/bulk_update` | `POST .../attendances/bulk-update` |
| `fetchSchedule` | `GET .../attendances/schedule` | Igual. |
| **`useAttendanceSequences.ts`** | | |
| `useAttendanceSequences`, `saveSequences` | `/calendars/:id/attendance_sequences` | `/calendars/:id/attendance-sequences` |
| **`calendar-stats.ts`** | | |
| `useCalendarStats` | `GET /dashboard/calendar_stats` | `GET /dashboard/calendar-stats` |
| **`contactNotificationPreview.ts`** | | |
| `listNotificationAppointments` | `GET .../contact_notification_preview/appointments` | `GET .../contact-notification-preview/bookings` |
| `previewContactNotification` | `POST .../contact_notification_preview/preview` | `POST .../contact-notification-preview`. `systemPrompt` é `aiPrompt`. |
| `listConversationMessages` | `GET /api/v1/conversations/...` | Domínio inbox. |
| **`sequencePreview.ts`** | | |
| `listPreviewAppointments` | `GET .../attendance_sequences/appointments` | `GET .../attendance-sequences/bookings` |
| `previewSequenceStep` | `POST .../attendance_sequences/preview` | `POST .../attendance-sequences/preview`. `systemPrompt` é `aiPrompt`. |
| **`chat/use-scheduled-automations.ts`** | | |
| `useScheduledAutomations` | `GET /conversations/:id/scheduled_automations` | `GET /chats/:id/scheduled-actions` |
| `cancel` | `DELETE .../:id?suppress=` | `DELETE /chats/:id/scheduled-actions/:id`. `suppress` caiu. |
| `resume` | `POST .../resume` | Sem equivalente: só religava follow-up de assistente. Para religar a automação, `PATCH` da conversa, no domínio inbox. |

Nomes de campo que mudaram: `collaboratorId` é `professionalId`, `conversationId` é `chatId`, `userId` do agendamento é `contactExternalId`, `systemPrompt` é `aiPrompt` (com `message` ao lado), `reactivateAssistant` é `reactivateAutomation`, `collaborator*` é `professional*`, `...Integration...` é `...Connector...`, `sequenceJobIds` é `steps`.

---

## Semente

`db/seeds/agenda.rb`, na organização de `marina.duarte@exemplo.com.br`: o **Estúdio Doma**, o ateliê da Doma Store. Idempotente. Carrega a semente de conectores quando ela ainda não rodou, porque os agendamentos falam com aquelas conversas.

- **Estúdio Doma** (`professional`): Camila Rocha e Thiago Almeida, ligados a contas, e Renata Vieira, sem conta. Prova com hora marcada, Ajuste de roupa e Consultoria de estilo. 18 agendamentos, de 3 semanas atrás a 2 à frente, com comparecimento, falta e cancelado. Lembretes de 1 dia e 2 horas (reais: entram na fila), e 2 sequências desligadas da inscrição automática.
- **Oficinas Doma** (`class_group`): Oficina de costura criativa (semanal) e Clube do tecido (quinzenal), com inscritos, uma aula com presença marcada e uma cancelada.

---

## Para o deploy

- **Índices do Mongo:** `bin/rails db:mongoid:create_indexes` antes de receber tráfego. Os únicos seguram dois cliques em inscrição, presença e aula.
- Nenhuma migration: tudo da agenda mora no Mongo.
- Job recorrente em `config/schedule/agenda.yml`: `Agenda::GoogleCalendarWatchRefreshJob`, todo dia às 04:30, na fila `low`.

| Variável | Para quê |
|---|---|
| `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET` | Cliente OAuth do Google. Sem elas, conectar responde `googleNotConfigured`, e o resto funciona. |
| `GOOGLE_CALENDAR_REDIRECT_URI` | Rota da tela que recebe `code` e `state`. Registrada no Google Cloud Console. |
| `BACKEND_URL` | Já existe. O canal de avisos do Google só aceita HTTPS público: em desenvolvimento a conexão funciona, sem o aviso. |
| `ANTHROPIC_API_KEY` | Já existe. Sem ela, mensagem com `aiPrompt` sai com o texto configurado, e a simulação responde `503 failed`. |

No Google Cloud Console: Calendar API ligada, escopos `calendar.app.created`, `openid` e `email`.

---

## Limitações conhecidas

- **Provedores:** o WhatsApp do profissional e o Google só foram exercitados com a rede fechada, contra stubs. Não há credenciais em desenvolvimento.
- **Job cancelado continua na fila** até a hora marcada, e aí não faz nada. É o preço de cancelar sem `Sidekiq::Status`.
- **Regra editada não muda lembrete já agendado.** Vale para agendamento novo ou remarcado, como na origem. O que muda na hora: desligar os lembretes, e apagar a regra.
- **`POST` em turma cheia pela presença** (`enrollAll`) não confere a lotação, como na origem.
- **A soma da distribuição** deixa de dar 100 quando um profissional sai. O serviço não salva até alguém repartir de novo.
- `pending` no dashboard conta cancelado, como na origem.
