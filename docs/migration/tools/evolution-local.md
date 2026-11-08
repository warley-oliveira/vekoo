# Evolution local: conectar um WhatsApp de verdade

Roteiro curto para ligar um WhatsApp ao Vekoo em desenvolvimento, pela Evolution API v2 que roda nesta máquina
(`~/sandbox/evolution-api`, porta 8089). Tudo o que está aqui foi exercitado sem telefone; com o telefone, só o passo 3
é novo.

## 1. Subir

A Evolution roda nativa no WSL (não em contêiner), com o Postgres e o Redis dela em contêiner (`evolution_postgres` em
15432 e `evolution_redis` em 16379). Como ela está na mesma rede do Rails, o webhook vai direto para `localhost`, sem
túnel nem `host.docker.internal`.

```bash
cd ~/sandbox/evolution-api
RABBITMQ_ENABLED=false TELEMETRY_ENABLED=false QRCODE_LIMIT=30 node dist/main
curl -s localhost:8089 | head -c 120     # "Welcome to the Evolution API, it is working!"
```

As três variáveis vão na linha de comando para não mexer no `.env` de lá:

| Variável | Por quê |
|---|---|
| `RABBITMQ_ENABLED=false` | O `.env` de lá liga o RabbitMQ em `localhost:5672`, que não existe nesta máquina. O Vekoo recebe por webhook. |
| `TELEMETRY_ENABLED=false` | Não manda telemetria para fora. |
| `QRCODE_LIMIT=30` | O `.env` de lá tem `1`: a pessoa teria um QR só (uns 20 s) antes de a Evolution recusar a conexão. |

O `.env` de lá tem `S3_ENABLED=true` com o bucket da AIVA: a mídia recebida vai para lá e chega ao Vekoo como `mediaUrl`.

No Vekoo (`.env` da raiz):

```bash
EVOLUTION_API_KEY=<o AUTHENTICATION_API_KEY do .env da Evolution>
# EVOLUTION_API_URL=http://localhost:8089   (o padrão)
# BACKEND_URL=http://localhost:$RAILS_PORT  (o padrão: é o endereço que vai no webhook da instância)
```

Depois `bin/dev` (ou Puma + os dois Sidekiq: o envio e os fluxos rodam em job, e a fila `scripts` roda as funções em JS).

## 2. Criar o canal

Configurações > Integrações > Adicionar > WhatsApp (QR code). O Vekoo chama `POST /instance/create` na Evolution com o
webhook já configurado:

- URL: `http://localhost:<RAILS_PORT>/inbound/evolution/IWA-<id do conector>?token=<token do conector>`
- Eventos: `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `SEND_MESSAGE`, `CONNECTION_UPDATE`, `QRCODE_UPDATED`,
  `PRESENCE_UPDATE`, `CONTACTS_UPSERT`, `CONTACTS_UPDATE`

Conferir do lado da Evolution:

```bash
KEY=<AUTHENTICATION_API_KEY>
curl -s -H "apikey: $KEY" "localhost:8089/instance/fetchInstances?instanceName=IWA-<id>"
curl -s -H "apikey: $KEY" "localhost:8089/webhook/find/IWA-<id>"
```

## 3. Conectar pelo QR ou pelo código

O QR aparece no diálogo em poucos segundos (vem pelo webhook `qrcode.updated` e pelo `ConnectorsChannel`). No
celular: WhatsApp > Aparelhos conectados > Conectar um aparelho, e ler o QR. No celular do próprio Vekoo o padrão é o
código de pareamento: informar o número e digitar o código no WhatsApp (Conectar com número de telefone).

O que esperar:

1. Ao ler, a Evolution manda `connection.update` com `statusReason: 200`: o canal fica **Ativo**, o diálogo fecha e o
   nome e a foto do número aparecem.
2. Mandar "oi" de outro telefone para esse número: a conversa aparece no Chat em tempo real.
3. Com um fluxo publicado (por exemplo "Boas-vindas da Doma", gatilho de primeira mensagem), a resposta sai em 3 a 13 s
   (o debounce de 3 s mais a ronda do Sidekiq). Uma rajada de mensagens vira uma resposta só.
4. Responder pelo próprio celular pausa a automação daquela conversa (é atendimento humano).
5. Entregue e lida aparecem na mensagem enviada (`messages.update`).

## 4. Diagnosticar

| Sintoma | Onde olhar |
|---|---|
| QR não aparece | Log da Evolution: a instância nasceu? `fetchInstances`. No Rails, `backend/log/development.log`: `Started POST "/inbound/evolution/IWA-...`. Sem essa linha, a Evolution não alcança o Rails (porta errada em `BACKEND_URL`). |
| "QR expirou" logo | `QRCODE_LIMIT` baixo. A Evolution manda `qrcode.updated` com `statusCode: 500` e o canal fica `failed`: é só pedir de novo. |
| 404 no webhook | Token da URL não confere (canal recriado, ou URL antiga na instância). Reativar o canal reconfigura. |
| Mensagem chega e o fluxo não responde | O canal está Ativo? Automação da organização ligada (Automação > Configurações)? A conversa está com atendimento humano (automação pausada)? Execuções do fluxo: `/flows/<id>/executions`. |
| Resposta demora ~1 min ou não sai | A Evolution segura o `sendText` enquanto a instância não está `open`. Os jobs de envio esperam até 60 s por tentativa (ver "Timeout de provedor" em DECISIONS). |
| Mídia recebida não abre | Sem S3 na Evolution, o Vekoo pede o conteúdo em `/chat/getBase64FromMediaMessage`. |

Roteiros que provam o caminho, em `~/.cache/vekoo-shot/wt39/`: `e2e-evolution.mjs` (Evolution real, sem telefone) e
`e2e-flows.mjs` (todos os blocos, com o provedor simulado no lugar da Evolution).
