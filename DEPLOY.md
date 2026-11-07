# Deploy — Vekoo

| | |
|---|---|
| **Front** (`my.vekoo.app`) | Cloudflare **Workers** (assets estáticos) — build do Vite no CI da Cloudflare |
| **API** (`syco.vekoo.app`) | Kamal 2 numa VPS própria — `107.152.37.137`, Ubuntu 26.04, 4 vCPU, 3.8 GB de RAM |
| **Bancos** | Postgres 16 com pgvector, MongoDB 7 e Redis, como accessories na mesma VPS |
| **TLS** | Certificado autoassinado na origem + zona em **Full**. Sem Let's Encrypt, sem certbot, sem credencial da Cloudflare |
| **Registry** | `ghcr.io/warley-oliveira` — exige PAT **classic** |

**Por onde começar:**

- A produção de hoje ainda roda a versão só de carrosséis. O primeiro deploy da plataforma é a [seção 5](#5-levar-a-produção-atual-para-a-plataforma).
- Servidor novo, do zero: [seção 4](#4-primeiro-deploy-num-host-novo).
- Dia a dia: [seção 6](#6-deploy-normal). Depois de qualquer um deles: [seção 8](#8-o-que-conferir-depois-do-deploy).
- Desenvolvimento não está aqui: `bin/setup`, depois `bin/dev`.

**Nada deste documento foi rodado em produção nesta versão.** O que foi ensaiado localmente, e o que não foi, está na [seção 12](#12-o-que-foi-verificado).

---

## 1. O que sobe

| Container | O que é | Sem ele |
|---|---|---|
| `vekoo-api-web` | Thruster + Puma (2 processos), com o `/cable` | Sem API |
| `vekoo-api-worker` | Sidekiq: `critical`, `default`, `campaigns`, `mailers`, `low`, e os jobs recorrentes de `config/schedule/*.yml` | Nada de mensagem, campanha nem lembrete |
| `vekoo-api-scripts` | Sidekiq só da fila `scripts`: o JavaScript de cliente, em processo próprio, com teto de 1 GB | Blocos `execute_tool` e `ai_assistant` com ferramenta e ação de script do webhook ficam parados |
| `vekoo-api-db` | `pgvector/pgvector:pg16-trixie`, volume `vekoo_pgdata` | |
| `vekoo-api-mongodb` | `mongo:7.0`, com autenticação e cache de 0.5 GB, volumes `vekoo_mongodata` e `vekoo_mongoconfig` | |
| `vekoo-api-redis` | `redis:7.4-alpine`, volume `vekoo_redis`. Banco 0 é a fila, 1 o pub/sub do cable, 2 o cache | |
| `kamal-proxy` | TLS e troca de versão sem queda | |

O volume `vekoo_storage` (anexos) é montado nos três papéis da aplicação: é por ele que a exportação feita pelo worker chega à API.

**A ordem do boot é o que protege o tráfego.** `web` é o papel primário. O `bin/docker-entrypoint` dele roda, antes de abrir a porta:

```bash
./bin/rails db:mongoid:create_indexes db:prepare platform:sync
```

| Passo | Por quê |
|---|---|
| `db:mongoid:create_indexes` | As agregações do dashboard, dos funis e dos dashboards personalizados usam `hint`. Sem o índice, o Mongo **recusa** a consulta. Os índices únicos são os que seguram clique duplo e importação simultânea, e o TTL de `HookLog` também depende disso. Vem primeiro: sem Mongo, o deploy para antes de migrar o Postgres. |
| `db:prepare` | Cria o banco no primeiro boot e aplica as migrations nos demais. Num banco vazio, roda a semente base. |
| `platform:sync` | O dado do produto, que a semente não leva a produção: o catálogo de ferramentas (sem ele, `GET /tool-catalog` responde vazio) e os grupos padrão das organizações antigas. |

O healthcheck do proxy só passa depois disso, e o Kamal só sobe `worker` e `scripts` depois do healthcheck. **Se qualquer passo falhar, o container morre, o healthcheck não passa, e a versão anterior continua no ar.** Ninguém precisa lembrar de criar índice: está no deploy.

**O que não sobe com este deploy:** o servidor da Evolution (`EVOLUTION_API_URL` aponta para ele, em outro lugar), o bundle embutível do widget, e-mail ([seção 11](#11-o-que-ainda-não-existe)).

**Memória.** Numa base vazia, medido localmente: cerca de 300 MB por processo do Rails, em repouso. Somando Mongo (cache de 0.5 GB), Postgres e Redis, são cerca de 2.5 GB dos 3.8 GB, com 2 GB de swap. **Não medido sob carga.** Confira com `docker stats` depois de abrir. Se apertar, o primeiro botão é `WEB_CONCURRENCY: 1`; o segundo, VPS maior.

## 2. Por que este desenho difere do guia genérico

O guia `deploy-kamal.md` assume DNS apontando direto para o IP, com o `kamal-proxy` emitindo Let's Encrypt via ACME HTTP-01. **Aqui os domínios estão atrás do proxy da Cloudflare** (nuvem laranja). Isso muda três coisas:

1. **ACME HTTP-01 não fecha de forma confiável.** O desafio chega na porta 80 da Cloudflare, não no servidor; com *Always Use HTTPS* ligado ele vira redirect e a validação falha. A solução não é desligar o proxy: é servir um certificado próprio no `kamal-proxy`, que o Kamal 2.12 suporta nativamente.
2. **O front não precisa de servidor.** Sendo um SPA estático, a Cloudflare entrega melhor que um container na VPS.
3. **80/443 ficam fechados para o mundo.** Todo tráfego legítimo vem da Cloudflare, e o firewall só libera as faixas dela. Isso também impede que alguém descubra o IP de origem e contorne o WAF. O firewall é uma chain própria em `DOCKER-USER`, porque o Docker faz DNAT antes do `INPUT`, onde o UFW atua (ver os comentários em `bin/deploy-setup`).

## 3. O que está no repositório

```
backend/
  Dockerfile                    multi-stage; SEM assets:precompile (API-only); ffmpeg e libvips
  bin/docker-entrypoint         índices, migrations e dado do produto antes do Thruster abrir a porta 80
  config/deploy.yml             web + worker + scripts; accessories db, mongodb e redis
  .kamal/secrets                só referências a env vars — versionável
  .kamal/certs/                 o PEM da origem entra aqui (gitignorado)
frontend/
  wrangler.jsonc                Worker somente-assets e fallback do SPA
  public/_headers               cache + segurança + CSP
bin/deploy-setup                provisionamento idempotente do host e backup noturno
.env.deploy                     segredos, gitignorado, nunca versionado
.env.deploy.example             TODAS as variáveis, com o que para de funcionar sem cada uma
```

Hardening aplicado ao Rails (`backend/config/`):

| Arquivo | Mudança | Por quê |
|---|---|---|
| `environments/production.rb` | `config.hosts` via `APP_HOSTS` **e** `/up` excluído | Sem a exclusão o healthcheck toma 403 e **todo deploy faz rollback** |
| `environments/production.rb` | `cache_store = :redis_cache_store` (banco 2) | O cache guarda estado **compartilhado**: travas e contadores de tentativa. `memory_store` é por processo |
| `environments/production.rb` | mailer/`default_url_options` de `BACKEND_URL` | URLs absolutas de anexo apontariam para `example.com` |
| `environments/production.rb` | `trusted_proxies` com as faixas da Cloudflare | Sem isso `remote_ip` é o IP da borda, e quem cai na mesma borda divide o limite de login, de cadastro e de conexão do widget |
| `initializers/cors.rb` | `FRONTEND_ORIGINS` explícito, também no `/cable` | `origins '*'` deixa qualquer site dirigir a API pelo navegador de quem está logado |
| `puma.rb` | `workers` declarado | O arquivo stock não declara: `WEB_CONCURRENCY` não fazia nada |
| `cable.yml` | `CABLE_REDIS_URL` própria | Senão o pub/sub do cable vai parar no banco 0, o da fila |

## 4. Primeiro deploy num host novo

Precisa, na máquina de deploy: gem `kamal` 2.12 (global: não está no `Gemfile`), Docker + buildx e uma chave SSH de deploy (`~/.ssh/vekoo_deploy`).

**4.1 Registry.** `github.com/settings/tokens` → *Generate new token (classic)*, com `write:packages` e `read:packages`.

> **Classic, não fine-grained — verificado na prática.** Um token `github_pat_*` faz `docker login` com sucesso e falha no push com `permission_denied: The token provided does not match expected scopes`. O login passar não significa nada.

**4.2 Certificado da origem.** Vale por dez anos, e a Cloudflare em **Full** não confere a cadeia:

```bash
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 -subj "/CN=syco.vekoo.app" \
  -addext "subjectAltName=DNS:syco.vekoo.app" \
  -keyout backend/.kamal/certs/syco.vekoo.app.key -out backend/.kamal/certs/syco.vekoo.app.pem
chmod 600 backend/.kamal/certs/syco.vekoo.app.key
```

Na zona: *SSL/TLS → Overview* → **Full** e *Edge Certificates* → *Always Use HTTPS*: **On**.

> **Full, não Full (strict).** *Strict* valida a cadeia e recusaria um autoassinado (erro 526). O tráfego entre a Cloudflare e a VPS vai cifrado, mas sem autenticar a origem: alguém já posicionado nesse caminho poderia se passar pelo servidor. O risco é baixo com o firewall fechado, e é adequado à fase de validação. **Não é o que se leva para produção com dados reais de clientes.** Para promover: gere um *Origin Certificate* em *SSL/TLS → Origin Server*, sobrescreva os **mesmos dois arquivos**, mude a zona para **Full (strict)** e rode `kamal deploy`. Nenhuma linha de configuração muda.

**4.3 DNS.** Registro `syco`, tipo A, com o IP, proxied (laranja). O `my` nasce no passo do front.

**4.4 Servidor.** Docker, usuário `deploy`, swap de 2 GB, rotação de log, firewall, fail2ban, backup noturno e senha desligada:

```bash
ssh root@<IP> "bash -s -- $(base64 -w0 ~/.ssh/vekoo_deploy.pub)" < bin/deploy-setup
```

Confirme `ssh -i ~/.ssh/vekoo_deploy deploy@<IP> 'docker ps'` em outro terminal **antes** de fechar a sessão: a autenticação por senha acabou de ser desligada.

**4.5 Variáveis.** `cp .env.deploy.example .env.deploy` e preencha. Até o bloco "Bancos" é obrigatório, e o resto liga recurso por recurso. O endereço do host fica em `servers` e `accessories` do `deploy.yml`.

**4.6 Conferir, sem conectar em nada:**

```bash
set -a; . ./.env.deploy; set +a
cd backend
kamal config > /dev/null && echo ok    # imprime os segredos: não mande a saída para lugar nenhum
```

**4.7 Subir.** Faz o build, sobe o proxy e os três accessories e sobe a aplicação:

```bash
kamal setup
```

Num banco vazio o `db:prepare` **já roda a semente base** (carrosséis e a conta de demonstração). Enquanto Postgres e Mongo inicializam, o `web` pode morrer e reiniciar uma ou duas vezes: é a política de restart fazendo o que deve, dentro do `deploy_timeout`.

**Antes de abrir para clientes, troque a senha da conta de demonstração, ou apague a conta:** `marina.duarte@exemplo.com.br` / `carrossel123` é pública, está neste repositório. As sementes de domínio, com mais pessoas de senha conhecida, não rodam em produção: é preciso pedir, com `SEED_DEMO_DATA=1`.

**4.8 Front:** [seção 7.1](#71-front-na-cloudflare). **4.9 Fora do repositório:** [seção 7.2](#72-o-que-se-registra-fora-do-repositório). **4.10** [Conferir](#8-o-que-conferir-depois-do-deploy).

## 5. Levar a produção atual para a plataforma

O host já tem `vekoo-api-web`, `-worker`, `-db` (`postgres:16.10`, **sem pgvector**) e `-redis`. Esta versão falha sem a extensão, e por segurança: o deploy sem trocar a imagem morre na migration, com `extension "vector" is not available`, e a versão anterior continua no ar (ensaiado).

A API antiga continua funcionando durante todos os passos até o 7, exceto pelos segundos em que o Postgres reinicia. Faça fora do horário de pico.

**1. Preencha `.env.deploy`** com o que entrou: compare com `.env.deploy.example`. No mínimo `MONGO_INITDB_ROOT_PASSWORD` e `MONGODB_URI`, com a mesma senha. Todos os comandos abaixo saem de `backend/`, com o ambiente carregado:

```bash
set -a; . ./.env.deploy; set +a
cd backend
```

**2. Backup agora, e fora do servidor:**

```bash
ssh root@107.152.37.137 /usr/local/bin/vekoo-backup
scp deploy@107.152.37.137:'/var/backups/vekoo/db-*.pgdump' .
```

**3. Confira a glibc do volume**, como manda a seção abaixo. Só leitura.

**4. Troque a imagem do Postgres.** Baixa a imagem antes de parar, e o volume fica:

```bash
kamal accessory reboot db
kamal accessory logs db --lines 50 | grep -c 'collation version mismatch'    # 0
kamal dbc
```

```sql
SELECT default_version FROM pg_available_extensions WHERE name = 'vector';   -- uma versão
```

**5. Suba o Mongo:**

```bash
kamal accessory boot mongodb
kamal accessory exec mongodb --reuse "mongosh --quiet --eval 'db.adminCommand({ ping: 1 }).ok'"    # 1
```

A senha só vale na criação do volume. Trocar depois pede `db.changeUserPassword`, além do `.env.deploy`.

**6. Atualize o backup do host**, agora que o Mongo existe. Só isto, sem reiniciar o Docker nem refazer o firewall:

```bash
ssh root@107.152.37.137 "bash -s -- --backup-only" < ../bin/deploy-setup
ssh root@107.152.37.137 /usr/local/bin/vekoo-backup
ssh deploy@107.152.37.137 'ls -lh /var/backups/vekoo'    # db, mongo e storage
```

**7. Deploy.** O entrypoint cria os índices, aplica as migrations e sincroniza o dado do produto, e o papel `scripts` nasce aqui:

```bash
kamal deploy
```

**8. Publique o front** ([seção 7.1](#71-front-na-cloudflare)), com as variáveis novas.

**9. Registre o que fica fora do repositório** ([seção 7.2](#72-o-que-se-registra-fora-do-repositório)) e [confira](#8-o-que-conferir-depois-do-deploy).

**10. Preencha a história do dashboard, fora do horário de pico.** Varre as mensagens de cada organização, e tem pausa entre elas para não competir com quem entrega. É idempotente, e sem conversa antiga termina em segundos:

```bash
kamal app exec -r web --reuse "bin/rails 'dashboards:backfill_operational[90]'"
```

### Trocar a imagem do Postgres

A extensão `vector` não existe na `postgres:16.10`, e por isso a troca de imagem. O risco não é o major: é a **glibc**. O Postgres ordena texto pela biblioteca do sistema, e os índices em disco foram montados com a ordem da versão que criou o banco. Imagem com outra glibc pode ordenar diferente, e o índice de texto passa a mentir: busca que não acha, e `unique` que deixa passar duplicado, sem erro nenhum. Foi o que apareceu em desenvolvimento com `pgvector/pgvector:pg16`, e a variante `pg16-trixie` resolveu.

**O tag `postgres:16.10` não diz a distro da imagem, e a padrão muda com o tempo:** não dá para saber daqui qual glibc criou o volume de produção. Confira, sem escrever nada:

```bash
kamal accessory exec db --reuse "psql -U vekoo -d vekoo_production -c 'SELECT datname, datcollate, datcollversion, pg_database_collation_actual_version(oid) FROM pg_database WHERE datallowconn'"
kamal accessory exec db --reuse "ldd --version"
```

`datcollversion` é a versão com que o banco nasceu. Compare com a da imagem nova:

```bash
ssh deploy@107.152.37.137 'docker run --rm --entrypoint ldd pgvector/pgvector:pg16-trixie --version'
```

| `datcollversion` | O que fazer |
|---|---|
| Igual à da imagem nova (`2.41`, conferida em `pg16-trixie`) | Siga. É o que está no `deploy.yml`. |
| `2.36` (Debian 12) | Troque `image:` no `deploy.yml` para `pgvector/pgvector:pg16-bookworm`, confira o `ldd` dela do mesmo jeito, e siga. Em desenvolvimento, a `pgvector/pgvector:pg16` era 2.36. |
| Outra | Procure o tag com a mesma glibc. Sem nenhum, é preciso reconstruir: abaixo. |

**Se a troca ficar errada**, toda conexão avisa, em `psql` e no log do servidor (ensaiado):

```
WARNING:  database "vekoo_production" has a collation version mismatch
DETAIL:  The database was created using collation version 2.41, but the operating system provides version 2.36.
```

Se nada escreveu ainda, volte a imagem no `deploy.yml` e rode `kamal accessory reboot db`. O volume não muda de formato entre elas. Se já escreveu, ou para ficar de vez numa glibc diferente, reconstrua em cada banco:

```sql
REINDEX DATABASE vekoo_production;
ALTER DATABASE vekoo_production REFRESH COLLATION VERSION;
```

O `REINDEX` trava as tabelas: fora do horário de pico.

## 6. Deploy normal

```bash
set -a; . ./.env.deploy; set +a
```

| Situação | Comando |
|---|---|
| Back mudou | Commit, depois `cd backend && kamal deploy`. Índices e migrations rodam sozinhos |
| Front mudou | `git push`: a Cloudflare builda e publica sozinha |
| Só reiniciar a API, ou mudou variável em `.env.deploy` ou `env` | `cd backend && kamal app boot` (sem build, com o env novo) |
| Mudou variável de accessory | `cd backend && kamal accessory reboot <nome>` |
| Voltar atrás (API) | `cd backend && kamal rollback <versão>`. **Não desfaz migration** |
| Voltar atrás (front) | Painel → *Deployments* → **Rollback** no deploy anterior |
| Console do Rails | `kamal console` |
| Tarefa pontual | `kamal app exec -r web --reuse "bin/rails ..."`. **O `-r web` importa:** ver armadilhas |
| psql / mongosh | `kamal dbc` / `kamal mongoc` |
| Índices à mão | `kamal indexes` |

**Índice novo em coleção grande.** O entrypoint espera o índice ficar pronto, e o `deploy_timeout` é de 180 s: passou disso, o Kamal desiste e volta. Construa antes, com a imagem nova, enquanto a versão atual atende:

```bash
kamal build push
kamal app exec -r web --version=$(git rev-parse HEAD) "bin/rails db:mongoid:create_indexes"
kamal deploy -P    # sem build de novo
```

## 7. Ambiente

**`.env.deploy.example` tem todas as variáveis, uma a uma, com o que para sem cada uma.** Variável nova entra lá, em `deploy.yml` e em `.kamal/secrets`. Em resumo: a API sobe só com o bloco até "Bancos", e o resto liga recurso por recurso. Vazio é "não configurado".

A exceção a conhecer: **com `META_APP_SECRET` e `INSTAGRAM_APP_SECRET` vazios, a API aceita webhook da Meta de qualquer um**, porque não tem o que conferir. Conectou canal da Meta, preencha.

### 7.1 Front na Cloudflare

| Campo | Valor |
|---|---|
| Repositório | O que o projeto observa. Ver [o front: dois caminhos](#10-o-front-dois-caminhos) |
| **Root directory** | `frontend`. É o campo que quebra o build se esquecido: é um monorepo |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

Variáveis de build. **`VITE_*` entra no bundle em tempo de build: mudar o valor exige novo build.**

| Variável | Valor | Sem ela |
|---|---|---|
| `VITE_API_URL` | `https://syco.vekoo.app` | Sem API |
| `NODE_VERSION` | `22` | Build com outro Node |
| `VITE_FB_APP_ID` | O mesmo `META_APP_ID` | Opções da Meta desabilitadas, com aviso |
| `VITE_FB_CONFIG_ID` | Embedded Signup do WhatsApp oficial | WhatsApp oficial desabilitado |
| `VITE_FB_META_CONFIG_ID` | Facebook Login do Messenger | Messenger desabilitado |
| `VITE_FB_SDK_VERSION` | Opcional. Padrão: `v24.0` | |
| `VITE_IG_APP_ID` | O mesmo `INSTAGRAM_APP_ID` | Instagram desabilitado |
| `VITE_IG_REDIRECT_URI` | Opcional. Padrão: a origem da tela + `/auth/instagram/callback` | |

O domínio: *Custom domains* → `my.vekoo.app` → **Activate**. A Cloudflare cria o CNAME proxied sozinha.

**CSP.** Fica em `frontend/public/_headers`, e **só existe em produção**: em desenvolvimento não há CSP, então um erro dela só aparece depois do deploy. O que está fixo lá:

| Diretiva | Valor fixo | Trocar quando |
|---|---|---|
| `connect-src` | `https://syco.vekoo.app wss://syco.vekoo.app` | A API mudar de domínio |
| `frame-src` | `https://syco.vekoo.app` (a prévia de PDF abre num iframe) | Idem |
| `script-src`, `connect-src`, `frame-src` | `connect.facebook.net`, `www.facebook.com`, `web.facebook.com` | A Meta mudar de endereço |

**Se a API mudar de domínio**, são estes os lugares, todos no mesmo deploy: as três ocorrências acima, `proxy.host` e `env.clear` do `deploy.yml` (`APP_HOSTS`, `BACKEND_URL`, `WIDGET_*`), `VITE_API_URL` e o certificado da origem. **Se o front mudar:** `FRONTEND_ORIGINS`, `GOOGLE_CALENDAR_REDIRECT_URI` e os registros da tabela abaixo.

Quem acrescentar SDK externo ajusta o `_headers` no mesmo commit, e confere o console em produção. **O Google Sheets do assistente de campanha ainda não está lá:** ver [seção 11](#11-o-que-ainda-não-existe).

### 7.2 O que se registra fora do repositório

| Onde | O que registrar | Sem isso |
|---|---|---|
| Meta, app do **Instagram Login**, URIs de redirecionamento | `https://my.vekoo.app/auth/instagram/callback` | Conectar Instagram volta com erro de `redirect_uri` |
| Meta, app principal, Facebook Login for Business | `https://my.vekoo.app` nos domínios do SDK e de login | Embedded Signup e Messenger não abrem |
| Meta, webhook de Instagram e Messenger | `https://syco.vekoo.app/inbound/meta-messaging`, com `META_MESSAGING_VERIFY_TOKEN` | Mensagem recebida não chega |
| Meta, webhook do WhatsApp oficial | Por canal: a pessoa cola no painel o `webhookUrl` e o `verificationToken` que a tela mostra ao criar | Idem |
| Google Cloud, cliente OAuth da **Agenda** | Redirecionamento `https://my.vekoo.app/calendar/google-callback`, o mesmo de `GOOGLE_CALENDAR_REDIRECT_URI`. Calendar API ligada, escopos `calendar.app.created`, `openid` e `email` | Conectar a agenda volta com erro |
| Google Cloud, cliente do **Sheets** | Origem JavaScript `https://my.vekoo.app`, escopo `drive.file`, Picker API ligada | Importar do Sheets falha |
| Cloudflare, zona `vekoo.app` | *Network → WebSockets* ligado (é o padrão). Regra de WAF ou Bot Fight Mode não pode barrar `/inbound/*` | Sem tempo real / sem webhook |

Evolution, Z-API e LeadChat não pedem nada: a ativação do canal configura o webhook, a partir de `BACKEND_URL`.

## 8. O que conferir depois do deploy

```bash
kamal app details                              # web, worker e scripts, os três no ar
kamal accessory details all                    # db, mongodb e redis, healthy
kamal app logs -r web --since 15m | grep -E 'MONGOID: Created indexes|Puma starting|aborted'
```

| O quê | Como | Espera |
|---|---|---|
| API | `curl -s -o /dev/null -w '%{http_code}\n' https://syco.vekoo.app/up` | `200` |
| Sessão e dados | `/login` na tela, com uma conta; abrir `/dashboard`, `/chat`, `/carousels` | Telas com dados, sem erro. O dashboard usa `hint`: se ele abre, os índices estão lá |
| Índices | `kamal mongoc`, depois `db.chats.getIndexes().length` | `9` nesta versão, e não `1` |
| pgvector | `kamal dbc`, depois `SELECT extversion FROM pg_extension WHERE extname = 'vector';` | Uma versão |
| Catálogo de ferramentas | `/tools`, na tela | 8 ferramentas nesta versão, e não uma lista vazia |
| Recorrentes | `kamal accessory exec redis --reuse "redis-cli HLEN schedules"` | `15` nesta versão |
| Script de cliente | `/tools`, "testar" numa função | Resposta, e não pendente para sempre. Se ficar, o papel `scripts` caiu |
| `ffmpeg` | `kamal app exec -r worker --reuse "ffmpeg -version"` | A versão |
| WebSocket | `curl -si --http1.1 --max-time 5 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==' -H 'Origin: https://my.vekoo.app' https://syco.vekoo.app/cable \| head -1` | `101`. O menu e o chat mostram conexão ativa, sem aviso de reconectando. Com outra origem: `404` |
| Geração por IA em SSE | Gerar um carrossel: os cards entram um a um. Ou `curl -N https://syco.vekoo.app/ai/rewrite …` | Eventos pingados, e não todos no fim. Passando de 30 s, não pode cortar |
| CORS | `curl -si -H 'Origin: https://evil.com' https://syco.vekoo.app/catalog \| grep -i access-control` | Nada |
| Front publicado | Abaixo | |
| CSP | Console do navegador em `/chat`, `/settings/integrations` e tocando um áudio | Sem erro de CSP |
| Backup | `ssh deploy@107.152.37.137 'ls -lh /var/backups/vekoo'` no dia seguinte | `db-`, `mongo-` e `storage-` da noite. `/var/log/vekoo-backup.log` sem `FALHOU` |
| Memória | `ssh deploy@107.152.37.137 'docker stats --no-stream'` | Folga, e `scripts` longe de 1 GB |

**A conferência do front**, que vale fazer sempre depois de publicar. O nome do arquivo muda a cada build: se não mudou, nada foi publicado. E se o bundle não contém a URL da API, é uma versão anterior:

```bash
curl -I https://my.vekoo.app/login                 # 200: o fallback do SPA funciona
JS=$(curl -s https://my.vekoo.app/ | grep -o '/assets/index-[^"]*\.js' | head -1)
curl -s "https://my.vekoo.app$JS" | grep -c syco.vekoo.app   # tem que ser > 0
```

## 9. Operação

```bash
kamal app logs -f --grep ERROR
kamal app logs -r scripts --since 1h
kamal accessory logs mongodb
```

**Backup** noturno às 03:20, com retenção de 14 dias, em `/var/backups/vekoo`: Postgres (`db-*.pgdump`), Mongo (`mongo-*.archive.gz`) e anexos (`storage-*.tar.gz`). Cada parte falha sozinha. Mudou o script em `bin/deploy-setup`? `--backup-only`, como na seção 5. **Fica no mesmo disco:** copie para fora de vez em quando.

**Restore. Teste pelo menos uma vez em produção:** backup não testado não é backup. Os comandos abaixo foram ensaiados localmente.

```bash
# Postgres, no host
docker exec -i vekoo-api-db pg_restore -U vekoo -d vekoo_production --clean --if-exists < db-AAAAMMDD-HHMMSS.pgdump

# Mongo, no host. --drop troca as coleções pelas do arquivo, com os índices
docker exec -i vekoo-api-mongodb sh -c 'exec mongorestore --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop' < mongo-AAAAMMDD-HHMMSS.archive.gz

# Anexos, no host
docker run --rm -i -v vekoo_storage:/data alpine tar xzf - -C /data < storage-AAAAMMDD-HHMMSS.tar.gz
```

**Sintomas:**

| No log ou na tela | Causa | O que fazer |
|---|---|---|
| `[2:BadValue] ... hint provided does not correspond to an existing index` | Faltou índice | `kamal indexes` |
| `extension "vector" is not available` | Imagem do Postgres sem pgvector | Seção 5, passo 4 |
| `collation version mismatch` | Glibc diferente da que criou o banco | Seção "Trocar a imagem do Postgres" |
| `Mongo::Error::NoServerAvailable` ou `Bad URI` | Mongo fora do ar, ou `MONGODB_URI` vazia | `kamal accessory details mongodb`; `.env.deploy` |
| `Mongo::Auth::Unauthorized` | Senha da URI diferente da que criou o volume | A senha só vale na criação do volume |
| Fluxo com ferramenta parado | Papel `scripts` fora do ar | `kamal app details`; `kamal app logs -r scripts` |
| Sidekiq `OOM command not allowed` | Redis cheio (256 MB, `noeviction`) | Olhe a fila. Ela é o que não pode ser despejada |

## 10. O front: dois caminhos

Há **duas** publicações do front em jogo, e confundi-las custa um deploy que parece ter funcionado sem ter mudado nada.

**1. O Worker desta máquina — `vekoo.warleyolf.workers.dev`.** `npx wrangler deploy` daqui publica na conta **Aiva** (`17aee35bed892314b81788febc0748f0`). Funciona. Mas essa conta enxerga uma zona só, `aiva-assets.com`: `vekoo.app` **não está nela**, e declarar `my.vekoo.app` no `wrangler.jsonc` falha com *"The zone vekoo.app does not exist on your account"* (código 10083). Por isso o arquivo não declara rota.

**2. O domínio de produção — `my.vekoo.app`.** Servido por outra conta. Não há `.github/workflows` no repositório, então quem builda é a própria Cloudflare, a partir do repositório conectado no painel. **Consequência: o deploy do front é `git push`**, e só no repositório que o projeto observa.

> **Um `wrangler deploy` bem-sucedido não significa que o site mudou.** Ele publica o Worker da conta em que você está logado. Se `my.vekoo.app` é servido por outra conta, o comando imprime sucesso e o site continua igual. A conferência da seção 8 é o que pega isso.

**Se o push não disparar build**, o projeto está conectado a outro repositório (há dois remotos: `origin` → `AndreMatheus29/vekoo`, `origin2` → `warley-oliveira/vekoo`). No painel da conta dona de `vekoo.app`: *Workers & Pages* → o projeto → *Settings* → *Build*, e confira o repositório e o branch. Alternativa: apontar `my.vekoo.app` para o Worker `vekoo` desta conta (*Domains & Routes* → *Add* → *Custom domain*), e então tirar `https://vekoo.warleyolf.workers.dev` de `FRONTEND_ORIGINS` no `deploy.yml`.

**Depois da integração, `my.vekoo.app` depende de `syco.vekoo.app`:** se a API cair, a tela de entrada mostra "não conseguimos falar com o servidor" com um botão de tentar de novo.

## 11. O que ainda não existe

Não é configuração que falta: é código, ou decisão. A lista completa está em `docs/migration/DECISIONS.md`.

- **E-mail.** Nenhum mailer envia nada. `POST /password-resets` responde 202 em produção e **a pessoa não recebe o link**: "esqueci a senha" não funciona até um serviço de e-mail entrar.
- **CSP do Google Sheets.** O assistente de campanha carrega scripts do Google, e o `_headers` não os libera. Sem isso, o erro só aparece em produção. Ao integrar a frente, acrescente, depois de a revisão de segurança olhar: `script-src https://accounts.google.com https://apis.google.com`; `connect-src https://sheets.googleapis.com`; `frame-src https://accounts.google.com https://docs.google.com`.
- **Bundle embutível do widget.** A API `/widget/v1` e o `/widget-cable` estão no ar, mas o script que o cliente cola no site, em `WIDGET_BASE_URL`, não faz parte desta migração.
- **`features` da organização** (`zapi`, `sync_message_history`) só se ligam pelo console.
- **Armazenamento de anexos** é disco local, no volume: não dá para ter dois hosts da aplicação sem trocar por S3.

## 12. O que foi verificado

**Ensaiado localmente, em 07/11/2026**, sem Docker build e sem tocar no servidor: o código rodou nativo em `RAILS_ENV=production`, com o mesmo comando do `deploy.yml`, contra containers com os mesmos parâmetros dos accessories.

| Ensaio | Resultado |
|---|---|
| Entrypoint em banco vazio, com Mongo autenticado | Índices, schema, semente e `platform:sync` em 15 s; 35 coleções, 126 índices |
| O mesmo com `BUNDLE_WITHOUT=development:test`, como no Dockerfile | Boot do zero em 13 s, sem `LoadError`. Nenhuma gem de desenvolvimento faz falta em produção |
| Thruster + Puma em cluster (2 processos) | `/up` 200 com Host de IP; `/catalog` 200, e 403 com Host errado; CORS certo; rotas de todos os domínios respondem; nenhum cliente do Mongo aberto antes do fork |
| `X-Forwarded-For` como a Cloudflare manda | `remote_ip` é o cliente, em IPv4 e IPv6; escrever outro IP no cabeçalho não engana |
| Sem Mongo: URI vazia, servidor fora do ar, senha errada | Os três saem com código 1, e a porta não abre |
| Papel `scripts` | Script de cliente de verdade pela fila, em V8 sem JIT |
| Papel `worker` | Sobe e registra os 15 recorrentes |
| `/cable` pelo Thruster | 101, `welcome` e pings por 20 s, com o prazo de escrita em 8 s. Origem de fora: 404. Sem token: conexão recusada |
| SSE pelo Thruster | **Cortado em 30 s no padrão.** Inteiro com `HTTP_WRITE_TIMEOUT: 300` |
| A atualização da seção 5: banco criado pelo código do `main` em `postgres:16` (glibc 2.41) | Sem trocar a imagem: falha fechada. Trocando para `pg16-trixie`: 34 migrations sobre os dados, carrosséis intactos, a conta antiga entra, grupos padrão criados |
| Glibc | Mesma: sem aviso. `pg16` (2.36) sobre volume 2.41: o aviso acima |
| Script de backup gerado por `bin/deploy-setup` | Três arquivos; com o Mongo parado, os outros dois saem e o código é 1 |
| Restores da seção 9 | Mongo a partir do arquivo do script, com os índices; Postgres com coluna `vector` e acento; anexos com o dono preservado |
| `dashboards:backfill_operational[90]` | Roda; sem conversa, termina em 1 s |
| `kamal config` e os comandos que ele monta | Válidos, sem conectar em nada |
| `bin/setup` e `bin/dev` num diretório limpo | Do zero em 54 s, com `npm install` de verdade e as gems já instaladas. Idempotente. Os quatro processos no ar, com a semente de todos os domínios |

**Não verificado:**

- **`docker build`** desta imagem, com `ffmpeg` e a compilação do `mini_racer`. O código nunca rodou de dentro dela. Antes do primeiro deploy, com memória livre na máquina:

  ```bash
  cd backend
  docker build --platform linux/amd64 -t vekoo-api:ensaio .
  docker run --rm --entrypoint sh -e RAILS_ENV=production -e SECRET_KEY_BASE=x \
    -e DATABASE_URL=postgres://x/y -e MONGODB_URI=mongodb://x/y vekoo-api:ensaio \
    -c 'ffmpeg -version | head -1; ffprobe -version | head -1; bin/rails runner "puts MiniRacer::Context.new.eval(%q(40 + 2))"'
  ```

  Tem que imprimir as duas versões e `42`.
- **`kamal-proxy`:** nada passou por ele nesta versão, nem `buffering.responses: false` nem WebSocket. Os ensaios pararam no Thruster.
- **Cloudflare:** WebSocket e SSE atravessando, front publicado, CSP com as telas novas.
- **Provedores reais:** Meta, Evolution, Z-API, Google, OpenAI, Apify, push em navegador. Ver `docs/migration/DECISIONS.md`.
- **Produção:** o `datcollversion` do volume de verdade, e a memória sob carga.

**A versão só de carrosséis, em produção desde 25/08/2026:** `ghcr.io/warley-oliveira/vekoo-api:329c216`, com `/up`, `/catalog`, login, carrosséis, CORS e Sidekiq conferidos de fora, pela Cloudflare. O restore do backup nunca foi testado lá.

## 13. Armadilhas específicas deste setup

- **`kamal app exec` sem `--interactive` roda uma vez por papel, ao mesmo tempo.** São três papéis: `kamal app exec --reuse "bin/rails db:seed"` roda a semente três vezes. Sempre `-r web`, que é o que os aliases do `deploy.yml` já fazem.
- **`kamal redeploy` não pula o build:** só com `-P`. Para reiniciar com a mesma imagem, `kamal app boot`.
- **`kamal proxy reboot` derruba todos os apps do host.** O proxy é global. E **uma única versão da gem `kamal`** para tudo que roda neste host.
- **Nenhum accessory pode ter `port:`.** O Docker escreve na chain `DOCKER-USER` do iptables e **ignora o UFW**: um `port: 5432` ou `27017` exporia o banco à internet mesmo com o firewall fechado. Para acessar de fora, túnel SSH.
- **`vekoo_storage` é volume nomeado, nunca bind mount.** Um volume nomeado nasce com o dono do diretório da imagem (`1000:1000`); um bind mount nasce `root:root` e o primeiro upload morre com `EACCES`.
- **`RAILS_MAX_THREADS` tem que ser ≥ `:concurrency` do arquivo do Sidekiq:** 6 contra 5 no `worker`, 3 contra 2 no `scripts`. Senão, `ConnectionTimeoutError` intermitente.
- **`max_response_body: 0` não desliga o buffer de resposta do proxy**, só tira o teto. Quem desliga é `buffering.responses: false`.
- **O Thruster tem prazo próprio:** `HTTP_WRITE_TIMEOUT`, 30 s por padrão, corta a resposta sem aviso, por menor que seja o `response_timeout` do proxy. Por isso os 300 s no `deploy.yml`. WebSocket não sente: ele deixa de ser resposta no upgrade.
- **Imagem do Postgres fixada no major e na distro.** Major novo se recusa a subir sobre um `PGDATA` existente, e distro nova muda a glibc.
- **`entrypoint` só no `web`, e `docker exec` passa por fora dele.** Um `kamal app exec --reuse` não cria índice nem aplica migration.
- **O builder do buildx guarda mount de distro WSL que já morreu.** O Kamal cria um builder `docker-container` chamado `kamal-local-docker-container` e o reaproveita. Se o Docker Desktop foi reinstalado ou a distro WSL trocou de nome, o build morre em `booting buildkit` com *"bind source path does not exist: /run/desktop/mnt/host/wsl/..."*. Não é erro de rede nem de Dockerfile: `docker buildx rm kamal-local-docker-container`, e o Kamal recria.
- **`kamal deploy | tail` esconde a falha.** O código de saída que o shell reporta é o do `tail`. Redirecione para arquivo e cheque o `$?` do próprio `kamal`.
- **O Kamal builda a partir de um CLONE do git, não do working directory.** O que não estiver commitado não existe no build, e o sintoma é `failed to read dockerfile: no such file or directory` com o arquivo ali na sua frente. `kamal deploy` sempre depois do commit.
- **O front builda a partir do GitHub.** Commit sem `git push` sobe a API e deixa o front parado na versão anterior.
- **Em Workers, `_redirects` com `/* /index.html 200` faz o deploy FALHAR.** A validação recusa com *"Infinite loop detected in this rule"*, e só depois de já ter subido os assets, o que parece erro de rede. O fallback do SPA vem de `not_found_handling` no `wrangler.jsonc`. **`_headers` funciona**, e sem a armadilha de herança do `add_header` do nginx: as regras se acumulam.
- **Modo SSL da Cloudflare importa muito.** Com *Flexible* a Cloudflare fala HTTP com a origem, o `kamal-proxy` redireciona para HTTPS e o resultado é um loop de redirect. Com *Full (strict)* o autoassinado é recusado e o site cai em **526**.
- **`fail2ban` derruba o deploy.** Um deploy abre muitas conexões SSH, e com `maxretry = 5` a máquina de deploy cai no jail no meio do processo, depois de a imagem já estar no registry: `Connection reset by peer`. `bin/deploy-setup` põe o IP de quem o roda em `ignoreip`. De outra máquina ou com IP dinâmico, acontece de novo, e a queda deixa o lock preso: `kamal lock release`.
- **O `00-` em `sshd_config.d/00-hardening.conf` não é estética.** No OpenSSH vale a *primeira* ocorrência, e a imagem traz `50-cloud-init.conf` com `PasswordAuthentication yes`.
