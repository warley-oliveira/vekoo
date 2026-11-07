# Catálogo (`products`): contrato da API

Base: `/products`. O nome não é `catalog` porque `GET /catalog` já é o acervo da ferramenta de carrosséis (temas, imagens, paletas).

Todas as respostas abaixo são reais, capturadas de um Rails e um Sidekiq rodando com a semente (`db/seeds/products.rb`). Listas e ids longos foram encurtados com `…`.

## Regras gerais

| | |
|---|---|
| **Sessão** | `Authorization: Bearer <token>`. Sem ela: `401 unauthorized`. |
| **Permissão** | Recurso `catalog` em todas as rotas e no canal. Sem ele: `403 forbidden`. |
| **Organização** | Sempre a da sessão. Id de outra organização responde `404`, igual a id que não existe. |
| **Entrada** | camelCase, com **envelope**: `{ item: {…} }`, `{ category: {…} }`, `{ fieldDefinition: {…} }`, `{ image: {…} }`. |
| **Saída** | camelCase. Ids são string (UUID). Datas em **milissegundos**. |
| **Idioma** | `?locale=` ou `Accept-Language`. Vale para `message` e para os rótulos de `targets`. O `code` nunca muda. |

## Itens

### `GET /products/items`

A grade da tela: filtra, ordena e pagina. Não usa embeddings, então não tem custo por tecla.

| Parâmetro | Descrição |
|---|---|
| `q` | Texto: plural e frase ("cadeiras pretas") e pedaço de palavra ("camis"), sem acento nem caixa. |
| `tags[]` | Qualquer uma das tags. |
| `categories[]` | **Caminho** da categoria (`moda/feminino`), e vale a subárvore inteira. |
| `custom[<chave>]` | Igualdade em campo personalizado. O valor é convertido para o tipo do campo. |
| `custom[<chave>][min]`, `[max]` | Faixa numérica. Valores que não são número ficam de fora. |
| `includeInactive` | `true` traz também os inativos. **Padrão: só ativos.** |
| `active` | `true` ou `false`: só essa situação, e vale mais que `includeInactive`. É o filtro "Situação" da grade. |
| `sortBy` | `title`, `createdAt`, `updatedAt` (padrão), `externalId`, também em snake_case. Fora disso, cai no padrão. |
| `sortOrder` | `asc`, `desc` (padrão). |
| `page`, `perPage` | Padrão 24 por página, máximo 100. |

```json
{
  "items": [
    {
      "id": "23667ed9-ed79-4438-b075-bac825be6e47",
      "title": "Almofada de Algodão Bordada",
      "summary": "Capa de almofada de 45 cm, bordada à mão em ponto cruz.",
      "externalId": "DOM-DEC-001",
      "url": "https://domastore.exemplo.com.br/produtos/almofada-bordada",
      "active": true,
      "tags": ["artesanal"],
      "customFields": { "cor": "Mostarda", "preco": 109.9, "material": "Algodão", "em_estoque": true },
      "images": [
        {
          "id": "90849e3a-ce2e-4f1e-91b2-a22d34f5e766",
          "url": "https://picsum.photos/seed/doma-almofada-bordada-1/800/800",
          "thumbUrl": "https://picsum.photos/seed/doma-almofada-bordada-1/800/800",
          "alt": "Almofada de Algodão Bordada, foto 1",
          "position": 0,
          "hosted": false,
          "createdAt": 1793979893267
        }
      ],
      "createdAt": 1788968693223,
      "updatedAt": 1788968693223
    }
  ],
  "meta": { "page": 1, "perPage": 2, "total": 24, "totalPages": 12, "hasMore": true }
}
```

### `GET /products/search`

O teste de busca da tela, e o que um fluxo encontraria: resultado **ranqueado**, sem paginação.

Parâmetros: `q`, os mesmos filtros de `/products/items` e `limit` (padrão 10, máximo 20).

```json
{
  "items": [ { "id": "…", "title": "Vestido Midi de Linho", "…": "mesmo formato de /products/items" } ],
  "meta": { "total": 2, "strategy": "lexical" }
}
```

`meta.strategy` diz o que respondeu. Mostre isso na tela: é o que explica "por que não achou".

| `strategy` | Quando | `meta.total` |
|---|---|---|
| `exact` | `q` é o SKU exato de um item. | 1 |
| `hybrid` | Vetor + texto. Precisa de `OPENAI_API_KEY`. | Devolvidos (até `limit`) |
| `lexical` | Só texto (tsvector): sem chave, ou com a OpenAI fora do ar ou lenta. Sem erro. | Devolvidos (até `limit`) |
| `text` | O tsvector não casou nada e o `ILIKE` casou, ou nada casou em lugar nenhum (`items` vazio). | **Todos** que casam |
| `browse` | Sem `q`: só os filtros, dos mais novos para os mais antigos. | **Todos** que casam |
| `none` | Só na API Ruby, sem organização. | 0 |

### `GET /products/items/:id`

O item completo, para a tela de edição: o formato acima mais `description` e `categories`.

```json
{
  "id": "23667ed9-ed79-4438-b075-bac825be6e47",
  "title": "Almofada de Algodão Bordada",
  "…": "…",
  "description": null,
  "categories": [
    { "id": "de3a2339-85b3-4743-9ab4-8dbc2d0ab35b", "name": "Decoração", "path": "casa/decoracao" }
  ]
}
```

### `POST /products/items` e `PATCH /products/items/:id`

```json
{
  "item": {
    "title": "Toalha de Banho Felpuda",
    "summary": "Algodão egípcio, 500 g/m².",
    "description": "Secagem rápida.",
    "externalId": "DOM-BAN-001",
    "url": "https://domastore.exemplo.com.br/produtos/toalha",
    "active": true,
    "tags": ["banho", "presente"],
    "customFields": { "preco": "1.234,50", "cor": "Branco", "em_estoque": "true" },
    "categoryIds": ["16beebfc-7f5e-4f90-a3ad-5aa8dc81413a"]
  }
}
```

Responde `201` (ou `200`) com o item completo. Nesse exemplo, `customFields` volta como `{ "preco": 1234.5, "cor": "Branco", "em_estoque": true }`.

- `title` é o único obrigatório: até 300 caracteres. `summary`: até 1500. `tags`: até 50.
- `customFields` **substitui o mapa inteiro**, e cada valor é convertido para o tipo do campo. Valor vazio some. Valor inválido (`"caro"` em campo número) responde `422` em `customFields`, nomeando o campo.
- `categoryIds`: ausente deixa como está, `[]` remove todas. Id de outra organização é ignorado.
- `url` precisa ser http(s). SKU repetido responde `422` em `externalId`.
- `externalId` em branco apaga o SKU, exceto a chave automática da importação (`auto:…`), que continua: a tela pode mostrá-la como "sem código" e devolver vazio ao salvar, sem o item duplicar na próxima reimportação.
- **`required` e `defaultValue` são regra da tela**, como na origem: a API guarda e devolve esses valores, mas não os aplica.

### `DELETE /products/items/:id`

`204`. Leva imagens, vínculos e vetor.

### `POST /products/items/bulk-destroy`

```json
{ "ids": ["…", "…"] }
```

Responde `{ "deleted": 2 }`. Ids de outra organização são ignorados, sem erro. Acima de 500 ids: `422 tooManyIds`.

## Imagens

Saem dentro do item, ordenadas: a primeira é a principal.

| Campo | |
|---|---|
| `url` | `hosted: true`: caminho **relativo** à API. Prefixe com `VITE_API_URL`, como `lib/image.ts` já faz com os uploads. `hosted: false`: URL externa. |
| `thumbUrl` | `hosted: true`: miniatura WebP de até 400 px. `hosted: false`: a mesma URL externa. |
| `hosted` | Se o arquivo está no nosso storage (upload ou espelhada). |

### `POST /products/items/:itemId/images`

Multipart, campo `file`. JPEG, PNG, WebP ou GIF, até 10 MB. O tipo é conferido pelo conteúdo do arquivo, não pelo que o navegador declara. Item ainda não salvo não tem imagem: salve o item primeiro. Responde `201`:

```json
{
  "id": "4a5059d8-f430-41ae-bf78-f06758977cb2",
  "url": "/rails/active_storage/blobs/proxy/eyJfcmFpbHMi…/product-4cbed31e-…-d795632a.png",
  "thumbUrl": "/rails/active_storage/representations/proxy/eyJfcmFpbHMi…/product-4cbed31e-…-d795632a.png",
  "alt": null,
  "position": 1,
  "hosted": true,
  "createdAt": 1793979954518
}
```

### `POST /products/items/:itemId/images`, com uma URL

Para a foto que já está na internet: JSON, sem `file`.

```json
{ "image": { "sourceUrl": "https://loja.exemplo.com.br/fotos/vestido.jpg", "alt": "Vestido" } }
```

Responde `201` com a imagem, ainda `hosted: false`, e agenda a cópia para o nosso storage (`Products::MirrorImageJob`, fila `low`), a mesma da importação. A cópia pode falhar sem erro: a imagem só continua externa. `422` em `sourceUrl`: em branco ou sem http(s).

### `PATCH /products/images/:id`

`{ "image": { "position": 0, "alt": "Toalha dobrada" } }`. Responde `200` com a imagem. É assim que se reordena e se escolhe a principal.

### `DELETE /products/images/:id`

`204`.

## Categorias

### `GET /products/categories`

A árvore inteira, plana e sem paginação, com cada filho logo depois do pai e, entre irmãos, por `position` e depois pelo nome. Use `depth` para o recuo.

```json
{
  "categories": [
    {
      "id": "72242ad3-6f73-4a15-8f41-ec7d5685acfc",
      "name": "Acessórios",
      "slug": "acessorios",
      "path": "acessorios",
      "parentId": null,
      "position": 1,
      "itemsCount": 0,
      "depth": 0,
      "createdAt": 1793979891973,
      "updatedAt": 1793979891973
    },
    {
      "id": "e2991167-2fc7-4b1e-b3df-37ba4ae3c6ef",
      "name": "Bolsas",
      "slug": "bolsas",
      "path": "acessorios/bolsas",
      "parentId": "72242ad3-6f73-4a15-8f41-ec7d5685acfc",
      "position": 0,
      "itemsCount": 3,
      "depth": 1,
      "createdAt": 1793979892031,
      "updatedAt": 1793979892031
    }
  ],
  "meta": { "total": 13 }
}
```

`itemsCount` conta os vínculos diretos da categoria, sem os dos filhos.

### `POST /products/categories` e `PATCH /products/categories/:id`

`{ "category": { "name": "Banho", "parentId": "…", "position": 0 } }`. Responde `201` (ou `200`) com a categoria.

- `parentId: null` volta para a raiz.
- Renomear ou mover leva a subárvore junto. Os itens afetados são reindexados em segundo plano.
- `422` em `name`: em branco, sem nenhuma letra ou número, ou repetido no mesmo nível.
- `422` em `parentId`: pai de outra organização ou inexistente, a própria categoria ou uma de dentro dela, ou mais de 6 níveis.

### `DELETE /products/categories/:id`

`204`. **Leva a subárvore inteira** e os vínculos. Os itens continuam existindo. Confirme na tela.

## Campos personalizados

### `GET /products/field-definitions`

```json
{
  "fieldDefinitions": [
    {
      "id": "3c54fe04-029b-4409-9e88-4fd793e471cb",
      "name": "Preço",
      "key": "preco",
      "description": "Preço de venda em reais.",
      "valueType": "number",
      "optionValues": [],
      "defaultValue": null,
      "required": true,
      "searchable": false,
      "position": 0,
      "createdAt": 1793979891860,
      "updatedAt": 1793979891860
    }
  ],
  "meta": { "total": 8 },
  "valueTypes": ["text", "number", "list", "checkbox", "date", "url"]
}
```

| `valueType` | Como o valor sai em `customFields` |
|---|---|
| `text`, `list` | texto |
| `number` | número. A entrada aceita `10,5`, `10.5`, `1.234,56` e `R$ 1.234,56`. |
| `checkbox` | booleano. A entrada aceita `true`/`false` e `sim`/`não`. |
| `date` | `AAAA-MM-DD`. A entrada aceita também `31/12/2026`. |
| `url` | texto, só http(s) |

### `POST /products/field-definitions` e `PATCH /products/field-definitions/:id`

```json
{
  "fieldDefinition": {
    "name": "Voltagem",
    "description": "…",
    "valueType": "list",
    "optionValues": ["110V", "220V", "Bivolt"],
    "defaultValue": "Bivolt",
    "required": false,
    "searchable": true,
    "position": 3
  }
}
```

Responde `201` (ou `200`) com o campo.

- A **`key`** nasce do nome e **nunca muda**: é a chave em `customFields`. Renomear o campo não a altera, e mandá-la é ignorado.
- `optionValues` substitui a lista. Para cadastrar uma opção direto na tela do item, mande as existentes + a nova.
- `searchable` decide se o valor entra na busca por texto e no vetor. O filtro `custom[…]` funciona com qualquer campo.
- `422` em `name` (em branco ou repetido), `valueType` (fora da lista) ou `optionValues` (lista sem opções).

### `DELETE /products/field-definitions/:id`

`204`. Os valores já preenchidos continuam nos itens.

## Importação

Duas fases: o arquivo cru sobe, a pessoa escolhe o mapeamento, e o processamento roda em job, com progresso pelo canal.

```
POST /products/imports  ->  status "ready"  (cabeçalho, amostra e sugestão)
POST .../:id/start      ->  202, o job entra na fila
canal: progress … completed | error
```

Assine o canal **antes** de chamar `start`, para não perder o primeiro evento.

### `POST /products/imports`

Multipart, campo `file`. CSV ou TSV de até 50 MB, UTF-8 (com ou sem BOM) ou Windows-1252. O delimitador é detectado (`,` `;` tab `|`). Responde `201`:

```json
{
  "id": "2547aa5f-4800-46b6-8b68-8e463ac74429",
  "status": "ready",
  "filename": "catalogo.csv",
  "delimiter": ";",
  "mapping": {},
  "options": {},
  "totalRows": 0,
  "processedRows": 0,
  "createdCount": 0,
  "updatedCount": 0,
  "errorCount": 0,
  "percentage": 0,
  "createdAt": 1793979955056,
  "startedAt": null,
  "completedAt": null,
  "headers": ["Código", "Nome do Produto", "Resumo", "Categoria", "Tags", "Fotos", "Preço", "Disponível"],
  "sampleRows": [
    {
      "Código": "IMP-001",
      "Nome do Produto": "Sandália de Couro",
      "Resumo": "Couro legítimo – feita à mão",
      "Categoria": "Calçados",
      "Tags": "verão|couro",
      "Fotos": "https://picsum.photos/seed/doma-import-1/400/400",
      "Preço": "R$ 1.299,90",
      "Disponível": "Sim"
    }
  ],
  "suggestedMapping": {
    "Código": "external_id",
    "Nome do Produto": "title",
    "Resumo": "summary",
    "Categoria": "categories",
    "Tags": "tags",
    "Fotos": "images",
    "Disponível": "active"
  },
  "targets": [
    { "value": "title", "label": "Título", "kind": "native" },
    { "value": "summary", "label": "Resumo", "kind": "native" },
    { "value": "custom:guia_de_medidas", "label": "Guia de medidas", "kind": "custom", "valueType": "url" }
  ]
}
```

- `sampleRows` traz até 20 linhas. As chaves de `sampleRows`, `suggestedMapping` e `mapping` são os nomes das colunas, como vieram.
- `targets` são os destinos possíveis de cada coluna. Nativos: `title`, `summary`, `description`, `external_id`, `url`, `active`, `categories`, `tags`, `images`. Personalizados: `custom:<key>`.
- Para `categories`, `tags` e `images`, a célula aceita vários valores separados por `|` ou `;`.

### `POST /products/imports/:id/start`

```json
{
  "mapping": { "Código": "external_id", "Nome do Produto": "title", "Preço": "custom:preco" },
  "options": { "dedupeByTitle": true, "mirrorImages": true }
}
```

Responde `202` com a importação, ainda em `status: "ready"`: ela passa a `processing` quando o job começa.

| Opção | Efeito |
|---|---|
| `dedupeByTitle` | Linha sem SKU usa o título como chave: reimportar atualiza em vez de duplicar. Desligada, a chave é o nome do arquivo + a linha. **Deixe ligada por padrão na tela.** |
| `mirrorImages` | Copia as imagens externas para o nosso storage, em segundo plano. Recomendado para envio no WhatsApp. Falha de cópia não é erro: a imagem só continua externa. |

Regras do processamento:

- O SKU (`external_id`) é a chave: o que já existe é atualizado. Linha sem SKU recebe um código `auto:<hash>`. **A tela deve tratar `externalId` começando com `auto:` como "sem código"**, sem mostrá-lo como SKU. Devolvê-lo em branco ao salvar é seguro.
- Só o que foi mapeado muda. Reimportar uma tabela de preços não apaga descrição, e só mexe em `active` se essa coluna vier. `customFields` faz merge por chave; `tags` só troca se vierem. Categorias e imagens só somam, nunca removem.
- Linha com erro (sem título) não para a importação: entra em `errorCount` e em `errorSample`.
- Linha toda em branco é ignorada, sem contar como erro.
- Valor personalizado que não dá para converter e link que não é http(s) são descartados, sem perder a linha.

### `GET /products/imports/:id`

O estado atual. É como se recupera quando o WebSocket cair. Traz `errorSample`, com até 50 erros e `line` igual à linha da planilha, a mesma que a pessoa vê no Excel.

```json
{
  "id": "2547aa5f-4800-46b6-8b68-8e463ac74429",
  "status": "completed",
  "filename": "catalogo.csv",
  "delimiter": ";",
  "mapping": { "Código": "external_id", "Nome do Produto": "title", "…": "…" },
  "options": { "mirrorImages": true, "dedupeByTitle": true },
  "totalRows": 4,
  "processedRows": 4,
  "createdCount": 3,
  "updatedCount": 0,
  "errorCount": 1,
  "percentage": 100.0,
  "createdAt": 1793979955056,
  "startedAt": 1793979955138,
  "completedAt": 1793979955424,
  "errorSample": [ { "line": 4, "message": "título vazio" } ]
}
```

`status`: `ready` · `processing` · `completed` · `failed` (`pending` existe no modelo, mas nenhum fluxo o usa). Na falha, o motivo é o último `errorSample`, com `line: null` quando não é de uma linha.

### `GET /products/imports`

Histórico, das mais novas para as mais antigas: `{ "imports": [ … ], "meta": { … } }`. Mesmo formato, sem `errorSample`. Padrão 20 por página.

### `DELETE /products/imports/:id`

`204`. **Chame ao cancelar na tela de mapeamento**, para o arquivo cru não ficar ocupando espaço. Se a tela não chamar, a varredura apaga depois de 7 dias. Em andamento: `422 importInProgress`.

## Tempo real: `ProductImportChannel`

```ts
useChannel("ProductImportChannel", {}, handler)
```

Sem parâmetros: o stream é o da organização da sessão (`org:<id>:product_imports`), e parâmetro nenhum muda isso. Quem não tem o recurso `catalog` é recusado. Somente leitura: quem começa a importação é `POST …/start`.

**A stream é da organização inteira: filtre por `data.importId`.** Duas pessoas podem importar ao mesmo tempo.

| `action` | Quando |
|---|---|
| `progress` | No início (duas vezes: sem e com a estimativa de linhas) e a cada 500 linhas. |
| `completed` | Terminou. Agora `total` é exato. |
| `error` | Falhou ou foi interrompida. |

Sequência real de uma importação:

```json
{ "action": "progress", "data": { "importId": "2547aa5f-…", "status": "processing", "processed": 0, "total": 0, "created": 0, "updated": 0, "errors": 0, "percentage": 0 } }
{ "action": "progress", "data": { "importId": "2547aa5f-…", "status": "processing", "processed": 0, "total": 5, "created": 0, "updated": 0, "errors": 0, "percentage": 0.0 } }
{ "action": "completed", "data": { "importId": "2547aa5f-…", "status": "completed", "processed": 4, "total": 4, "created": 3, "updated": 0, "errors": 1, "percentage": 100.0 } }
```

Em erro:

```json
{ "action": "error", "data": { "importId": "2547aa5f-…", "code": "importFailed", "message": "Não foi possível terminar a importação. Tente de novo." } }
```

- `code`: `importFailed` (inclusive arquivo malformado, com a linha na mensagem) ou `importInterrupted` (o processo morreu: reinício ou deploy).
- `message` vem no idioma de quem iniciou a importação, inclusive no canal. A exceção é `importInterrupted`, que sai de uma varredura sem requisição, em pt-BR: traduza pelo `code`.
- `total` é uma estimativa até `completed`, e pode encolher nele: linhas em branco contam na estimativa.
- **A transmissão é melhor esforço.** Se o Redis falhar, a importação continua e só o aviso se perde. Ao reconectar, ou se o progresso parar, leia `GET /products/imports/:id`.

## Erros

Formato: `{ "error": { "code", "message", "field"?, "details"? } }`. `field` é o campo para pôr o foco, e `details` é o mapa campo → mensagens.

```json
{
  "error": {
    "code": "unprocessable",
    "message": "título não pode ficar em branco",
    "field": "title",
    "details": {
      "title": ["não pode ficar em branco"],
      "url": ["precisa começar com http:// ou https://"]
    }
  }
}
```

| HTTP | `code` | Quando |
|---|---|---|
| 400 | `parameterMissing` | Sem envelope, envelope que não é objeto, ou sem `file`. `field` diz qual. |
| 401 | `unauthorized` | Sem sessão. |
| 403 | `forbidden` | Sem o recurso `catalog`. |
| 404 | `notFound` | Não existe, ou é de outra organização. |
| 422 | `unprocessable` | Validação; ver `field` e `details`. |
| 422 | `conflict` | Duas requisições criaram o mesmo registro ao mesmo tempo. |
| 422 | `tooManyIds` | Mais de 500 ids em `bulk-destroy`. |
| 422 | `fileTooLarge` | Importação acima de 50 MB. `field: "file"`. |
| 422 | `unreadableFile` | Não é CSV/TSV legível (`.xlsx`, PDF, UTF-16, vazio). `field: "file"`. |
| 422 | `titleNotMapped` | `start` sem nenhuma coluna em `title`. `field: "mapping"`. |
| 422 | `importAlreadyStarted` | `start` numa importação que já saiu de `ready`. |
| 422 | `importInProgress` | `DELETE` numa importação em andamento. |

## Para a tela (fe-contacts-catalog)

Pontos fáceis de errar:

1. **Mande `includeInactive=true` na grade de gestão.** Sem isso, item desativado some sem caminho de volta. A origem tinha esse defeito: o selo "Inativo" existia, mas nunca aparecia.
2. **`url` de imagem hospedada é relativa.** Prefixe com `VITE_API_URL`; a externa já é absoluta.
3. Use `thumbUrl` na grade, não `url`: a original pode ter 10 MB.
4. `externalId` com `auto:` é chave interna, e não um SKU para mostrar. Devolver em branco não a apaga.
5. Filtro de categoria usa o `path`; o `categoryIds` do item usa o `id`.
6. `customFields` volta com tipo. Formulário de texto converte com `String(value)`, como fazia a origem.
7. Valide na tela o `required` dos campos e a regra de só haver imagem em item já salvo.
8. Mostre `meta.strategy` no teste de busca. `lexical` e `text` significam "a busca semântica não participou".
9. Toda rota de escrita com envelope camelCase: `fieldDefinition`, e não `definition`.

### De onde cada função da origem foi parar

| Origem (`use-catalog.ts`, `use-catalog-import.ts`) | Aqui |
|---|---|
| `useCatalogItems` | `GET /products/items`, **agora com `q` funcionando**: a origem mandava e o back-end ignorava |
| `useCatalogItem` | `GET /products/items/:id` |
| `useCatalogCategories` | `GET /products/categories` |
| `useCatalogFields` | `GET /products/field-definitions` |
| `createItem`, `updateItem`, `deleteItem` | `POST`, `PATCH`, `DELETE /products/items` |
| `bulkDelete` | `POST /products/items/bulk-destroy` |
| `search` (`CatalogSearchProbe`) | `GET /products/search` |
| `uploadImage`, `deleteImage` | `POST /products/items/:itemId/images`, `DELETE /products/images/:id` |
| `saveCategory`, `deleteCategory` | `POST`, `PATCH`, `DELETE /products/categories` |
| `saveField`, `deleteField` | `POST`, `PATCH`, `DELETE /products/field-definitions` |
| `uploadFile` | `POST /products/imports` |
| `startImport` | `POST /products/imports/:id/start` |
| `CatalogImportChannel` | `ProductImportChannel` |

Formato de resposta que mudou, para quem reaproveitar os hooks: `data` → nome do recurso (`items`, `categories`…); `total`, `totalPages` → `meta`; `errors` → `error.details`.

## API Ruby, para um bloco de fluxo

O `catalog_enabled` da assistente ficou fora, porque assistente não existe aqui. Quem automatiza chega ao catálogo pelo bloco de fluxo `catalog_search` (`lib/flow_runtime/nodes/catalog_search.rb`) ou pela extensão `catalog.*` do motor de scripts (`lib/mini_racer_engine/workers/catalog.rb`). Os dois usam este serviço, o mesmo da tela:

```ruby
result = Products::SearchService.new(
  organization.id,                 # obrigatório; nil devolve vazio, strategy "none" (falha fechada)
  query: "caneca para presente",   # opcional; sem query, navega pelos filtros
  filters: {
    tags: ["presente"],            # qualquer uma
    categories: ["casa"],          # caminho, com a subárvore
    custom: {
      "preco" => { "max" => 100 }, # faixa: "min" e/ou "max"
      "em_estoque" => true         # igualdade, no tipo do campo
    },
    include_inactive: false        # padrão: só ativos
  },
  limit: 5                         # padrão 10, máximo 20
).call

result.strategy  # => "lexical"  ("exact", "hybrid", "lexical", "text", "browse", "none")
result.total     # => 2
result.items     # => [#<Products::Item>, …], na ordem do ranking, sem as colunas de índice
```

Nunca levanta por causa da OpenAI: sem chave, com erro ou com demora (3 s), a busca segue pelo texto. Pode rodar na thread da requisição, e o embedding de uma mesma frase fica em cache por 6 horas. O escopo é o `organization.id` que você passar: **nunca passe um id que venha da mensagem do cliente.**

Com o item na mão:

```ruby
item = result.items.first

item.title                     # "Caneca de Cerâmica Artesanal"
item.external_id               # "DOM-COZ-001"
item.custom_fields             # { "cor" => "Terracota", "preco" => 59.9, … }
item.custom_field("preco")     # 59.9
item.primary_image             # #<Products::Image> ou nil
item.images                    # em ordem, a principal primeiro
item.categories.map(&:display_path)  # ["Casa > Cozinha", "Presentes"]

# Para mandar pelo WhatsApp: URL absoluta, com a extensão no nome do arquivo, que é por
# onde a entrega decide que é imagem. Hospedada ou externa, o chamador não precisa saber.
item.primary_image&.delivery_url

# O mesmo JSON da API, sem N+1:
Products::ItemSerializer.many(result.items)
```

Para achar um item por referência, sempre pelo escopo da organização:

```ruby
items = Products::Item.for_organization(organization.id)
items.find_by(external_id: "DOM-COZ-001")
```

`Products::Image#delivery_url` usa o host de `routes.default_url_options` (em produção, `BACKEND_URL`), ou `delivery_url(host: "https://…")`.

## Operação

| | |
|---|---|
| `OPENAI_API_KEY` | Opcional. Sem ela, o catálogo funciona inteiro e a busca é só por texto. Ao colocá-la, o job recorrente alcança o que já existe (5 mil itens por hora). Para não esperar: `Products::BackfillEmbeddingsJob.perform_now`. |
| pgvector | **Obrigatório no Postgres**: a migration `20261107000301` roda `enable_extension "vector"`. |
| Filas | `low`: embeddings, importação, reindexação, cópia de imagem e varreduras. |
| Recorrentes | `config/schedule/products.yml`: `Products::BackfillEmbeddingsJob` (de hora em hora) e `Products::SweepStaleImportsJob` (a cada 15 min: encerra importação parada há 30 min e apaga a abandonada há 7 dias). |
| Limite de corpo | A importação sobe até 50 MB: `max_request_body` do `deploy.yml` precisa continuar nesse valor. |
