# Contrato da API: domínio "access"

Pessoas, organizações da pessoa, suporte do Vekoo, departamentos, grupos de permissões, perfil, organização, avisos, alertas e push.

As respostas de exemplo são reais, capturadas do servidor rodando com a semente (`db/seeds/access.rb`), e os eventos dos canais vieram de um cliente WebSocket de verdade. Ids, URLs de imagem e mapas de permissões foram encurtados com `…` só para leitura. O payload do push vem do que as specs conferem: não houve navegador de verdade recebendo.

## Regras gerais

- **Autenticação:** `Authorization: Bearer <token>`. A sessão é da **pessoa** (`User`) e vale em todas as organizações dela. Sem sessão válida, toda rota responde `401 unauthorized`.
- **A organização vem do vínculo da aba:** `X-Account: <hashid>`, o hashid da `Account` (o vínculo da pessoa com uma organização). A API confere que o vínculo é da pessoa da sessão e está ativo; daí saem `current_account` e `current_organization`. Nenhuma rota recebe id de organização. Sem o cabeçalho, vale o único vínculo ativo da pessoa; com mais de um, `400 accountRequired`. Rotas da pessoa (`/me`, `/logout`, `/accounts`, `POST /organizations`, `/support/*`, `/push-devices`) não exigem o cabeçalho.
- **Id de recurso de outra organização** responde `404 notFound`, nunca `403`. **Hashid de vínculo de outra pessoa** responde `404 accountNotFound`, igual a um hashid que não existe: a resposta não diz se a organização existe.
- **Entrada em envelope explícito**, em camelCase: `{ "user": { "teamIds": [...] } }`. Corpo solto, ou envelope que não é objeto, responde `400 parameterMissing`. As exceções estão indicadas em cada rota: ações que não são recurso e upload de arquivo.
- **Saída:** chaves em camelCase, datas em milissegundos desde a época, ids como string.
- **Listagens:** `{ "<recurso>": [...], "meta": { "page", "perPage", "total", "totalPages", "hasMore" } }`, com `?page=` e `?perPage=` (teto de 100).
- **Imagens:** `avatarUrl` e `logoUrl` são caminhos relativos à API, como a `url` de `/uploads`. Prefixe com a URL da API.
- **Permissões:** as chaves são as de `AccessRole::KEYS`, em snake_case, as mesmas de `account.permissions` em `/me`.

### Erros

Sempre `{ "error": { "code", "message", "field"?, "details"? } }`. `code` é o contrato; `message` é o fallback para quando a tela não conhece o código.

| Status | `code` | Quando |
|---|---|---|
| 400 | `parameterMissing` | Falta o envelope, a origem do alerta ou o arquivo. `field` diz qual. |
| 401 | `unauthorized` | Sem sessão ou sessão vencida. |
| 401 | `accessRevoked` | A pessoa perdeu o acesso a **todas** as organizações dela (o último vínculo foi revogado): `POST /login` com a senha certa (com a errada, continua `wrongPassword`) e qualquer rota com o token que ela já tinha. O token é lembrado em cache até vencer; cache perdido, ou vínculo restaurado, volta a ser `unauthorized`. Com outra organização ativa, a sessão continua e só aquela organização responde `403 accountRevoked`. |
| 400 | `accountRequired` | Sem `X-Account`, e a pessoa tem mais de uma organização. |
| 403 | `accountRevoked` | `X-Account` é de um vínculo da própria pessoa, revogado. A tela leva para a escolha de organização. |
| 404 | `accountNotFound` | `X-Account` não existe, é de outra pessoa, ou é o vínculo de suporte de quem deixou de ser suporte. |
| 403 | `forbidden` | Sem a permissão da rota, ou quem não é dono mexendo no dono. |
| 404 | `notFound` | Não existe, ou é de outra organização ou pessoa. |
| 422 | `unprocessable` | Validação. `field` é o primeiro campo inválido (onde pôr o foco); `details` traz todos: `{ "name": ["…"] }`. |
| 422 | `emailTaken` | `POST /signup` com e-mail que já tem conta (é único no produto). |
| 422 | `alreadyMember` | `POST /users` com o e-mail de quem já está nesta organização (ativo ou revogado). |
| 422 | `sharedIdentity` | `PATCH /users/:id` mudando nome, e-mail, telefone ou senha de quem também está em outra organização (ou é suporte). `field` é o primeiro campo recusado. |
| 422 | `alreadyOwner` / `accountRevoked` | `POST /users/:id/transfer-ownership` para quem já é dono, ou para vínculo revogado. |
| 422 | `supportCannotLeave` | `POST /users/leave` pelo vínculo de suporte. |
| 422 | `lastOwner` | A ação deixaria a organização sem dono com acesso. |
| 422 | `cannotRevokeSelf` / `cannotDeleteSelf` | Ninguém revoga nem exclui a si mesmo por `/users`. |
| 422 | `ownPasswordInProfile` | Tentou trocar a própria senha por `/users`. Em `/profile` a senha atual é exigida. |
| 422 | `invalidTeam` | `teamIds` traz departamento que não existe nesta organização. |
| 422 | `wrongPassword` | `PATCH /profile` com a senha atual ausente ou errada (`field: "currentPassword"`). |
| 422 | `defaultAccessRole` | Tentou excluir um grupo padrão. |
| 422 | `noPushDevices` / `pushNotConfigured` | `POST /push-devices/test` sem dispositivo, ou sem VAPID no servidor. |
| 429 | `tooManyRequests` | Mais de 30 por minuto, por pessoa, somando `POST /users` e `GET /users/check-email`. |

> Hoje a `message` de `notFound` e `parameterMissing` sai sempre em pt-BR: é uma limitação de `Localizable` na fundação, registrada no relatório. Os demais erros deste domínio respeitam o idioma da requisição.

---

## Sessão, organizações da pessoa e WebSocket

### `POST /login`, `POST /signup`, `GET /me`

Os três respondem no mesmo formato. `user` é a pessoa; `accounts`, os vínculos ativos dela, um por organização (o de suporte não entra); `account`, `organization` e `credits` são os da organização pedida em `X-Account` ou, sem o cabeçalho, os do único vínculo, e `null` quando a pessoa tem mais de um. `token` só vem em `login` e `signup`. `GET /me` com `X-Account` que não vale responde os erros da tabela acima.

`GET /me` com `X-Account: v8q3bw93` (encurtado):

```json
{
  "user": {
    "id": "ea8ff3af-…", "name": "Marina Duarte", "email": "marina.duarte@exemplo.com.br",
    "phone": null, "locale": null, "avatarUrl": null, "master": false, "createdAt": 1791502360619
  },
  "accounts": [
    { "id": "b56a981d-…", "hashid": "7kxn7q4r", "role": "owner", "support": false, "lastSeenAt": 1794096637809,
      "organization": { "id": "ddbca24b-…", "name": "Marina Duarte Conteúdo", "logoUrl": null } },
    { "id": "141c16ce-…", "hashid": "v8q3bw93", "role": "member", "support": false, "lastSeenAt": 1794096806991,
      "organization": { "id": "edfc7702-…", "name": "Clínica Bem Viver", "logoUrl": null } }
  ],
  "account": {
    "id": "141c16ce-…", "hashid": "v8q3bw93", "userId": "ea8ff3af-…", "name": "Marina Duarte",
    "email": "marina.duarte@exemplo.com.br", "organizationId": "edfc7702-…", "role": "member", "support": false,
    "phone": null, "locale": null, "avatarUrl": null, "accessRoleId": "4ed00375-…",
    "permissions": { "chat": "all", "core_settings": "all", "…": "…" }, "createdAt": 1794094362833
  },
  "organization": { "id": "edfc7702-…", "name": "Clínica Bem Viver", "…": "…" },
  "credits": { "total": 50, "used": 0, "left": 50 },
  "expiresAt": 1796688362000
}
```

- `hashid` é o identificador público do vínculo: vai na URL do front (`/a/<hashid>/...`) e em `X-Account`. O inteiro que ele codifica nunca sai pela API. Sal, alfabeto e tamanho mínimo em `config/initializers/hashid.rb` (`HASHID_SALT`).
- `GET /me` com organização grava `lastSeenAt` do vínculo.
- Login: a senha é da pessoa. Quem perdeu todas as organizações recebe `401 accessRevoked`; quem nunca teve (vínculo removido) entra e pode criar a sua.
- `POST /signup` cria a pessoa, a organização e o vínculo de dono; `account` vem preenchido.

### `GET /accounts`

Os vínculos ativos da pessoa, no formato de `accounts` acima: `{ "accounts": [...] }`. Sem `X-Account`.

### `POST /organizations`

```json
{ "organization": { "name": "Clínica Bem Viver" } }
```

`201`, o vínculo novo (formato de `accounts`), com `role: "owner"`. A organização nasce com os grupos padrão e o aviso de boas-vindas. Nome inválido: `422`, `field: "name"`. Mesmo limite do cadastro: 5 por hora, por pessoa.

### WebSocket

`/cable?token=<token>&account=<hashid>`. A conexão é de **um vínculo**: a aba que troca de organização abre outra conexão, e todo canal lê o vínculo da conexão. Sem `account`, vale o único vínculo ativo; hashid de outra pessoa, de vínculo revogado ou de suporte de quem deixou de ser suporte: conexão recusada. Revogar o vínculo derruba as conexões daquela organização (`{ "type": "disconnect", "reason": "remote", "reconnect": false }`); as das outras organizações da pessoa continuam.

---

## Suporte do Vekoo: `/support`

Para `User#master`. Para qualquer outra pessoa, as rotas respondem `404 notFound`. `master` só muda por `bin/rails "support:grant[EMAIL]"` / `support:revoke`, ou console: nenhuma rota, parâmetro ou serializer escreve nele.

| Rota | O que faz |
|---|---|
| `GET /support/organizations?q=&page=&perPage=` | Busca por nome da organização (sem acento) ou por nome ou e-mail de quem participa. |
| `POST /support/organizations/:id/enter` | `201`, o vínculo de suporte daquela organização (formato de `accounts`, `support: true`), criado na primeira entrada. Registra a entrada. |

```json
{
  "organizations": [
    { "id": "edfc7702-…", "name": "Clínica Bem Viver", "createdAt": 1792366362605, "membersCount": 2,
      "owner": { "name": "Patrícia Gomes", "email": "patricia.gomes@exemplo.com.br" } }
  ],
  "meta": { "page": 1, "perPage": 25, "total": 1, "totalPages": 1, "hasMore": false }
}
```

**O vínculo de suporte** (`support: true`) dá ao suporte o hashid da URL e o autor das ações que pedem um `account_id` (mandar mensagem, atribuir, comentar). Ele:

- tem todas as permissões (`can?` sempre verdadeiro; `Chat.visible_to` vê tudo), e o `User#master` também, em qualquer vínculo;
- não aparece em `/users`, contagens de grupo e departamento, `/chats/people`, seletores, atribuição automática, convites nem cobrança (`Organization#accounts` não o enxerga);
- aparece para o cliente como **"Suporte Vekoo"** (`account.name`), nunca com o nome da pessoa;
- não recebe push;
- deixa de valer na hora em que a pessoa deixa de ser suporte (REST `404 accountNotFound`, WebSocket recusado).

Quem já participa da organização como pessoa entra pelo próprio vínculo, que vale para o suporte mesmo revogado.

**Registro:** cada `enter` grava um `SupportAccess` (pessoa, organização, vínculo, IP, navegador, quando). Voltar pela URL depois de 30 minutos sem uso grava de novo. Consulta: `bin/rails "support:accesses[20]"` ou `SupportAccess.recent` no console.

---

## Pessoas: `/users`

**Quem pode:** ler é aberto a qualquer sessão, porque o chat, a agenda e os pipelines listam colegas para atribuir. O resto exige `core_settings`.

Quem não tem `core_settings` recebe só o **resumo** (`id`, `name`, `email`, `avatarUrl`, `teamIds`, `setupOnly`) e só de quem está ativo, mesmo pedindo `status=all`.

Cada item é um **vínculo** desta organização (`id` é o `account_id`). Nome, e-mail, telefone, idioma e foto são da pessoa e iguais em todas as organizações dela; papel, grupo, departamentos, `setupOnly` e revogação são do vínculo. A ficha completa traz também `hashid`, `userId`, `support` (sempre `false` aqui: o vínculo de suporte não aparece) e `identityShared` (a pessoa também está em outra organização).

**Regras de `core_settings`:**

- Quem não é dono não mexe no dono (editar, revogar, restaurar, excluir) nem cria ou promove outro dono: `403 forbidden`.
- A organização nunca fica sem um dono com acesso. Dono revogado não conta: `422 lastOwner`.
- Trocar a senha de outra pessoa derruba as sessões e o WebSocket dela.

### `GET /users`

| Parâmetro | Valores |
|---|---|
| `status` | `active` (padrão), `revoked`, `all` |
| `q` | Busca em nome e e-mail |
| `teamId`, `accessRoleId`, `role` | Filtros |
| `perPage` | Padrão **100** aqui, para os seletores de atribuição virem inteiros |

A tela de usuários deve pedir `status=all`. Todo seletor de pessoas usa o padrão, que já esconde quem perdeu o acesso. Para atribuir atendimentos, filtre também por `setupOnly: false` (na tela: "Não atribuir atendimentos").

Resposta para quem administra (`GET /users?perPage=2`):

```json
{
  "users": [
    {
      "id": "3a82f85e-…",
      "name": "Beatriz Lima",
      "email": "beatriz.lima@exemplo.com.br",
      "organizationId": "ddbca24b-…",
      "role": "member",
      "phone": "5541943210987",
      "locale": null,
      "avatarUrl": null,
      "accessRoleId": "df3116de-…",
      "permissions": {
        "dashboard": "all", "custom_dashboards": "all", "flows": "all", "calendar": "all",
        "pipelines": "all", "chat": "all", "chat_list_to": "all", "contacts": "all",
        "catalog": "all", "funnel": "all", "campaigns": "all", "core_settings": "all"
      },
      "createdAt": 1793979568251,
      "teamIds": [],
      "setupOnly": true,
      "revokedAt": null
    }
  ],
  "meta": { "page": 1, "perPage": 2, "total": 6, "totalPages": 3, "hasMore": true }
}
```

A mesma rota, para quem não administra:

```json
{
  "users": [
    { "id": "3a82f85e-…", "name": "Beatriz Lima", "email": "beatriz.lima@exemplo.com.br", "avatarUrl": null, "teamIds": [], "setupOnly": true },
    { "id": "7c80c743-…", "name": "Camila Rocha", "email": "camila.rocha@exemplo.com.br", "avatarUrl": null, "teamIds": ["cdea50c4-…"], "setupOnly": false }
  ],
  "meta": { "page": 1, "perPage": 2, "total": 6, "totalPages": 3, "hasMore": true }
}
```

### `GET /users/:id`

A pessoa, no mesmo formato da listagem. Pessoa revogada responde `404` a quem não administra.

### `GET /users/check-email?email=`

`core_settings`. O primeiro passo do cadastro. Sem `email`: `422`, `field: "email"`.

```json
{ "exists": true, "hasOrganizationAccess": true, "revoked": false }
```

| `exists` | `hasOrganizationAccess` | `revoked` | O que quer dizer |
|---|---|---|---|
| `false` | `false` | `false` | E-mail livre: siga para o cadastro. |
| `true` | `true` | `false` | Já está nesta organização. |
| `true` | `true` | `true` | Está aqui, com o acesso revogado: ofereça restaurar. |
| `true` | `false` | `false` | Já tem conta no Vekoo, em outra organização. O convite cria **só o vínculo**: a pessoa entra com a senha que já usa. |

### `POST /users`

`core_settings`. Para quem ainda não tem conta no Vekoo, `name`, `email` e `password` são obrigatórios (senha de 8 caracteres ou mais), e a pessoa nasce aqui. Para quem já tem, basta `email` e o que é do vínculo (`role`, `accessRoleId`, `teamIds`, `setupOnly`): nome, telefone e senha do pedido são ignorados. Quem já está nesta organização: `422 alreadyMember`. `role` padrão é `member`.

```json
{
  "user": {
    "name": "Larissa Prado",
    "email": "larissa@exemplo.com.br",
    "password": "carrossel123",
    "passwordConfirmation": "carrossel123",
    "phone": "5511912345678",
    "role": "member",
    "accessRoleId": "ecfcd037-…",
    "teamIds": ["cdea50c4-…"],
    "setupOnly": false
  }
}
```

`201`, com a ficha inteira da pessoa:

```json
{
  "id": "4c2f7214-…",
  "name": "Larissa Prado",
  "email": "larissa@exemplo.com.br",
  "organizationId": "ddbca24b-…",
  "role": "member",
  "phone": "5511912345678",
  "locale": null,
  "avatarUrl": null,
  "accessRoleId": "ecfcd037-…",
  "permissions": { "dashboard": "none", "chat": "all", "chat_list_to": "all", "core_settings": "none", "…": "…" },
  "createdAt": 1793979789386,
  "teamIds": ["cdea50c4-…"],
  "setupOnly": false,
  "revokedAt": null
}
```

Validação (`POST /users` com `{ "user": { "name": "", "email": "x" } }`):

```json
{
  "error": {
    "code": "unprocessable",
    "message": "senha não pode ficar em branco",
    "field": "password",
    "details": {
      "password": ["não pode ficar em branco"],
      "name": ["não pode ficar em branco", "é curto demais (mínimo de 2 caracteres)"],
      "email": ["não parece válido"]
    }
  }
}
```

### `PATCH /users/:id`

`core_settings`. Os mesmos campos, todos opcionais. Responde `200` com a ficha.

- `teamIds` **substitui** os departamentos. Sem a chave, nada muda; `[]` limpa.
- `accessRoleId: null` tira a pessoa do grupo, e ela passa a valer pelos padrões de membro.
- `password` vazio é ignorado: é a tela de edição sem ninguém querer trocar. A própria senha responde `422 ownPasswordInProfile`.
- Nome, e-mail, telefone e senha são da pessoa: só mudam por aqui enquanto ela não estiver em outra organização (nem for suporte). Senão, `422 sharedIdentity`, e nada do pedido é gravado. Mandar os mesmos valores de volta não é mudança.

### `POST /users/:id/revoke`

`core_settings`. Corta o acesso sem apagar nada: as sessões caem, o WebSocket aberto é derrubado (`{ "type": "disconnect", "reason": "remote", "reconnect": false }`), o token que a pessoa tinha passa a responder `401 accessRevoked` e `POST /login` também. É idempotente e mantém a data original. Responde a ficha, com `revokedAt` preenchido.

### `POST /users/:id/restore`

`core_settings`. Devolve o acesso. A pessoa entra de novo normalmente. Responde a ficha, com `revokedAt: null`.

### `DELETE /users/:id`

`core_settings`. **Tira o vínculo** desta organização, com os avisos e departamentos dele: `204`. A pessoa continua existindo, com as outras organizações e os aparelhos dela. Ids guardados em conversas e cards ficam órfãos: para só cortar o acesso, use `revoke`, que preserva o histórico.

### `POST /users/:id/transfer-ownership`

`core_settings`, e só quem é dono (ou o suporte): os outros recebem `403`. A pessoa vira dona e quem pediu vira membro (sem grupo), na mesma transação. O suporte passa a posse sem rebaixar ninguém. Responde a ficha da nova dona. Para quem já é dono: `422 alreadyOwner`; vínculo revogado: `422 accountRevoked`.

### `POST /users/leave`

Qualquer sessão, sobre o próprio vínculo: sai desta organização (`204`). O último dono com acesso não sai (`422 lastOwner`); o vínculo de suporte também não (`422 supportCannotLeave`).

---

## Departamentos: `/teams`

**Quem pode:** ler é aberto a qualquer sessão, porque o chat transfere conversas para departamentos e a agenda filtra por eles. O resto exige `core_settings`.

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /teams?active=true` | | `{ "teams": [...], "meta": {...} }`, em ordem de nome, até 100 por padrão |
| `GET /teams/:id` | | o departamento |
| `POST /teams` | `{ "team": { "name": "Financeiro", "active": true } }` | `201` |
| `PATCH /teams/:id` | `{ "team": { "active": false } }` | `200` |
| `DELETE /teams/:id` | | `204`. As pessoas ficam, só os vínculos saem. |

```json
{
  "teams": [
    { "id": "cdea50c4-…", "name": "Atendimento", "active": true, "accountsCount": 2, "createdAt": 1793979567292 },
    { "id": "13e5e8f6-…", "name": "Comercial", "active": true, "accountsCount": 2, "createdAt": 1793979567306 },
    { "id": "1c41cf3e-…", "name": "Pós-venda", "active": true, "accountsCount": 1, "createdAt": 1793979567318 }
  ],
  "meta": { "page": 1, "perPage": 100, "total": 3, "totalPages": 1, "hasMore": false }
}
```

`accountsCount` conta só quem está ativo. O nome é único na organização. Quem pertence a cada departamento vem de `teamIds` em `/users`; o vínculo é editado em `PATCH /users/:id`.

---

## Grupos de permissões: `/access-roles`

**Quem pode:** tudo exige `core_settings`, inclusive ler. `/me` já diz a cada pessoa o que ela pode.

| Rota | Corpo | Resposta |
|---|---|---|
| `GET /access-roles` | | `{ "accessRoles": [...], "meta": {...} }`, em ordem de nome, até 100 por padrão |
| `GET /access-roles/:id` | | o grupo |
| `POST /access-roles` | `{ "accessRole": { "name": "Plantão", "permissions": { "chat": "all", "chat_list_to": "assigned" } } }` | `201` |
| `PATCH /access-roles/:id` | `{ "accessRole": { "permissions": { "contacts": "all" } } }` | `200` |
| `DELETE /access-roles/:id` | | `204` |

```json
{
  "id": "b95cbd3f-…",
  "name": "Plantão",
  "permissions": {
    "dashboard": "none", "custom_dashboards": "none", "flows": "none", "calendar": "none", "pipelines": "none",
    "chat": "all", "chat_list_to": "assigned", "contacts": "none", "catalog": "none", "funnel": "none",
    "campaigns": "none", "core_settings": "none"
  },
  "default": false,
  "defaultKey": null,
  "accountsCount": 0,
  "createdAt": 1793979790782,
  "updatedAt": 1793979790782
}
```

**Permissões**

- Ao criar, o que não veio fica `none` (e `chat_list_to` fica `all`). Ao editar, o que veio é **mesclado**: mandar uma chave não apaga as outras.
- Níveis válidos: `all`, `own`, `none`. Em `chat_list_to`, que diz quais conversas a pessoa enxerga: `all`, `team`, `assigned`.
- Chave ou nível que não existe responde `422`, porque "qualquer valor diferente de `none` libera" e um nível inventado daria acesso.

**Grupos padrão:** `Gerente` (`defaultKey: "manager"`) e `Usuário` (`defaultKey: "member"`), criados com a organização.

- Não mudam de nome (`422`, `field: "name"`) e não saem (`422 defaultAccessRole`). As permissões deles podem ser editadas.
- Use `defaultKey` para traduzir o nome na tela: o nome gravado é dado, em pt-BR.

**Apagar grupo em uso:** as pessoas ficam sem grupo (`accessRoleId: null`) e passam a valer pelos padrões de membro.

---

## Perfil: `/profile`

Qualquer sessão, sempre sobre a própria pessoa. **Nome, telefone, idioma, foto e senha são do `User` e valem em todas as organizações dela.** As respostas trazem o vínculo da aba, no mesmo formato de `account` em `/me` (com a identidade já atualizada).

### `GET /profile`

```json
{
  "id": "03cae3d1-…",
  "name": "Thiago Almeida",
  "email": "thiago.almeida@exemplo.com.br",
  "organizationId": "ddbca24b-…",
  "role": "member",
  "phone": "5521965432109",
  "locale": "pt-BR",
  "avatarUrl": null,
  "accessRoleId": "ecfcd037-…",
  "permissions": { "chat": "all", "core_settings": "none", "…": "…" },
  "createdAt": 1793979567872
}
```

### `PATCH /profile`

```json
{ "profile": { "name": "Thiago A.", "phone": "5521965432109", "locale": "en" } }
```

Para trocar a senha:

```json
{ "profile": { "currentPassword": "carrossel123", "password": "nova-senha-boa", "passwordConfirmation": "nova-senha-boa" } }
```

- `currentPassword` é obrigatória para trocar a senha: `422 wrongPassword`, `field: "currentPassword"`. Se ela estiver errada, nada do pedido é gravado.
- `passwordConfirmation` é opcional, mas se vier precisa bater.
- Trocar a senha derruba as outras sessões da pessoa, em todas as organizações. A sessão atual continua.
- E-mail, papel e grupo não mudam por aqui: são ignorados.
- `locale`: `pt-BR`, `en` ou vazio.

### `POST /profile/avatar`

Multipart, campo `file` (sem envelope). JPEG, PNG ou WebP de até 2 MB, conferido pelo conteúdo do arquivo, não pelo tipo declarado. Sem arquivo: `400`. Fora da regra: `422`, `field: "file"`. A resposta traz a conta, com `avatarUrl` (256×256, JPEG):

```json
{ "avatarUrl": "/rails/active_storage/representations/proxy/eyJfcmFpbHMi…/foto.png" }
```

### `DELETE /profile/avatar`

Tira a foto. Responde a conta, com `avatarUrl: null`.

---

## Organização: `/organization`

A organização da sessão. Mesmo formato de `organization` em `/me` e `/login`.

| Rota | Quem pode |
|---|---|
| `GET /organization` | Qualquer sessão |
| `PATCH /organization` | `core_settings` |
| `PATCH /organization/chat-settings` | `chat`. As preferências ficam na tela do chat, ao alcance de quem atende. |
| `POST` / `DELETE /organization/logo` | `core_settings` |

```json
{
  "id": "ddbca24b-…",
  "name": "Marina Duarte Conteúdo",
  "plan": "free",
  "timezone": "America/Sao_Paulo",
  "features": {},
  "settings": {
    "companyInfo": {
      "businessName": "Marina Duarte Conteúdo Digital Ltda",
      "cnpj": "11222333000181",
      "formattedCnpj": "11.222.333/0001-81",
      "companyName": "Marina Duarte Conteúdo Digital Ltda",
      "validCnpj": true
    },
    "chatSettings": {
      "autoRemoveWaitingOperatorTag": false,
      "reopenConversationOnInboundEnabled": false
    }
  },
  "logoUrl": null,
  "createdAt": 1791387787244
}
```

`companyName` é a razão social ou, sem ela, o nome da organização.

### `PATCH /organization`

```json
{
  "organization": {
    "name": "Marina Duarte Conteúdo",
    "timezone": "America/Sao_Paulo",
    "settings": {
      "companyInfo": { "businessName": "Marina Duarte Conteúdo Digital Ltda", "cnpj": "11.222.333/0001-81" },
      "chatSettings": { "reopenConversationOnInboundEnabled": true }
    }
  }
}
```

- Tudo opcional e **mesclado**: mandar um campo não apaga os outros.
- `timezone` precisa ser um fuso IANA válido. O CNPJ precisa ter 14 dígitos, com ou sem pontuação; vazio limpa. Os dois respondem `422`, com `field: "timezone"` ou `field: "cnpj"`.
- `features`, `plan` e créditos são ignorados: só leitura pela API.

### `PATCH /organization/chat-settings`

```json
{ "chatSettings": { "autoRemoveWaitingOperatorTag": true } }
```

| Campo | O que faz |
|---|---|
| `autoRemoveWaitingOperatorTag` | Remove a etiqueta "aguardando-operador" quando o operador responde. |
| `reopenConversationOnInboundEnabled` | Reabre a conversa fechada quando o contato manda mensagem. Vale na hora. |

Para o back-end: `Organization.reopen_on_inbound_enabled?(id)`, com cache, e `organization.auto_remove_waiting_operator_tag`.

### `POST /organization/logo`, `DELETE /organization/logo`

Mesma regra de arquivo do avatar. A variante sai em PNG, até 512×512, para não perder a transparência. Respondem a organização.

---

## Avisos: `/notifications`

Qualquer sessão. A lista junta **duas fontes**, e é o `key` que diz qual delas o item é:

| | Aviso do produto (`key` preenchido) | Aviso da pessoa (`key: null`) |
|---|---|---|
| Campos | `id`, `key`, `at`, `read` | os mesmos, mais `title`, `description`, `url`, `category`, `actions`, `readAt`, `archivedAt` |
| Texto | A tela traduz: `notifications.<key>.title` | Já vem pronto |
| De quem é | Da **organização inteira**: quem lê, lê por todos | Só da pessoa |
| `id` | UUID | BSON |
| `DELETE` | Apaga para todo mundo | Arquiva |
| `url` e `actions[].urlPath` | | Saem com o prefixo do vínculo de quem recebe: `/a/<hashid>/calendar`. O gravado é o caminho puro. |

O contrato anterior não mudou: `notifications`, `unread` e os quatro campos do aviso do produto continuam iguais. O que entrou é acréscimo.

### `GET /notifications`

| Parâmetro | O que faz |
|---|---|
| `page`, `perPage` | Padrão 20, teto 50 |
| `unread=true`, `read=true` | Nas duas fontes |
| `archived=true` | Só os arquivados da pessoa. Sem isso, arquivado não aparece. |
| `category` | `chat`, `calendar`, `system`, `general`. Aviso do produto conta como `system`. |

`unread` é o total de não lidos, sem considerar os filtros.

`GET /notifications?perPage=3`:

```json
{
  "notifications": [
    {
      "id": "6aedf58bdc9e0b1e25bedfad",
      "key": null,
      "at": 1793976187771,
      "read": false,
      "title": "Novo agendamento confirmado",
      "description": "Ana Beatriz marcou Limpeza de pele para quinta-feira, às 14h.",
      "url": "/a/7kxn7q4r/calendar",
      "category": "calendar",
      "actions": [
        { "action": "open_calendar", "title": "Abrir agenda", "urlPath": "/a/7kxn7q4r/calendar" },
        { "action": "dismiss", "title": "Dispensar" }
      ],
      "readAt": null,
      "archivedAt": null
    },
    {
      "id": "6aedf58bdc9e0b1e25bedfae",
      "key": null,
      "at": 1793968987830,
      "read": false,
      "title": "Conversa atribuída a você",
      "description": "Paulo Mendes está esperando resposta sobre o orçamento da reforma.",
      "url": "/a/7kxn7q4r/chat",
      "category": "chat",
      "actions": [{ "action": "open_chat", "title": "Abrir conversa", "urlPath": "/a/7kxn7q4r/chat" }],
      "readAt": null,
      "archivedAt": null
    },
    { "id": "fb125014-…", "key": "templates", "at": 1793961787442, "read": false }
  ],
  "unread": 4,
  "meta": { "page": 1, "perPage": 3, "total": 7, "totalPages": 3, "hasMore": true }
}
```

`actions[].action` vem da origem: `open_chat`, `open_calendar`, `navigate`, `external_link`, `dismiss`.

### Demais rotas

| Rota | Resposta |
|---|---|
| `GET /notifications/unread-count` | `{ "unreadCount": 4 }` |
| `GET /notifications/:id` | O item, no formato da lista |
| `POST /notifications/:id/read` | O item, com `read: true` e, no aviso da pessoa, `readAt`. Idempotente. |
| `POST /notifications/read-all` | A lista (`notifications`, `unread: 0`, `meta`). Cobre as duas fontes, sem tocar nos arquivados. |
| `DELETE /notifications/:id` | `204` |

### Canal `NotificationsChannel`

`{ "channel": "NotificationsChannel" }`, sem parâmetros: o vínculo vem da conexão (`account=`), e qualquer id enviado no `subscribe` é ignorado.

Ao assinar, e sempre que o total muda por `read`, `read-all` ou `DELETE` (para as outras abas):

```json
{ "unreadCount": 0 }
```

Quando nasce um aviso para a pessoa:

```json
{
  "notification": {
    "id": "6aedf59817e85f2f1c88fd53",
    "key": null,
    "at": 1793979800551,
    "read": false,
    "title": "Teste de fumaça",
    "description": "Nasceu em outro processo.",
    "url": "/a/7kxn7q4r/settings/users",
    "category": "system",
    "actions": [],
    "readAt": null,
    "archivedAt": null
  },
  "unreadCount": 1
}
```

### Para o back-end: como avisar alguém

```ruby
AccountNotice.create!(
  account_id: account.id,
  organization_id: account.organization_id,
  title: "Novo agendamento confirmado",   # até 255
  description: "Com Ana, às 14h",         # até 1000
  category: "calendar",                   # chat, calendar, system, general
  url: "/calendar",
  actions: [ { action: "open_calendar", title: "Abrir agenda", urlPath: "/calendar" } ]
)
```

Criar **já transmite no canal e dispara o push**: não chame os dois à mão. O código reciclado da origem que faz `Notification.create!` precisa virar `AccountNotice.create!`, porque o `Notification` daqui é outro modelo (chave de tradução, da organização inteira). O `recycle.rb` não troca esse nome.

---

## Alertas: `/alerts`

Inconsistências detectadas pelo sistema, por organização: os badges do menu.

**Categorias em uso:** `connectors`, `webhooks`, `flows`. A categoria é texto livre e cada domínio pode criar a sua; o front mostra badge para as que conhece. Na origem, `integrations` e `automations` correspondiam às duas que aqui se chamam `connectors` e `flows`.

### `GET /alerts`

Qualquer sessão. Leve, para o menu:

```json
{ "badges": { "connectors": 2, "webhooks": 1 } }
```

### `GET /alerts/details?category=`

Qualquer sessão. Só os ativos, do mais novo ao mais antigo:

```json
{
  "alerts": [
    {
      "id": "8930c7bf-…",
      "category": "connectors",
      "severity": "warning",
      "originType": "Connector",
      "originId": "seed-whatsapp-oficial",
      "originName": "WhatsApp oficial",
      "code": "template_rejected",
      "message": "A Meta rejeitou o modelo \"confirmacao_agendamento\".",
      "metadata": { "template": "confirmacao_agendamento" },
      "createdAt": 1793979787938,
      "updatedAt": 1793979787938
    },
    {
      "id": "cfebed49-…",
      "category": "webhooks",
      "severity": "error",
      "originType": "Hook",
      "originId": "seed-webhook-crm",
      "originName": "CRM externo",
      "code": "webhook_delivery_failed",
      "message": "Falha na entrega do webhook \"CRM externo\".",
      "metadata": { "webhook_uid": "seed-crm" },
      "createdAt": 1793979787927,
      "updatedAt": 1793979787927
    }
  ],
  "meta": { "page": 1, "perPage": 100, "total": 3, "totalPages": 1, "hasMore": false }
}
```

- `severity`: `error`, `warning` ou `info`.
- `message` sai no idioma da requisição quando vem do `code`. Texto próprio de quem levantou o alerta (erro do provedor, por exemplo) sai como foi gravado. Sem frase para o `code` e sem texto próprio, é `null`: a tela decide o que mostrar pelo `code`.

### `POST /alerts/resolve`

`core_settings`. Corpo solto, porque é uma ação e não um recurso:

```json
{ "originType": "Hook", "originId": "seed-webhook-crm", "code": "webhook_delivery_failed" }
```

Sem `code`, resolve tudo daquela origem. Sem `originType` ou `originId`: `400`, com `field`. Resposta:

```json
{ "resolved": 1, "badges": { "connectors": 2 } }
```

### Canal `OrganizationAlertsChannel`

`{ "channel": "OrganizationAlertsChannel" }`, sem parâmetros: a organização vem do vínculo da conexão. Ao assinar e a cada alerta levantado ou resolvido:

```json
{ "badges": { "connectors": 2, "flows": 1 } }
```

### Para o back-end: como levantar um alerta

```ruby
# Cenários prontos
OrganizationAlertService.connector_disconnected(organization, connector)
OrganizationAlertService.connector_reconnected(organization, connector)
OrganizationAlertService.connector_error(organization, connector, code: "…", message: "…", metadata: {})
OrganizationAlertService.webhook_error(organization, hook, "Connection refused")
OrganizationAlertService.webhook_resolved(organization, hook)
OrganizationAlertService.flow_error(organization, flow, code: "…", message: "…")
OrganizationAlertService.flow_resolved(organization, flow, code: "…")

# Genérico: o concern, em modelo ou serviço
include Alertable
raise_organization_alert!(organization:, category: "connectors", origin_type: "Connector",
                          origin_id: connector.id, origin_name: connector.name, code: "connector_disconnected")
resolve_organization_alert!(organization:, origin_type: "Connector", origin_id: connector.id, code: "connector_disconnected")

# Ou direto na organização
organization.raise_alert(category:, origin_type:, origin_id:, code:)
organization.resolve_alert(origin_type:, origin_id:)
organization.active_alert_badges
```

Um alerta ativo por origem + código: levantar de novo atualiza em vez de duplicar. Para ter a frase traduzida, acrescente o `code` em `organization_alerts.messages` nos locales e não passe `message`.

---

## Push: `/push-devices`

Qualquer sessão, sempre sobre os dispositivos da própria pessoa. Os aparelhos são do `User`, não da organização: valem para os avisos de todas as organizações dela, e as rotas não exigem `X-Account`. O `data.url` do push sai com o prefixo do vínculo de quem recebe (`/a/<hashid>/...`), e o `sw-push.js` só reaproveita a aba que já está naquela organização. Vínculo revogado e vínculo de suporte não recebem.

**VAPID por ENV:** `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:…`). Para gerar as chaves:

```bash
bin/rails runner 'k = WebPush.generate_key; puts k.public_key, k.private_key'
```

Sem as três, o servidor loga e não falha: nada é enviado e os avisos nascem normalmente.

| Rota | O que faz | Resposta |
|---|---|---|
| `GET /push-devices/vapid-public-key` | Chave para o `applicationServerKey` | `{ "publicKey": "…" }`. **`null` sem VAPID:** a tela deve esconder a opção. |
| `GET /push-devices` | Dispositivos da pessoa | `{ "pushDevices": [...], "meta": {...} }` |
| `POST /push-devices` | Guarda a assinatura | `201`, o dispositivo |
| `DELETE /push-devices?endpoint=` | Remove pelo endpoint; **sem endpoint, remove todos os da pessoa** | `204` |
| `DELETE /push-devices/:id` | Remove pelo id | `204` |
| `POST /push-devices/test` | Envia uma notificação de teste | `202`, `{ "enqueued": 2 }` |

### `POST /push-devices`

O corpo é o `subscription.toJSON()` do navegador, no envelope `subscription`:

```json
{
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/fcm/send/abc123",
    "expirationTime": null,
    "keys": { "p256dh": "…", "auth": "…" }
  }
}
```

```json
{ "id": "9b965cea-…", "endpoint": "https://fcm.googleapis.com/fcm/send/abc123", "userAgent": "Mozilla/5.0 …", "createdAt": 1793979793900 }
```

- O `endpoint` identifica o navegador: assinar de novo atualiza em vez de duplicar, e quem entra com outra conta no mesmo navegador herda a assinatura.
- O `endpoint` precisa ser HTTPS, com nome público. IP e nome interno respondem `422`, porque o servidor dá POST nesse endereço.

### `POST /push-devices/test`

Corpo solto e opcional: `{ "title", "body", "url" }`. Sem eles, o texto padrão sai no idioma da requisição. `202` quer dizer "foi para a fila", não "chegou". Sem dispositivo: `422 noPushDevices`. Sem VAPID: `422 pushNotConfigured`.

### O payload que o `sw-push.js` recebe

Mesmo formato da origem:

```json
{
  "title": "Novo agendamento",
  "body": "Com Ana, às 14h",
  "tag": "notice-6aedf59817e85f2f1c88fd53",
  "data": { "url": "/a/7kxn7q4r/calendar", "timestamp": 1793979800, "noticeId": "6aedf59817e85f2f1c88fd53", "category": "calendar" },
  "actions": [{ "action": "open_calendar", "title": "Abrir agenda", "urlPath": "/a/7kxn7q4r/calendar" }],
  "requireInteraction": false,
  "silent": false,
  "vibrate": [200, 100, 200]
}
```

`icon` e `badge` só vêm quando alguém os passa: sem eles, vale o padrão do service worker, porque quem sabe quais arquivos o front publica é o front. O corpo é cortado em 500 caracteres.

### Entrega

Um job por dispositivo (`Push::DeliveryJob`, fila `default`), para uma assinatura com problema não atrasar as outras e a nova tentativa não repetir a notificação em quem já recebeu.

| Resposta do serviço de push | O que acontece |
|---|---|
| 410, 404 | A assinatura é **removida**. |
| 401, 403 | Loga e mantém: as chaves VAPID podem ter mudado. |
| 413 | Loga, sem nova tentativa. |
| 429, 5xx, erro de rede | Até 5 tentativas, depois loga e desiste. |

Quem foi revogado não recebe, mas a assinatura fica, para o caso de o acesso voltar.

### Para o back-end

Para avisar alguém, prefira `AccountNotice.create!`, que também aparece na lista. Para só empurrar a notificação:

```ruby
# `recipient` é a Account ou o e-mail, como o código reciclado da origem chama.
Push::Delivery.send_notification(account, "Título", "Texto", url: "/calendar", tag: "agenda", actions: [])
# => { success: true, enqueued: 2 } ou { success: false, error: "noDevices" | "notConfigured" }
```

---

## Mudanças em rotas que já existiam

Tudo acréscimo: nenhum campo existente mudou.

| Rota | O que muda |
|---|---|
| `GET /me`, `POST /login`, `POST /signup` | `account` ganha `locale` e `avatarUrl`. `organization` ganha `settings` e `logoUrl`. |
| `POST /login` | Novo erro `401 accessRevoked`. |
| Toda rota com sessão | O token de quem foi revogado responde `401 accessRevoked`, em vez de `unauthorized`. |
| `GET /notifications`, `POST /notifications/read-all` | Ganham `meta` e os avisos da pessoa. A lista passa a ser paginada (20 por padrão). |
| **Multi-organização** | |
| Toda rota de organização | Lê a organização de `X-Account` (ver Regras gerais). Novos erros `accountNotFound`, `accountRevoked` (403), `accountRequired`. |
| `GET /me`, `POST /login`, `POST /signup` | Ganham `user` e `accounts`; `account`, `organization` e `credits` podem vir `null` (mais de uma organização, sem `X-Account`). `account` ganha `hashid`, `userId` e `support`. |
| `/users` | Ficha ganha `hashid`, `userId`, `support`, `identityShared`. `POST` com e-mail de quem já tem conta cria só o vínculo; `DELETE` tira só o vínculo. Novos: `transfer-ownership`, `leave`. |
| `/profile` | Grava na pessoa (vale em todas as organizações). |
| `/push-devices` | Da pessoa, sem `X-Account`: um aparelho recebe os avisos de todas as organizações dela. |
| Avisos e push | `url` e `urlPath` com o prefixo `/a/<hashid>` de quem recebe. |

## Semente

`bin/rails db:seed`, na organização de `marina.duarte@exemplo.com.br`. Senha de todos: `carrossel123`.

A Marina também participa de uma segunda organização, **Clínica Bem Viver** (dona: Patrícia Gomes, `patricia.gomes@exemplo.com.br`), como `Gerente`, com três mensagens rápidas: é o que exercita a escolha de organização e duas abas ao mesmo tempo. Fora de produção, a semente cria o suporte da demonstração, `suporte@vekoo.com.br` / `suporte-vekoo-123` (`master`, sem organização própria); em produção nunca, nem com `SEED_DEMO_DATA=1`.

| Pessoa | Grupo | Departamentos | Observação |
|---|---|---|---|
| Marina Duarte | (dona) | | Tem os avisos e alertas abaixo |
| Rafael Nunes | Gerente | Comercial | |
| Beatriz Lima | Gerente | | `setupOnly`: administra, mas não atende |
| Camila Rocha | Atendimento por departamento | Atendimento | Só vê conversas do departamento |
| Thiago Almeida | Usuário | Atendimento, Pós-venda | |
| Juliana Ferreira | Usuário | Comercial | |

Também traz: grupos `Gerente`, `Usuário` e `Atendimento por departamento`; departamentos `Atendimento`, `Comercial` e `Pós-venda`; 5 avisos da Marina (2 não lidos, 2 lidos, 1 arquivado); 3 alertas ativos (2 em `connectors`, 1 em `webhooks`); e os dados da empresa.

Índices do Mongo: `bin/rails db:mongoid:create_indexes`.
