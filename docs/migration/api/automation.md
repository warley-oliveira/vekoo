# Contrato da API: domínio "automation"

Fluxos, ferramentas e webhooks. É daqui que `fe-automation` parte. As respostas de exemplo são de verdade: saíram da verificação de ponta a ponta, com Puma, os dois Sidekiq e um provedor simulado.

Conteúdo: [Regras gerais](#regras-gerais) · [Fluxos](#fluxos) · [Definição](#a-definição-do-fluxo) · [Catálogo de blocos](#catálogo-de-blocos) · [Execuções](#execuções) · [Teste do editor](#teste-do-editor) · [Modelos](#modelos-de-fluxo) · [Ferramentas](#ferramentas) · [Webhooks](#webhooks) · [Entrada do webhook](#entrada-do-webhook) · [Logs](#logs-de-webhook) · [Tempo real](#tempo-real) · [Disparo](#como-uma-mensagem-vira-execução) · [Créditos](#créditos) · [API JS](#api-js-appointment-e-classgroup) · [Hooks da origem](#hooks-da-origem) · [Semente](#semente) · [Para o deploy](#para-o-deploy) · [Limitações](#limitações-conhecidas)

## Regras gerais

- Sessão por `Authorization: Bearer`, e a organização vem dela. Chaves em camelCase, datas em milissegundos.
- **`definition` é mapa livre e passa intacto**, na ida e na volta. Lá dentro, as conexões são camelCase (`sourceHandle`, como no xyflow) e o `data` de cada bloco é snake_case (`system_prompt`, `save_to`). A API não converte nada.
- O mesmo vale para `variables`, `credentials`, `headers` e `body`: as chaves são da pessoa.
- Listagens: `{ <recurso>: [...], meta: { page, perPage, total, totalPages, hasMore } }`. Parâmetros `page` e `perPage`.

### Permissões

| Recurso | Permissão |
|---|---|
| `/flows`, `/flow-templates`, `/tools`, `/tool-catalog`, `/tool-installations`, `FlowPlaygroundChannel` | `flows` |
| `/webhooks`, `/webhook-logs` | `core_settings` |
| `POST /flows/:id/executions` | `flows`, mais `chat` e enxergar a conversa (`chat_list_to`) |
| `POST /inbound/webhooks/:uid` | Pública. Assinatura opcional, por webhook. |

### Erros

Sempre `{ error: { code, field?, message, details? } }`.

| HTTP | `code` | Quando |
|---|---|---|
| 401 | `unauthorized` | Sem sessão |
| 403 | `forbidden` | Sem a permissão |
| 403 | `toolLocked` | Editar ou apagar função que veio de uma ferramenta instalada |
| 404 | `notFound` | Não existe, ou é de outra organização |
| 400 | `parameterMissing` | Faltou o envelope |
| 422 | `unprocessable` | Validação. `field` e `details` por campo |
| 422 | `invalidDefinition` | Publicar com problemas. Em `details.issues`, ver [Publicar](#post-flowsidpublish) |
| 422 | `noDraftToPublish`, `flowNotPublished`, `noVersion`, `notWaiting`, `variablesTooLarge` | Ver cada rota |
| 422 | `alreadyPersonalized`, `missingCredentials`, `unknownActionType` | Ver cada rota |
| 429 | `tooManyRequests` | `POST /tools/:id/test` (20 por minuto, por pessoa) e entrada do webhook (1.200 por minuto, por webhook) |
| 400 | `invalidBody` | Entrada do webhook: o corpo diz ser JSON e não é |
| 413 | `payloadTooLarge` | Entrada do webhook: mais de 1 MB |
| 401 | `missingSignature`, `missingTimestamp`, `malformedSignature`, `invalidTimestamp`, `expiredTimestamp`, `invalidSignature`, `missingSecret` | Entrada do webhook, com assinatura ligada |

---

## Fluxos

### `GET /flows`

`?status=draft|published|archived`, `?triggerType=`, `?q=` (no nome). Do mais recente para o mais antigo.

Cada fluxo traz `stats`, com o que a lista mostra: `lastExecutedAt`, `recent` (os 8 últimos resultados, do mais novo para o mais antigo) e `last7Days: { total, failed, waiting }`. Fluxo que nunca rodou vem com `null`, e o teste do editor não conta. Uma consulta por página (`Flows::ListStats`), e não uma por fluxo.

Resposta `200`:

```json
{
  "flows": [
    {
      "id": "d72e319b-e304-45b1-8b87-6ee98fe4e231",
      "name": "E2E Quebrado",
      "description": null,
      "status": "draft",
      "triggerType": "manual",
      "connectorFilter": {
        "connectorIds": []
      },
      "published": false,
      "updatedAt": 1794005428702,
      "createdAt": 1794005428702
    },
    {
      "id": "9b53c118-bc33-4fc8-8fc5-1a86706511f0",
      "name": "E2E Pedido",
      "description": null,
      "status": "published",
      "triggerType": "webhook",
      "connectorFilter": {
        "connectorIds": []
      },
      "published": true,
      "updatedAt": 1794005425286,
      "createdAt": 1794005425218
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

### `GET /flows/:id`

O fluxo, mais `draft` e `publishedVersion`, com a definição de cada um.

Resposta `200`:

```json
{
  "flow": {
    "id": "b137ce2b-ce3a-48ac-a03f-73084d633a68",
    "name": "E2E Atendimento",
    "description": "Verificação",
    "status": "published",
    "triggerType": "message_received",
    "connectorFilter": {
      "connectorIds": []
    },
    "published": true,
    "updatedAt": 1794005288502,
    "createdAt": 1794005288303,
    "draft": {
      "id": "f75419a1-a287-4b20-8694-350de098ae8c",
      "versionNumber": 2,
      "definition": {
        "nodes": [
          "..."
        ],
        "edges": [
          "..."
        ],
        "viewport": {},
        "base_prompt": "Você é a atendente da Doma Store. Responda em uma frase curta, em português."
      },
      "publishedAt": null,
      "updatedAt": 1794005288507
    },
    "publishedVersion": {
      "id": "9ed46b30-3603-4fbc-bafe-1bc535102cab",
      "versionNumber": 1,
      "definition": {
        "nodes": [
          "..."
        ],
        "edges": [
          "..."
        ],
        "viewport": {},
        "base_prompt": "Você é a atendente da Doma Store. Responda em uma frase curta, em português."
      },
      "publishedAt": 1794005288499,
      "updatedAt": 1794005288500
    }
  }
}
```

### `POST /flows`

`{ flow: { name, description?, triggerType?, connectorFilter? }, template? }`. Sempre nasce em `draft`, com um rascunho: a definição do modelo, se veio `template`, ou só o bloco de gatilho. `triggerType`: `message_received`, `first_message`, `keyword`, `contact_created`, `human_handoff`, `manual`, `webhook`. Sem ele, o do modelo, e sem modelo, `manual`.

Resposta `201`:

```json
{
  "flow": {
    "id": "b137ce2b-ce3a-48ac-a03f-73084d633a68",
    "name": "E2E Atendimento",
    "description": "Verificação",
    "status": "draft",
    "triggerType": "message_received",
    "connectorFilter": {
      "connectorIds": []
    },
    "published": false,
    "updatedAt": 1794005288303,
    "createdAt": 1794005288303,
    "draft": {
      "id": "9ed46b30-3603-4fbc-bafe-1bc535102cab",
      "versionNumber": 1,
      "definition": {
        "edges": [],
        "nodes": [
          {
            "id": "start",
            "data": {
              "label": "Início"
            },
            "type": "trigger_message_received",
            "position": {
              "x": 320,
              "y": 200
            }
          }
        ],
        "viewport": {
          "x": 0,
          "y": 0,
          "zoom": 1
        }
      },
      "publishedAt": null,
      "updatedAt": 1794005288373
    },
    "publishedVersion": null
  }
}
```

### `PATCH /flows/:id`

Só os metadados: `{ flow: { name?, description?, triggerType?, connectorFilter? } }`. `connectorFilter: { connectorIds: [...] }` diz em quais canais o fluxo dispara, e vazio é em todos.

### `PUT /flows/:id/definition`

`{ definition }`, no rascunho. A versão publicada não muda, e as execuções em andamento continuam na versão em que começaram. Formato inválido (`nodes` que não é lista, mais de 2 MB) dá 422.

```json
{
  "version": {
    "id": "22438872-3fa9-4e86-ad6c-ca661d8dd4c4",
    "versionNumber": 1,
    "definition": { "...": "como veio" },
    "publishedAt": null,
    "updatedAt": 1793998975328
  }
}
```

### `POST /flows/:id/publish`

Congela o rascunho e abre o próximo. O gatilho do fluxo passa a ser o do bloco inicial. Rascunho aceita tudo; publicar confere:

Resposta `422`:

```json
{
  "error": {
    "code": "invalidDefinition",
    "message": "O fluxo tem problemas e não pode ser publicado.",
    "details": {
      "issues": [
        {
          "code": "noTrigger"
        },
        {
          "code": "unknownBlock",
          "nodeId": "x",
          "type": "bloco_inventado"
        },
        {
          "code": "brokenEdge",
          "edgeId": "e"
        }
      ]
    }
  }
}
```

`issues[].code`: `noTrigger`, `multipleTriggers`, `unknownBlock`, `missingNodeId`, `duplicatedNodeId`, `brokenEdge`. Publicar resolve os alertas de execução com erro do fluxo.

### `POST /flows/:id/archive`

`status: archived`, e o que estava em andamento é cancelado: um fluxo arquivado não continua falando com ninguém.

### `POST /flows/:id/unarchive`

Liga de novo o que foi arquivado, **na versão que estava publicada**: `status: published`, ou `draft` se nunca foi publicado. O rascunho aberto continua sendo rascunho, e é por isso que não é a mesma coisa que publicar. Em fluxo que não está arquivado, não muda nada.

### `DELETE /flows/:id`

`204`. Leva as versões, as execuções e os logs. Confirme na tela.

### `GET /flows/:id/versions` e `GET /flows/:id/versions/:versionId`

As versões do fluxo, da mais nova para a mais antiga: `{ versions: [{ id, versionNumber, publishedAt, updatedAt }], meta }`, com `publishedAt` nulo no rascunho. O detalhe traz `definition`, e é o que a tela usa para restaurar: grava no rascunho com `PUT /flows/:id/definition`. A retenção apaga versões antigas sem uso (`Flows::PruneExecutionsJob`).

---

## A definição do fluxo

```json
{
  "nodes": [ { "id": "t", "type": "trigger_keyword", "position": { "x": 0, "y": 0 }, "data": { "keywords": ["orçamento"] } } ],
  "edges": [ { "id": "e1", "source": "t", "target": "a", "sourceHandle": "true" } ],
  "viewport": { "x": 0, "y": 0, "zoom": 1 },
  "fields": [ { "key": "nome", "label": "Nome", "type": "string", "description": "..." } ],
  "base_prompt": "Prompt herdado por todo bloco de IA no modelo principal"
}
```

- **`fields`:** o que o fluxo coleta em cada conversa. O valor fica em `Chat#flow_data[flow_id]` e volta como variável na próxima execução. Só chaves `^[a-z][a-z0-9_]{0,63}$`, e só as cadastradas são gravadas.
- **Saída padrão:** aresta sem `sourceHandle`, ou com `next`. Bloco sem saída ligada termina a execução.

### Variáveis nos textos

`{{contact.name}}`, `{{contact.phone}}`, `{{contact.id}}`, `{{contact.custom_attributes.x}}`, `{{chat.id}}`, `{{chat.status}}`, `{{chat.custom_attributes.x}}`, `{{message.text}}`, `{{message.role}}`, `{{vars.x}}`. O número atravessa lista: `{{vars.produtos.0.image}}`. O que não existe vira vazio. Em fluxo começado por webhook, `{{vars.webhook.body.x}}` e `{{vars.webhook.query.x}}`.

---

## Catálogo de blocos

**Esta é a lista final, e é contrato: o editor é recriado a partir dela.** Uma spec confere esta tabela contra `FlowRuntime::NodeRegistry`. A origem tinha nomes com o vocabulário antigo, e o `recycle.rb` trocaria metade. Como não há migração de dados, não existe definição antiga para respeitar, então tudo ficou no vocabulário daqui:

| Origem | Aqui |
|---|---|
| `assign_department` (`department_id`) | `assign_team` (`team_id`) |
| `finalize_conversation` | `finalize_chat` |
| `assign_agent` (`user_id`, `user_pool`) | `assign_agent` (`account_id`, `account_pool`) |
| `kanban_*` (`column_id`, `link_conversation`) | `pipeline_*` (`stage_id`, `link_chat`) |
| `create_deal`, `update_deal` (`kanban_column_id`) | `pipeline_create_deal`, `pipeline_update_deal` (`stage_id`) |
| `card_source.type: "conversation"` | `card_source.type: "chat"` |
| `{{conversation.*}}` | `{{chat.*}}` |
| `provider`, `temperature` nos blocos de IA | Não existem. Os modelos atuais recusam `temperature`, e o provedor é um só |

A API JS dos scripts (`kanban.*`, `appointment.*`) **não** mudou: é contrato de quem escreve script.

Em "Saídas", `next` é a saída padrão. Todo bloco de IA aceita `onError`, e os de Pipelines também, fora os dois de negócio, que nunca param o fluxo. O rótulo é sugestão, em pt-BR.

| Tipo | Categoria | Rótulo | `data` | Saídas |
|---|---|---|---|---|
| `trigger_message_received` | trigger | Mensagem recebida | | `next` |
| `trigger_first_message` | trigger | Primeira mensagem | | `next` |
| `trigger_keyword` | trigger | Palavra-chave | `keywords[]`: sem caixa e sem acento, palavra inteira | `next` |
| `trigger_contact_created` | trigger | Contato criado | | `next` |
| `trigger_human_handoff` | trigger | Transferência humana | | `next` |
| `trigger_manual` | trigger | Manual | | `next` |
| `trigger_webhook` | trigger | Webhook | | `next` |
| `send_text` | message | Enviar texto | `text`, `sender_name?` | `next` |
| `send_media` | message | Enviar anexo | `attachment_id` ou (`media_url`, `media_type`: image, audio, video, document, `file_name?`); `caption?`, `sender_name?` | `next` |
| `send_template` | message | Modelo do WhatsApp | `template_name`, `parameters[]`, `sender_name?`. Só WABA; nos outros canais, passa adiante | `next` |
| `send_interactive` | message | Botões ou lista | `text`, `buttons[]: { id, title }`, `invalid_text?`, `save_to?`, `sender_name?`. Espera a resposta, que vale pelo número ou título | o `id` do botão, ou `next` |
| `ask_question` | message | Perguntar | `text`, `save_to?`, `sender_name?`. Espera a resposta | `next` |
| `ai_assistant` | ai | Assistente IA | `mode`: interactive ou processing; `system_prompt`, `model_size`: main ou fast; `use_history`, `tool_ids[]`, `min_turns`, `max_turns`, `sender_name?`, `outputs[]: { id, label, when, default?, parameters[]: { name, type, description, required } }` | o `id` de cada saída, `maxTurns`, `onError` |
| `ai_sentiment` | ai | Sentimento | `outputs[]`: padrão positive, neutral, negative. Grava `last_sentiment` | o `id` de cada saída, `onError`, `next` |
| `ai_intent_classification` | ai | Classificar intenção | `system_prompt?`, `outputs[]: { id, label, when }`. Grava `last_intent` | o `id` de cada saída, `default`, `onError`, `next` |
| `ai_parameter_extractor` | ai | Extrair parâmetros | `system_prompt?`, `model_size`, `fields[]: { name, type, description }`. Grava cada campo | `next`, `onError` |
| `ai_audio_transcription` | ai | Transcrever áudio | `audio_url?`, `save_to?` (padrão `last_transcription`). Sem URL, usa a transcrição que a mensagem já trouxe | `next`, `onError` |
| `condition` | logic | Condição | `match`: all ou any; `rules[]: { field, operator, value, values[] }`. Operadores: equals, not_equals, contains, not_contains, starts_with, ends_with, greater_than, less_than, is_empty, is_not_empty, exists, not_exists, in, not_in. `field` é um caminho: `vars.x`, `message.text` | `true`, `false`, `next` |
| `switch` | logic | Switch | `field` (texto com variáveis), `cases[]: { id, value }` | o `id` de cada caso, `default`, `next` |
| `wait` | logic | Aguardar | `amount`, `unit`: seconds, minutes, hours, days. Até 30 dias | `next` |
| `wait_for_message` | logic | Aguardar mensagem | `save_to?` | `next` |
| `set_variable` | logic | Definir variável | `assignments[]: { name, value }` | `next` |
| `loop` | logic | Repetir | `source`: `{{vars.lista}}`, o nome, ou uma lista; `loop_variable` (padrão `item`), `index_variable` (padrão `index`), `max_iterations` (até 100). O último bloco do corpo liga de volta aqui | `each`, `done`, `next` |
| `add_tag` | action | Adicionar etiqueta | `tag_id` ou `tag_name` (cria se preciso) | `next` |
| `remove_tag` | action | Remover etiqueta | `tag_id` ou `tag_name` | `next` |
| `set_custom_attribute` | action | Definir campo do contato | `key`, `value` | `next` |
| `assign_agent` | action | Atribuir atendente | `account_id`, ou `account_pool[]`, sorteado | `next` |
| `assign_team` | action | Atribuir departamento | `team_id` | `next` |
| `transfer_to_human` | action | Transferir para humano | `team_id?`, `account_id?`. Pausa a automação pelo período da organização, e dispara `human_handoff` | `next` |
| `finalize_chat` | action | Finalizar atendimento | Fecha a conversa e termina o fluxo | |
| `pause_automation` | action | Pausar automação | `period?`: minutes, hours, days; `amount?`. Sem período, até alguém religar | `next` |
| `resume_automation` | action | Retomar automação | | `next` |
| `set_funnel_stage` | action | Mudar etapa do funil | `funnel_id`, `stage_id` (aceita variável). Por `Funnels::MoveChat`: confere funil e etapa, e não escreve se já está lá. Funil ou etapa apagados não derrubam o fluxo: o log registra `funnel_stage_not_found`, e a organização recebe o alerta `flow_funnel_stage_missing`. Não tira do funil | `next` |
| `pipeline_create_card` | pipeline | Criar card | `board_id`, `stage_id` (id ou nome), `title` (sem ele, o nome do contato), `description`, `priority`, `deal_value`, `link_chat`, `reuse_existing`. Guarda `pipeline_card_id` | `next`, `onError` |
| `pipeline_move_card` | pipeline | Mover card | `card_source`, `stage_id` (id ou nome, do mesmo quadro), `position`: top ou bottom. Respeita as travas da etapa | `next`, `onError` |
| `pipeline_update_card` | pipeline | Atualizar card | `card_source`, `title`, `description`, `priority`, `deal_value`, `deal_probability`, `company_name`, `contact_email`, `contact_phone`, `due_date`, `expected_close_date` | `next`, `onError` |
| `pipeline_set_custom_field` | pipeline | Preencher campo | `card_source`, `field_key`, `value` | `next`, `onError` |
| `pipeline_mark_won` | pipeline | Marcar como ganho | `card_source` | `next`, `onError` |
| `pipeline_mark_lost` | pipeline | Marcar como perdido | `card_source`, `reason?` | `next`, `onError` |
| `pipeline_reopen_deal` | pipeline | Reabrir negócio | `card_source` | `next`, `onError` |
| `pipeline_add_label` | pipeline | Adicionar etiqueta ao card | `card_source`, `label` | `next`, `onError` |
| `pipeline_remove_label` | pipeline | Remover etiqueta do card | `card_source`, `label_id` | `next`, `onError` |
| `pipeline_add_comment` | pipeline | Comentar no card | `card_source`, `body` | `next`, `onError` |
| `pipeline_add_checklist` | pipeline | Adicionar checklist | `card_source`, `name`, `items[]` | `next`, `onError` |
| `pipeline_archive_card` | pipeline | Arquivar card | `card_source` | `next`, `onError` |
| `pipeline_create_deal` | pipeline | Criar negócio | `stage_id`, `title`, `description`, `deal_value`, `deal_probability`, `assigned_to_id`. Guarda `last_deal_id` | `next` |
| `pipeline_update_deal` | pipeline | Atualizar negócio | `card_id?` (sem ele, `last_deal_id`), `stage_id`, `title`, `description`, `deal_value`, `deal_probability`, `assigned_to_id` | `next` |
| `http_request` | integration | Requisição HTTP | `url`, `method`, `headers[]: { key, value }`, `body`: texto ou mapa, `timeout` (até 30 s), `save_response_to?`. Grava `last_http_status` | `success`, `error`, `next` |
| `execute_tool` | integration | Executar função | `tool_id`, `params`, `save_response_to?` | `success`, `error`, `next` |
| `goto_flow` | integration | Subfluxo | `target_flow_id`, `merge_variables`. Não espera o outro terminar | `next` |
| `catalog_search` | integration | Buscar no catálogo | `query?` (sem ela, a mensagem), `filters?: { tags, categories, custom }`, `limit` (até 20), `save_to?` (padrão `catalog_results`). Grava também `<save_to>_total` | `found`, `not_found`, `next` |
| `end` | flow_control | Fim | | |

**`card_source`:** `{ type: "node", node_id: "<bloco Criar card>" }` ou `{ type: "chat", board_id }`.

**Blocos de Pipelines.** Todos têm o prefixo `pipeline_`, e o público fala em etapa e conversa: `stage_id`, `link_chat`, e também no log de cada bloco, em `stage_id` e `chat_id`. Os ids são UUID em texto, e funil e pipeline são coisas diferentes: quem muda etapa de funil é `set_funnel_stage`.

- **Passam por `FlowRuntime::KanbanGateway`, em cima de `Pipelines::Automation`:** é o mesmo código de `kanban.*`, com as mesmas regras. O que `pipeline_move_card` não pode fazer por trava de checklist ou de campo obrigatório, e `pipeline_mark_won` e `pipeline_mark_lost` por campo exigido no fechamento, vira erro, com o que falta em `pending_items` e `pending_fields` no log.
- **Erro:** a execução para com o motivo, ou segue por `onError`, com o motivo em `{{vars.pipeline_error}}`. Quadro, etapa, card e etiqueta de outra organização são como se não existissem.
- **`pipeline_create_card` não duplica:** rodar de novo na mesma conversa reaproveita o card em aberto daquele bloco, porque lembra dele entre execuções. `reuse_existing: false` cria sempre. Card ganho, perdido ou arquivado não é reaproveitado.
- **Os dois de negócio** criam e atualizam direto, sem as travas, e **nunca param o fluxo**: etapa, card ou valor que não servem ficam no log, em `skipped`, e o fluxo segue. Etapa pode ser de qualquer quadro da organização. Valor que não é número fica de fora, em vez de virar zero.
- **O que o fluxo muda dispara os gatilhos do quadro**, como na origem. Comentário sai assinado pela automação (`source: "flow"`).
- **No teste do editor nada mexe em quadro:** o bloco registra `skipped: "playground"`, manda o evento `pipeline_skipped` e o fluxo segue. Para ver um card nascer, teste numa conversa de verdade.

### O texto que sai

Vale para `send_text`, `ask_question`, `send_interactive` e `ai_assistant`, e para a mensagem da ação `start_flow` do webhook (`Flows::TextDelivery`). **O que alguém escreveu chega ao cliente como foi escrito.** Só a resposta do bloco `ai_assistant` passa pela limpeza de `MessageHandling`.

| | Escrito por alguém no editor | Resposta do `ai_assistant` |
|---|---|---|
| Aspas, apóstrofo, til, crase, colchetes, `<>` | Ficam | Saem: `"sim"` vira `sim`, menos o apóstrofo dentro de palavra: `d'água` fica |
| `**forte**` e `[texto](link)` | Ficam | `*forte*` e o link puro |
| Quebra em mensagens | Só com 10 quebras de linha seguidas, ou em volta de anexo citado | A cada parágrafo e a cada link |
| `attachment_id_<id>` | Vira mídia, no lugar em que está | Vira mídia |
| `attachment_<nome>` | É texto | Vira mídia, pelo nome mais parecido |
| Parte que é só o link de uma imagem | Vira imagem | Vira imagem |

O que decide é quem escreveu o bloco: `{{vars.x}}` num `send_text` entra como veio, mesmo que tenha saído de um bloco de IA.

Com mais de uma parte, a conversa guarda a mensagem inteira (`hasSpan`, fora da lista, é o que o modelo lê na rodada seguinte) e cada parte (`isSpan`, que é o que a tela mostra).

**Anexo citado que sumiu**, ou de outra organização: a citação sai, o resto segue, e o código nunca chega ao cliente. O log do bloco registra `missing_attachments`, e a organização recebe o alerta `flow_attachment_missing` (no teste do editor, o evento `attachment_missing`). Sem mais nada para enviar, o bloco não manda nada, e o fluxo segue. Mídia recusada pelo canal aparece em `failed_parts` no log do bloco, e o fluxo também segue.

---

## Execuções

`status`: `pending`, `running`, `waiting` (tempo), `waiting_for_message`, `completed`, `failed`, `cancelled`.

### `GET /flows/:flowId/executions`

`?status=`, `?chatId=`. As do teste do editor ficam de fora. Cada uma traz `contactName`, o nome da conversa (`null` se ela sumiu), e a resposta traz `counts`, a contagem de todas por `status`, para os filtros da tela.

Resposta `200`:

```json
{
  "executions": [
    {
      "id": "23a3019b-b4a5-4f52-b8c9-0b1f6f03ac00",
      "flowId": "b137ce2b-ce3a-48ac-a03f-73084d633a68",
      "status": "completed",
      "chatId": "6aee599b58618d4700da4b41",
      "contactId": "5541999460197",
      "currentNodeId": "nao",
      "startedAt": 1794005414861,
      "completedAt": 1794005414985
    }
  ],
  "meta": {
    "page": 1,
    "perPage": 1,
    "total": 10,
    "totalPages": 10,
    "hasMore": true
  }
}
```

### `GET /flows/:flowId/executions/:id`

Com o estado e até 500 blocos. `logs[].status`: `success`, `error`, `skipped`, `suspended`. Entrada e saída são cortadas em 32 KB, e chave de API não aparece.

Resposta `200`:

```json
{
  "execution": {
    "id": "53e9eb27-1fa5-4e92-a45f-d2b22513edc0",
    "flowId": "b137ce2b-ce3a-48ac-a03f-73084d633a68",
    "status": "waiting_for_message",
    "chatId": "6aee592858618d4700da4b06",
    "contactId": "5541999990641",
    "currentNodeId": "ia",
    "startedAt": 1794005301939,
    "completedAt": null,
    "context": {
      "depth": 0,
      "event": "message_received",
      "steps": 2,
      "variables": {
        "nome": "Fernanda"
      },
      "node_state": {
        "ia": {
          "turns": 1
        },
        "nome": {}
      },
      "message_seq": 2,
      "consumed_seq": 2,
      "last_message_id": "E2E-479630515480"
    },
    "errorMessage": null,
    "logs": [
      {
        "id": "438efca8-a142-4aa3-8c20-6aec59c9e44e",
        "nodeId": "cond",
        "nodeType": "condition",
        "status": "success",
        "input": {
          "match": "all",
          "rules": [
            {
              "field": "message.text",
              "value": "atendimento",
              "operator": "contains"
            }
          ]
        },
        "output": {
          "passed": true,
          "evaluations": [
            {
              "rule": {
                "field": "message.text",
                "value": "atendimento",
                "operator": "contains"
              },
              "value": true
            }
          ]
        },
        "durationMs": 0,
        "executedAt": 1794005301955,
        "errorMessage": null
      },
      {
        "id": "d0e5b02c-5457-401b-9845-e688a21fa091",
        "nodeId": "nome",
        "nodeType": "ask_question",
        "status": "suspended",
        "input": {
          "text": "Claro! Qual é o seu nome?"
        },
        "output": {
          "asked": "Claro! Qual é o seu nome?",
          "awaiting_reply": true
        },
        "durationMs": 73,
        "executedAt": 1794005302053,
        "errorMessage": null
      },
      {
        "id": "a52921e6-3ba4-4f66-8bab-25715a66b8e3",
        "nodeId": "nome",
        "nodeType": "ask_question",
        "status": "success",
        "input": {
          "text": "Claro! Qual é o seu nome?"
        },
        "output": {
          "answer": "Fernanda"
        },
        "durationMs": 8,
        "executedAt": 1794005309297,
        "errorMessage": null
      },
      {
        "id": "83a2f88a-336a-4507-ad44-dc4c0229d9d2",
        "nodeId": "ia",
        "nodeType": "ai_assistant",
        "status": "suspended",
        "input": {
          "messages": 5
        },
        "output": {
          "turn": 1,
          "reply": "Oi, Fernanda! Tudo bem? Pode me contar como posso te ajudar hoje?",
          "reason": "A cliente ainda está em atendimento, informou apenas o nome e não disse que não precisa de mais nada nem se despediu.",
          "decision": "stay"
        },
        "durationMs": 2697,
        "executedAt": 1794005312023,
        "errorMessage": null
      }
    ]
  }
}
```

### `POST /flows/:flowId/executions`

É o gatilho `manual`: `{ chatId, variables? }` começa o fluxo na conversa. Responde `202 { queued: true }`. Fluxo não publicado dá `422 flowNotPublished`, e uma execução viva desse fluxo na conversa faz o pedido ser ignorado.

---

## Teste do editor

A conversa é de mentira (nada sai pelo canal: vira evento), mas o modelo e as funções são de verdade, e cobram.

1. `POST /flows/:flowId/playground` com `{ useDraft?, variables? }`.
2. Assine `FlowPlaygroundChannel` com `{ executionId }`.
3. **Só depois** `POST .../playground/:executionId/run`, para não perder os primeiros eventos.
4. `POST .../playground/:executionId/message` com `{ text }`, ou `speak` no canal.
5. `DELETE .../playground/:executionId`, para parar.

Resposta `201`:

```json
{
  "executionId": "bf10c5e1-8c70-4cfb-a302-10448e2bc1ba",
  "channel": "FlowPlaygroundChannel",
  "currentNodeId": "p",
  "chatId": "6aee59aaabcf2c397bf46559"
}
```

`message` responde `422 notWaiting` se a execução não está esperando, e `run` repetido responde `{ ok: true, status }` sem rodar de novo. Teste some em um dia.

---

## Modelos de fluxo

`GET /flow-templates` e `GET /flow-templates/:slug`. Vêm de arquivos (`db/seeds/flow_templates/*.json`), iguais para toda organização.

Resposta `200`:

```json
{
  "flowTemplates": [
    {
      "slug": "welcome_routing",
      "name": "Boas-vindas + roteamento por intenção",
      "description": "Saúda o usuário na primeira mensagem, classifica a intenção e roteia para vendas, suporte ou outros.",
      "category": "atendimento",
      "triggerType": "first_message",
      "tags": [
        "boas-vindas",
        "ia",
        "roteamento"
      ],
      "thumbnailUrl": "",
      "definition": {
        "viewport": {},
        "nodes": [
          {
            "id": "trigger",
            "type": "trigger_first_message",
            "position": {
              "x": 0,
              "y": 0
            },
            "data": {
              "label": "Primeira mensagem"
            }
          },
          "..."
        ],
        "edges": [
          "..."
        ]
      }
    },
    "..."
  ]
}
```

---

## Ferramentas

Duas coisas: **funções** (`/tools`, o que um bloco executa, escrito aqui ou vindo de uma ferramenta) e **catálogo** (`/tool-catalog`, o que dá para instalar). Instalar copia as funções da ferramenta para a organização (`/tool-installations`).

Na origem, a instalação e a função eram por assistente, e havia também as "do workspace". **Aqui é tudo da organização, e quem escolhe é cada bloco:** `ai_assistant.tool_ids` e `execute_tool.tool_id`. `ai_assistant` sem nada escolhido não recebe nenhuma, e na origem recebia todas.

### `GET /tools`

`?q=`, `?summary=true` (a lista curta dos seletores, sem código).

Resposta `200`:

```json
{
  "tools": [
    {
      "id": "6aee599babcf2c397bf46557",
      "name": "e2e_frete",
      "description": "Calcula o frete para um CEP.",
      "jsCode": "console.log('calculando'); return { prazo_dias: params.cep.startsWith('8') ? 2 : 6, valor: 14.9 };",
      "parameters": [
        {
          "name": "cep",
          "type": "string",
          "description": "O CEP",
          "required": true
        }
      ],
      "parametersJson": "{\n  \"type\": \"object\",\n  \"properties\": {\n    \"cep\": {\n      \"type\": \"string\",\n      \"description\": \"O CEP\"\n    }\n  },\n  \"required\": [\n    \"cep\"\n  ]\n}",
      "toolInstallationId": null,
      "locked": false,
      "tool": null,
      "createdAt": 1794005403063,
      "updatedAt": 1794005403063
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

Resposta `200`:

```json
{
  "tools": [
    {
      "id": "6aee599babcf2c397bf46557",
      "name": "e2e_frete",
      "description": "Calcula o frete para um CEP.",
      "toolInstallationId": null,
      "tool": null
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

Função instalada vem com `locked: true`, sem `jsCode` nem `parametersJson`, e com `tool` (a ferramenta de origem).

### `POST /tools`, `PATCH /tools/:id`, `DELETE /tools/:id`

`{ tool: { name, description, jsCode, parameters?: [{ name, type, description, required, enum?, itemsType?, itemsProperties?, minItems? }] } }`. `name` vira `consultar_cep`: é o que o modelo vê, e passa a valer `^[a-zA-Z0-9_-]{1,64}$`. `parametersJson` é calculado. Mexer em função instalada dá `403 toolLocked`.

Resposta `201`:

```json
{
  "tool": {
    "id": "6aee599babcf2c397bf46557",
    "name": "e2e_frete",
    "description": "Calcula o frete para um CEP.",
    "jsCode": "console.log('calculando'); return { prazo_dias: params.cep.startsWith('8') ? 2 : 6, valor: 14.9 };",
    "parameters": [
      {
        "name": "cep",
        "type": "string",
        "description": "O CEP",
        "required": true
      }
    ],
    "parametersJson": "{\n  \"type\": \"object\",\n  \"properties\": {\n    \"cep\": {\n      \"type\": \"string\",\n      \"description\": \"O CEP\"\n    }\n  },\n  \"required\": [\n    \"cep\"\n  ]\n}",
    "toolInstallationId": null,
    "locked": false,
    "tool": null,
    "createdAt": 1794005403064,
    "updatedAt": 1794005403064
  }
}
```

### `POST /tools/:id/personalize`

Desvincula da ferramenta, e o código aparece. Já personalizada dá `422 alreadyPersonalized`.

### `POST /tools/:id/test`

Script não roda na thread do Puma: `{ args?, chatId? }` enfileira na fila `scripts`, e a tela consulta o resultado. Na origem, a resposta vinha na hora, com a thread presa.

Resposta `202`:

```json
{
  "testRun": {
    "id": "28ad10b0-ad20-40a0-b0a2-642f464192b4",
    "status": "pending"
  }
}
```

### `GET /tools/:id/test-runs/:runId`

`status`: `pending`, `done`, `failed` (com `error`). O resultado fica 10 minutos.

Resposta `200`:

```json
{
  "testRun": {
    "status": "done",
    "response": {
      "prazo_dias": 2,
      "valor": 14.9
    },
    "events": [
      {
        "name": "console_log",
        "output": [
          "calculando"
        ]
      }
    ],
    "durationMs": 15,
    "id": "28ad10b0-ad20-40a0-b0a2-642f464192b4"
  }
}
```

### `GET /tool-catalog` e `GET /tool-catalog/:id`

`?category=`. O detalhe traz `functionTemplates`, sem o código: `name`, `description` e `parameters`.

Resposta `200`:

```json
{
  "tools": [
    {
      "id": "6aee3e6ac2b5e9dfd6a5515b",
      "name": "Utilidades Brasil",
      "slug": "utilidades-brasil",
      "description": "Conjunto de funções utilitárias para o Brasil: validação de documentos, consulta de CEP, formatação de telefone e mais.",
      "imageUrl": null,
      "icon": "solar:flag-bold-duotone",
      "color": "#16a34a",
      "category": "utilities",
      "active": true,
      "credentialsSchema": [],
      "requiresCredentials": false,
      "functionCount": 5
    },
    "..."
  ]
}
```

### `/tool-installations`

| | |
|---|---|
| `GET` | `{ installations: [...] }` |
| `POST` | `{ toolId, credentials? }`. Falta a obrigatória: `422 missingCredentials`. Instalar de novo refaz as funções, com o código atual do catálogo, e mantém a credencial. |
| `PATCH /:id` | `{ credentials }`. Mescla, e o que vier em branco fica como estava. |
| `PATCH /:id/toggle` | Liga e desliga. Função de ferramenta desligada não roda e não é oferecida aos blocos. |
| `DELETE /:id` | Leva as funções que ainda são da ferramenta. As personalizadas ficam. |

As credenciais ficam cifradas, nunca saem da API (`hasCredentials`), e chegam ao script como `credentials.<chave>`.

```json
{
  "installation": {
    "id": "6aee3e6ac2b5e9dfd6a55170",
    "toolId": "6aee3e6ac2b5e9dfd6a5515b",
    "enabled": true,
    "hasCredentials": false,
    "toolFunctionIds": ["6aee3e6ac2b5e9dfd6a55171", "6aee3e6ac2b5e9dfd6a55172"],
    "createdAt": 1793998449000,
    "updatedAt": 1793998449000,
    "tool": { "id": "6aee3e6ac2b5e9dfd6a5515b", "name": "Utilidades Brasil", "slug": "utilidades-brasil", "description": "...", "imageUrl": null, "icon": "solar:flag-bold-duotone", "color": "#16a34a", "category": "utilities", "credentialsSchema": [] }
  }
}
```

---

## Webhooks

Uma URL pública e as ações que ela executa.

| `status` | Ao receber |
|---|---|
| `test` | Guarda as 10 últimas (`receivedPayload` mostra a última, achatada) e não executa nada |
| `active` | Executa as ações |
| `inactive` | Só registra no log |

### Ações

As ações rodam nesta ordem: `ContactHandling` (fixa, é ela que acha a conversa), `StartFlow`, e as demais pela ordem de criação. `{{body.x}}`, `{{query.x}}` e `{{headers.X-Foo}}` nos textos.

| `type` | `config` | O que faz |
|---|---|---|
| `HookAction::ContactHandling` | `contactIdentifier`, `contactName` | Acha ou cria a conversa pelo telefone, nas formas do 9º dígito. `static: true`: não sai do webhook. |
| `HookAction::StartFlow` | `connectorId`, `flowId?`, `sendMode`: simple ou advanced; `messageText`, `messageBlocks[]`, `whatsappTemplateId`, `whatsappTemplateParams[]`, `phoneNumberId` | "Iniciar fluxo" (origem: `AssignAutomation`). Liga a conversa ao canal, liga a automação, envia a mensagem e começa o fluxo, com o corpo em `{{vars.webhook.body.x}}`. |
| `HookAction::UserField` | `customFieldId`, `valueTemplate` | Grava um campo do contato. |
| `HookAction::CodeRunner` | `code` | Roda um script na fila `scripts`, com o que chegou em `params` (`params['body.nome']`). As ações seguintes esperam por ele. |
| `HookAction::HttpRequest` | `url`, `httpMethod`, `headers[]: { key, value }`, `body`: texto ou mapa | Repassa para outra URL, por `SafeHttp`: nunca para a rede interna. **Não existia na origem.** |

`messageBlocks[]`: `{ id, type: text|image|video|document|audio, content, mediaUrl, fileName, caption, mediaSource: url|attachment, attachmentId }`.

Em `headers`, o valor de cabeçalho cujo nome parece segredo (`authorization`, `cookie`, `token`, `secret`, `api-key`, `password`, `senha`) é só de escrita: a resposta traz `••••••••`. Mandar de volta a máscara mantém o que estava. Se a URL mudar de esquema, host ou porta, ou o cabeçalho mudar de nome, não há o que manter, e a resposta é `422 secretHeaderNeedsRetyping`, com o nome do cabeçalho na mensagem.

Canal, fluxo e campo precisam ser da organização, senão 422. Falha de envio ou de HTTP não para as ações seguintes: vira o alerta `webhook_delivery_failed`, que a próxima entrega sem falha resolve, ou salvar o webhook.

### `GET /webhooks` e `GET /webhooks/:id`

Resposta `200`:

```json
{
  "webhook": {
    "id": "58011a22-26a9-426f-b786-53e47be0b2a4",
    "uid": "6ML0QR86dQsQgYJsnMiRWoky",
    "name": "E2E Pedido aprovado",
    "slug": "e2e-pedido-aprovado",
    "status": "test",
    "totalRequest": 1,
    "url": "http://localhost:3110/inbound/webhooks/6ML0QR86dQsQgYJsnMiRWoky",
    "receivedPayload": {
      "headers.Host": "127.0.0.1:3110",
      "headers.Accept": "*/*",
      "headers.Connection": "close",
      "headers.User-Agent": "Ruby",
      "headers.Content-Type": "application/json",
      "headers.Content-Length": "62",
      "headers.Accept-Encoding": "gzip;q=1.0,deflate;q=0.6,identity;q=0.3",
      "body.nome": "Roberto",
      "body.pedido": "48213",
      "body.telefone": "5541999597361"
    },
    "signatureEnabled": false,
    "signingSecretHint": null,
    "signingSecretGeneratedAt": null,
    "webhookActions": [
      {
        "id": "d77c13b2-416f-4df5-b1f0-0e88d4be8c15",
        "type": "HookAction::ContactHandling",
        "static": true,
        "config": {},
        "createdAt": 1794005424631,
        "updatedAt": 1794005424631
      }
    ],
    "createdAt": 1794005424627,
    "updatedAt": 1794005424678
  }
}
```

`url` usa `BACKEND_URL`.

### `POST /webhooks`

`{ webhook: { name } }`. Sempre nasce em `test`, com a ação do contato.

Resposta `201`:

```json
{
  "webhook": {
    "id": "58011a22-26a9-426f-b786-53e47be0b2a4",
    "uid": "6ML0QR86dQsQgYJsnMiRWoky",
    "name": "E2E Pedido aprovado",
    "slug": "e2e-pedido-aprovado",
    "status": "test",
    "totalRequest": 0,
    "url": "http://localhost:3110/inbound/webhooks/6ML0QR86dQsQgYJsnMiRWoky",
    "receivedPayload": {},
    "signatureEnabled": false,
    "signingSecretHint": null,
    "signingSecretGeneratedAt": null,
    "webhookActions": [
      {
        "id": "d77c13b2-416f-4df5-b1f0-0e88d4be8c15",
        "type": "HookAction::ContactHandling",
        "static": true,
        "config": {},
        "createdAt": 1794005424631,
        "updatedAt": 1794005424631
      }
    ],
    "createdAt": 1794005424627,
    "updatedAt": 1794005424627
  }
}
```

### `PATCH /webhooks/:id`

`{ webhook: { name?, status?, webhookActions?: [{ id?, type, config, _destroy? }] } }`. Com `id`, muda; sem, cria; com `_destroy: true`, remove (menos a do contato). `config` é mesclado. É tudo ou nada: tipo desconhecido dá `422 unknownActionType`, e nada fica pela metade.

PATCH /webhooks/:id:

```json
{
  "webhook": {
    "status": "active",
    "webhookActions": [
      {
        "id": "d77c13b2-416f-4df5-b1f0-0e88d4be8c15",
        "config": {
          "contactIdentifier": "{{body.telefone}}",
          "contactName": "{{body.nome}}"
        }
      },
      {
        "type": "HookAction::StartFlow",
        "config": {
          "connectorId": "6aee5925100b7d5d14f78012",
          "flowId": "9b53c118-bc33-4fc8-8fc5-1a86706511f0",
          "messageText": "Oi {{body.nome}}, recebemos seu pedido."
        }
      },
      {
        "type": "HookAction::CodeRunner",
        "config": {
          "code": "tag.add('pedido-' + params['body.pedido']); return 1;"
        }
      },
      {
        "type": "HookAction::HttpRequest",
        "config": {
          "url": "http://169.254.169.254/latest/meta-data",
          "httpMethod": "GET"
        }
      }
    ]
  }
}
```

### `DELETE /webhooks/:id`

`204`. Leva as ações, os logs e o aviso aberto do webhook.

### Assinatura

| | |
|---|---|
| `POST /webhooks/:id/enable-signature` | Na primeira vez devolve `signingSecret`. Religar devolve `null`, e a chave continua a mesma. |
| `POST /webhooks/:id/rotate-signing-secret` | Troca a chave, e a anterior para de valer **na hora**. |
| `DELETE /webhooks/:id/disable-signature` | Desliga, e a chave fica guardada. |

**`signingSecret` só sai nessas duas respostas**: se a pessoa perder, resta renovar. Depois, só `signingSecretHint` (`whsec_••••••••4f2a`).

Quem chama assina `"<timestamp>.<corpo cru>"` com HMAC-SHA256 e envia:

```
X-Vekoo-Timestamp: 1793999000
X-Vekoo-Signature: sha256=<hex>
```

Tolerância de 5 minutos, nos dois sentidos. Na origem os nomes eram `X-Aiva-*`. A tela deve mostrar um exemplo:

```bash
TS=$(date +%s); BODY='{"nome":"Ana"}'
SIG=$(printf '%s.%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SEGREDO" -hex | sed 's/^.* //')
curl -X POST "$URL" -H "Content-Type: application/json" -H "X-Vekoo-Timestamp: $TS" -H "X-Vekoo-Signature: sha256=$SIG" -d "$BODY"
```

---

## Entrada do webhook

`POST /inbound/webhooks/:uid`, público. **Responde na hora e joga o trabalho para o job.**

```json
{ "success": true }
```

Resposta `401`:

```json
{
  "error": {
    "code": "missingSignature",
    "message": "Cabeçalho X-Vekoo-Signature ausente."
  }
}
```

Até 1 MB. O log guarda até 100 KB do corpo, e acima disso `{ "_truncated": true, ... }`; as ações recebem o corpo inteiro. Cabeçalhos com segredo (`Authorization`, `Cookie`, chaves de API) não são guardados.

---

## Logs de webhook

Ficam 90 dias (índice TTL), com no máximo 10 mil por webhook. Para contar e agrupar, dashboards personalizados têm a fonte `hook_logs`, com a mesma permissão, `core_settings`: `status`, `status_code`, `processing_time_ms`, `hook_name`, `hook_status` e `created_at`. O que veio na requisição não sai. Ver [insights.md](insights.md).

`POST /custom-dashboards/query` com `{ dataSource: "hook_logs", dimensions: [{ field: "status" }], metrics: [{ aggregation: "count", label: "Total" }] }`:

Resposta `200`:

```json
{
  "rows": [
    {
      "status": "error",
      "Total": 1
    },
    {
      "status": "success",
      "Total": 2
    }
  ],
  "columns": [
    "status",
    "Total"
  ],
  "labels": {
    "status": {
      "success": "Sucesso",
      "error": "Erro",
      "skipped": "Ignorado"
    }
  },
  "fieldLabels": {
    "status": "Situação",
    "status_code": "Código HTTP",
    "processing_time_ms": "Tempo de processamento (ms)",
    "hook_name": "Webhook",
    "hook_status": "Situação do webhook",
    "created_at": "Data"
  },
  "meta": {
    "total": 2,
    "truncated": false,
    "timeRange": {
      "field": "created_at",
      "from": 1786229428483,
      "to": 1794005428482
    }
  }
}
```

### `GET /webhook-logs`

`?webhookId=`, `?status=success|error|skipped`, `?startDate=`, `?endDate=` (ISO 8601). 50 por página, do mais novo para o mais antigo.

Resposta `200`:

```json
{
  "logs": [
    {
      "id": "6aee59b4abcf2c397bf4655b",
      "webhookId": "58011a22-26a9-426f-b786-53e47be0b2a4",
      "webhookUid": "6ML0QR86dQsQgYJsnMiRWoky",
      "webhookName": "E2E Pedido aprovado",
      "requestMethod": "POST",
      "requestHeaders": {
        "Accept-Encoding": "gzip;q=1.0,deflate;q=0.6,identity;q=0.3",
        "Accept": "*/*",
        "User-Agent": "Ruby",
        "Content-Type": "application/json",
        "X-Vekoo-Timestamp": "1794005428",
        "Connection": "close",
        "Host": "127.0.0.1:3110",
        "Content-Length": "62"
      },
      "requestBody": {
        "telefone": "5541999597361",
        "nome": "Roberto",
        "pedido": "48213"
      },
      "requestQuery": {},
      "requestIp": "127.0.0.1",
      "status": "error",
      "statusCode": 401,
      "errorMessage": "Assinatura rejeitada (invalidSignature): Assinatura não confere.",
      "processingTimeMs": null,
      "webhookStatus": "active",
      "createdAt": 1794005428538
    },
    "..."
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

### `GET /webhook-logs/:id`

`{ log: { ... } }`, o mesmo item.

### `GET /webhook-logs/stats`

`?webhookId=`, `?days=` (padrão 30, até 90). Os dias seguem o fuso da organização.

Resposta `200`:

```json
{
  "stats": {
    "periodDays": 7,
    "totalRequests": 4,
    "successCount": 2,
    "errorCount": 2,
    "skippedCount": 0,
    "avgProcessingTimeMs": 81.5,
    "dailyStats": {
      "2026-11-06": {
        "total": 4,
        "success": 2,
        "error": 2,
        "skipped": 0
      }
    }
  }
}
```

---

## Tempo real

### `FlowPlaygroundChannel`

`{ channel: "FlowPlaygroundChannel", executionId }`. Rejeita sem a permissão `flows`, e execução de outra organização ou de verdade. Ação `speak` com `{ text }`. Cada mensagem traz `kind` e `at`.

| `kind` | Campos |
|---|---|
| `node_entered` | `nodeId`, `nodeType` |
| `node_completed` | `nodeId`, `nodeType`, `status`: success, suspended, error; `durationMs` ou `error` |
| `text` | `body`, `sender` |
| `media` | `attachmentId`, `url`, `caption` |
| `event` | `name`: `template_sent`, `interactive_sent`, `attachment_missing` (`payload.reasons`) ou `pipeline_skipped` (`payload.type`); `payload` |
| `ai_decision` | `nodeId`, `decision` (o id da saída, ou `stay`), `label`, `reason`, `turn` |
| `suspended` | `status`: waiting ou waiting_for_message; `currentNodeId` |
| `completed` | |
| `failed` | `message` |
| `stopped` | |
| `user_message` | `body`: o eco do `speak` |

Sequência real, numa pergunta seguida de IA:

```json
[
  {
    "kind": "node_entered",
    "nodeId": "p",
    "nodeType": "ask_question",
    "at": "2026-11-06T22:50:19Z"
  },
  {
    "kind": "text",
    "body": "Qual é o seu nome?",
    "sender": null,
    "at": "2026-11-06T22:50:19Z"
  },
  {
    "kind": "node_completed",
    "nodeId": "p",
    "nodeType": "ask_question",
    "status": "suspended",
    "durationMs": 8,
    "at": "2026-11-06T22:50:19Z"
  },
  {
    "kind": "suspended",
    "status": "waiting_for_message",
    "currentNodeId": "p",
    "at": "2026-11-06T22:50:19Z"
  },
  {
    "kind": "node_entered",
    "nodeId": "p",
    "nodeType": "ask_question",
    "at": "2026-11-06T22:50:19Z"
  },
  {
    "kind": "node_completed",
    "nodeId": "p",
    "nodeType": "ask_question",
    "status": "success",
    "durationMs": 7,
    "at": "2026-11-06T22:50:19Z"
  },
  {
    "kind": "node_entered",
    "nodeId": "ia",
    "nodeType": "ai_assistant",
    "at": "2026-11-06T22:50:19Z"
  },
  {
    "kind": "ai_decision",
    "nodeId": "ia",
    "decision": "stay",
    "label": null,
    "reason": "O cliente apenas informou o nome; não há despedida, então não há condição de saída atendida.",
    "turn": 1,
    "at": "2026-11-06T22:50:20Z"
  },
  {
    "kind": "text",
    "body": "Olá, Fernanda! Tudo bem com você?",
    "sender": null,
    "at": "2026-11-06T22:50:21Z"
  },
  {
    "kind": "node_completed",
    "nodeId": "ia",
    "nodeType": "ai_assistant",
    "status": "suspended",
    "durationMs": 2171,
    "at": "2026-11-06T22:50:21Z"
  },
  {
    "kind": "suspended",
    "status": "waiting_for_message",
    "currentNodeId": "ia",
    "at": "2026-11-06T22:50:21Z"
  },
  {
    "kind": "stopped",
    "at": "2026-11-06T22:50:22Z"
  }
]
```

---

## Como uma mensagem vira execução

`Chats::InboundFlow` chama `Flows::InboundDispatcher.call(chat:, text:, event:, message_id:)` quando a automação pode rodar.

1. **Caminho rápido.** Organização sem fluxo de mensagem, sem execução viva na conversa e sem fluxo de campanha não paga nada.
2. **Debounce.** A mensagem entra numa caixa dentro do documento da conversa (`$push` atômico), e só a primeira agenda um job, com 3 s por padrão (`organization.settings["flow_debounce_seconds"]`, de 0 a 60). As seguintes empurram o prazo: é **um job agendado por conversa**, e não um por mensagem. Enquanto o contato digita (`composing` ou `recording` em `presence.<chatId>`, que `Inbound::EvolutionEvents` grava e vale 10 s), espera mais, até 30 s. Só a Evolution manda presença: nos outros canais, vale só o prazo.
3. **Execução rodando na conversa:** a caixa espera, e o fim da rodada a entrega. É o que impede o mesmo bloco de rodar duas vezes.
4. **`Flows::Dispatch`:** retoma quem está em `waiting_for_message`. Se ninguém esperava, começa os fluxos: o da campanha (`chat.outreach_flow_id`, conferindo a organização e que está publicado), ou então os publicados cujo gatilho casa.

| Evento | Gatilhos |
|---|---|
| `first_message` | `first_message`, `message_received`, `keyword` |
| `message_received` | `message_received`, `keyword` |
| `contact_created` | `contact_created`. Ao criar a conversa, fora de carga em lote e da conversa de teste, com a automação ligada |
| `human_handoff` | `human_handoff`. Quando a automação vira de ligada para pausada por `pause_automation_for_human!` (a pessoa respondeu, mensagem enviada de fora, bloco `transfer_to_human`). Roda com a automação pausada, e só o interruptor da organização desliga |

`contact_created` e `human_handoff` nascem na própria conversa e entram por `Flows::InboundDispatcher.fire_event(chat:, event:)`: `call` significa mensagem. Falha ao disparar não impede ninguém de criar o contato nem de assumir a conversa.

Todos os que casam começam, como na origem. Um fluxo com a palavra `pix` e outro de "mensagem recebida" respondem os dois: separe na tela.

**As garantias da execução:**

- **Um bloco não roda duas vezes.** Retomar é um `UPDATE` só, condicionado ao estado (`FlowExecution.claim`), e só quem o ganha executa.
- **Uma execução viva por fluxo e conversa**, garantida por índice único. A mesma mensagem nunca começa o mesmo fluxo duas vezes (`idempotency_key`).
- **Mensagem que perde a corrida** volta para a caixa.
- **Queda no meio de um bloco não repete:** o bloco pode já ter enviado a mensagem. `Flows::SweepStaleExecutionsJob` dá por `failed` depois de 15 minutos parada, com alerta, e entrega o que estava na caixa.
- **Espera por tempo:** `set(wait:)`, com um token. Uma pessoa assumiu no meio? Cancela, em vez de falar por cima. Job que sumiu no Redis é reagendado. Mensagem que chega nessa hora não retoma nem recomeça o fluxo, porque ele continua vivo.
- **Script:** bloco que roda JavaScript (`execute_tool`, e `ai_assistant` com ferramenta) vai para a fila `scripts`, faz só aquele bloco e volta. Sem nova tentativa.
- **Tetos:** 50 blocos por rodada sem esperar (o `loop` renova a cada volta), 2.000 por execução, variável de 64 KB e 512 KB no total, 5 níveis de subfluxo.

---

## Créditos

| | Créditos |
|---|---|
| `ai_assistant`, rodada que responde, modelo principal (Opus 5.5) | 2, com o juiz incluído |
| `ai_assistant`, rodada que responde, modelo rápido (Haiku 5.5) | 1 |
| `ai_assistant`, sair sem responder | 1 (só o juiz) |
| `ai_assistant` em modo `processing`, `ai_parameter_extractor` | 2 no principal, 1 no rápido |
| `ai_sentiment`, `ai_intent_classification` | 1 |
| `ai_audio_transcription` com `audio_url` | 1 |
| `ai_audio_transcription` da mensagem recebida | 0 |

Falha do modelo devolve o crédito daquela chamada (o juiz que já decidiu fica pago). Sem saldo, o modelo não é chamado, a execução para (ou segue por `onError`) e a organização recebe o alerta `flow_no_credits`. `aiCosts` em `/catalog` ainda não lista estes valores.

Alertas (`category: "flows"`), todos resolvidos ao publicar: `flow_execution_failed`, `flow_no_credits`, `flow_attachment_missing` e `flow_funnel_stage_missing`.

### O que a mensagem guarda

Toda mensagem que um bloco envia sai com `role: "assistant"`, `message_origin: "platform"` e sem conta, que é o que separa automação de pessoa em `Insights::MessageAuthorship`, e com `flow_id`, em todas as partes e na original. A API de mensagens não expõe `flow_id`, e o ranking por fluxo ainda não existe.

A resposta do `ai_assistant` guarda também os tokens, numa mensagem só: a original, se foi em partes, porque é ela que as métricas contam.

| Campo | O que é |
|---|---|
| `usage_model` | O modelo que escreveu a resposta |
| `usage_prompt_tokens` | O prompt inteiro, com o que veio do cache e o que foi para ele, somando as rodadas de ferramenta |
| `usage_cached_tokens` | A parte do prompt que veio do cache |
| `usage_completion_tokens` | O que o modelo escreveu, com o pensamento |

**Só a resposta tem tokens.** O juiz de saída fica de fora, porque é outro modelo e `usage_model` só cabe um; e os blocos que não respondem ao contato (`ai_sentiment`, `ai_intent_classification`, `ai_parameter_extractor`, `ai_audio_transcription`, `ai_assistant` em `processing`) não têm mensagem onde gravar. Esses aparecem só nos créditos e no log `[FlowRuntime::Llm]`.

---

## API JS: `appointment` e `classGroup`

Extensões `scheduling` e `class_group_scheduling` do motor de scripts, com os nomes e as respostas da origem. O calendário é `Agenda::Calendar.default_for(organização)`, porque antes vinha do assistente. Tudo falha fechado sem organização, e o que é da conversa pede conversa.

| | Retorno |
|---|---|
| `appointment.services()` | `[{ service_name, duration, description, employee_with_priority, external_id }]` |
| `appointment.employees()` | `[{ name, external_id, list_of_allowed_services_of_this_employee }]` |
| `appointment.serviceAvailableSlots(serviço, início, fim, profissional?)` | `{ employee_name, service_name, available_slots: { "terça-feira, 2026-11-10": ["09:00"] } }` ou `{ error }` |
| `appointment.create(profissional, serviço, início, externalId?)` | `{ success, message, booking_id, service_duration, ... }` ou `{ error }` |
| `appointment.cancel(id)` | `{ message }` |
| `appointment.scheduledList(completo?)` | Os agendamentos da conversa: `[{ id, start, end, service_name, employee_name, external_id }]` |
| `appointment.updateExternalId(id, externalId)` | `{ success }` |
| `classGroup.list()` | `[{ name, description, available_spots, schedule }]` |
| `classGroup.availability(turma, dias?)` | `{ name, available_spots, sessions: [{ date, end, day_of_week, day_name, window_start }] }` (`dias`: padrão 14, até 90) |
| `classGroup.enroll(turma, diaDaSemana, inicio)` | `{ success, enrollment_id, class_group_name, schedule_day_of_week, schedule_window_start, message }` ou `{ error }` |
| `classGroup.unenroll(turma, diaDaSemana, inicio)` | Igual |
| `classGroup.myEnrollments()` | `[{ enrollment_id, class_group_id, class_group_name, instructor_name, room, enrolled_at }]` |

---

## Hooks da origem

Todo export de `aiva-frontend/src/api/{useFlows,useFlowTemplates,useWorkspaceTools,useToolCatalog,useToolInstallations,useFunctionActions,useWebhooks,useWebhookLogs}.ts`.

| Export | Origem | Aqui |
|---|---|---|
| **`useFlows.ts`** | | |
| `useFlows`: `flows` | `GET /flows` | `GET /flows` (agora paginado) |
| `useFlows`: `createFlow` | `POST /flows` | `POST /flows` |
| `useFlows`: `archiveFlow` | `POST /flows/:id/archive` | Igual |
| `useFlows`: `deleteFlow` | `DELETE /flows/:id` | Igual |
| `useFlow`: `flow` | `GET /flows/:id` | Igual |
| `useFlow`: `updateMetadata` | `PUT /flows/:id` | `PATCH /flows/:id` |
| `useFlow`: `saveDefinition` | `PUT /flows/:id/definition` | Igual |
| `useFlow`: `publish` | `POST /flows/:id/publish` | Igual |
| **`useFlowTemplates.ts`** | | |
| `useFlowTemplates` (padrão) | `GET /flow_templates` | `GET /flow-templates` |
| **`useWorkspaceTools.ts`** | | |
| `useWorkspaceTools`: `tools` | `GET /tools` | Igual |
| `createTool` | `POST /tools` | Igual |
| `updateTool` | `PUT /tools/:id` | `PATCH /tools/:id` |
| `deleteTool` | `DELETE /tools/:id` | Igual |
| `testTool` | `POST /tools/:id/test`, com a resposta na hora | `POST /tools/:id/test` + `GET /tools/:id/test-runs/:runId` |
| `WorkspaceToolPayload` (tipo) | | `{ tool: { name, description, jsCode, parameters } }` |
| **`useToolCatalog.ts`** | | |
| `useToolCatalog`: `tools` | `GET /tool_catalog` | `GET /tool-catalog` |
| `useToolCatalog`: `showTool` | `GET /tool_catalog/:id` | `GET /tool-catalog/:id` |
| `useAdminToolCatalog` (todos) | `/api/admin/tool_catalog` | **Fora do escopo:** painel interno (MANIFEST). O catálogo vem da semente |
| **`useToolInstallations.ts`** | | |
| `useToolInstallations`: `installations` | `GET /automations/:id/tool_installations` | `GET /tool-installations` |
| `installTool` | `POST` | `POST /tool-installations` |
| `uninstallTool` | `DELETE /:id` | `DELETE /tool-installations/:id` |
| `toggleTool` | `PATCH /:id/toggle` | `PATCH /tool-installations/:id/toggle` |
| `updateInstallation` | `PATCH /:id` | `PATCH /tool-installations/:id` |
| **`useFunctionActions.ts`** | | |
| `functionActions` | `GET /automations/:id/function_actions` | `GET /tools` |
| `showFunctionAction` | `GET .../:id` | `GET /tools/:id` |
| `createFunctionAction` | `POST` | `POST /tools` |
| `updateFunctionAction` | `PATCH /:id` | `PATCH /tools/:id` |
| `destroyFunctionAction` | `DELETE /:id` | `DELETE /tools/:id` |
| `personalizeFunctionAction` | `POST /:id/personalize` | `POST /tools/:id/personalize` |
| **`useWebhooks.ts`** | | |
| `useWebhooks`: `webhooks` | `GET /webhooks` | Igual, com `{ webhooks, meta }` |
| `createWebhook` | `POST /webhooks` | Igual |
| `updateWebhook` | `PUT /webhooks/:id`, com `webhookActionsAttributes` indexado | `PATCH /webhooks/:id`, com `webhookActions` em lista |
| `toggleStatus` | `PUT /webhooks/:id` | `PATCH /webhooks/:id` |
| `destroyWebhook` | `DELETE /webhooks/:id` | Igual |
| `enableSignature` | `POST .../enable_signature` | `POST /webhooks/:id/enable-signature` |
| `rotateSigningSecret` | `POST .../rotate_signing_secret` | `POST /webhooks/:id/rotate-signing-secret` |
| `disableSignature` | `DELETE .../disable_signature` | `DELETE /webhooks/:id/disable-signature` |
| `getWebhookUrl` | Montava no cliente | `webhook.url` |
| `useWebhookDetails` | `GET /webhooks/:id` (rota sem ação na origem) | `GET /webhooks/:id` |
| `useInstanceVariables` | `GET /webhooks/instance_variables` | `GET /custom-fields` |
| Tipos `Webhook`, `WebhookAction`, `RequestFields`, `InstanceVariable`, `WebhookSigningSecretResponse` | | Ver as respostas acima. `type` da ação é `HookAction::*`, e `WebhookAction::AssignAutomation` é `HookAction::StartFlow`. |
| **`useWebhookLogs.ts`** | | |
| `useWebhookLogs` (padrão) | `GET /webhook_logs` | `GET /webhook-logs`. `meta.totalCount` é `meta.total` |
| `useWebhookLogsStats` | `GET /webhook_logs/stats` | `GET /webhook-logs/stats`, dentro de `{ stats }` |
| `useWebhookLogDetail` | `GET /webhook_logs/:id` | `GET /webhook-logs/:id`, dentro de `{ log }` |
| Tipos `WebhookLog`, `WebhookLogsFilters`, `WebhookLogsStats` | | Ver as respostas acima |

Nomes de campo que mudaram: `integrationFilter` é `connectorFilter` (`integrationIds` é `connectorIds`), `conversationId` é `chatId`, `organizationId` em ações é `flowId`, `integrationId` é `connectorId`, `messageTemplate` é `messageText`, `messageTemplateId` é `whatsappTemplateId`, `instanceVariableDefinitionId` é `customFieldId`, `functionActionIds` é `toolFunctionIds`. `scope` da função e `followUp*` da ação caíram, com o assistente. Id de fluxo é UUID, e de função é BSON: no front, sempre `string`.

---

## Semente

`db/seeds/automation.rb`, na organização de `marina.duarte@exemplo.com.br`, com a Doma Store. Idempotente, sem job nem rede: o que já existe fica como está.

- **Catálogo:** `db/seeds/tool_catalog/` (8 ferramentas), igual para toda organização.
- **Funções:** `consultar_frete`, `status_do_pedido`, e a ferramenta Utilidades Brasil instalada.
- **Fluxos:** 6 publicados (Boas-vindas da Doma, Pedido de orçamento, Pesquisa de satisfação, Carrinho abandonado, Atendente da loja, Aviso de transferência), 1 rascunho e 1 arquivado. O com IA só responde à palavra "atendente", para ninguém gastar crédito sem querer.
- **Histórico:** execuções completas, com erro e esperando, com os blocos de cada uma.
- **Webhooks:** ativo, em teste com corpo capturado, e inativo com assinatura; 90 logs nos últimos dias.

---

## Para o deploy

- **Índices do Mongo:** `bin/rails db:mongoid:create_indexes` antes de receber tráfego. O TTL de `HookLog` depende disso, e a fonte `hook_logs` é recusada sem o índice, porque o diz por `hint`.
- **Processo de scripts:** `bundle exec sidekiq -C config/sidekiq_scripts.yml`. Sem ele, os blocos `execute_tool` e `ai_assistant` com ferramenta, e a ação de script do webhook, ficam parados. A concorrência é 2, e o bloco de IA com ferramenta segura uma thread dessas enquanto o modelo responde. Se isso virar gargalo, é ali que se mexe.
- **Filas:** `default` (fluxos e webhooks), `scripts` (JavaScript de cliente), `low` (varredura e retenção).
- **Recorrentes:** `config/schedule/automation.yml`. `Flows::SweepStaleExecutionsJob` (5 min), `Flows::PruneExecutionsJob` (04:17: execução de 30 dias, teste de 1 dia, pergunta sem resposta há 30 dias, versões antigas sem uso) e `Hooks::PruneLogsJob` (04:37).
- **`ANTHROPIC_API_KEY`:** sem ela, os blocos de IA param a execução com o motivo (ou seguem por `onError`) e não cobram. **`BACKEND_URL`:** é de onde sai `webhook.url`. **`OPENAI_ACCESS_TOKEN`:** só para `ai_audio_transcription` com URL; sem ela, sai por `onError`.
- **Corpo:** a entrada do webhook aceita até 1 MB. Se o proxy tiver limite menor, é ele quem responde primeiro.
- **Debounce:** 3 s, como o `delay_response` padrão dos assistentes. Por organização em `settings["flow_debounce_seconds"]`, pelo console por enquanto.

---

## Limitações conhecidas

- **`goto_flow` não espera** o outro fluxo terminar, como na origem: se ele parar numa pergunta, este segue.
- **`send_interactive`** manda as opções como texto numerado: nenhum canal daqui tem botão nativo. Na origem, as opções se perdiam.
- **Fluxos que casam disparam todos**, como na origem.
- **`human_handoff`** não dispara quando a pessoa só desliga a automação pela tela (`PATCH /chats/:id`), só quando assume respondendo. Mudar é uma linha em `ChatRelations::Automation`.
- **`flow_debounce_seconds`** se ajusta em `/automation-settings` (`flowDebounceSeconds`), do domínio connectors.
- **Ordem da rajada:** mensagens processadas ao mesmo tempo podem entrar na caixa fora de ordem. Mensagem que chega com segundos de diferença sai em ordem.
- **Credencial em URL de `http_request`:** o histórico filtra cabeçalhos, não a URL nem o corpo.
- **`ToolFunction::Http`** existe, sem rota, como na origem, onde nada o usava.
