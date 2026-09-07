# Deploy — Vekoo

| | |
|---|---|
| **Front** (`my.vekoo.app`) | Cloudflare **Workers** (assets estáticos) — build do Vite no CI da Cloudflare |
| **API** (`syco.vekoo.app`) | Kamal 2 numa VPS própria — `107.152.37.137` |
| **TLS** | Certificado autoassinado na origem + zona em **Full**. Sem Let's Encrypt, sem certbot, sem credencial da Cloudflare |
| **Registry** | `ghcr.io/warley-oliveira` — exige PAT **classic** |

---

## 1. Por que este desenho difere do guia genérico

O guia `deploy-kamal.md` assume DNS apontando direto para o IP, com o
`kamal-proxy` emitindo Let's Encrypt via ACME HTTP-01. **Aqui os domínios estão
atrás do proxy da Cloudflare** (nuvem laranja — confirmado: `my.vekoo.app` e
`syco.vekoo.app` resolvem para `2606:4700::/32`). Isso muda três coisas:

1. **ACME HTTP-01 não fecha de forma confiável.** O desafio chega na porta 80 da
   Cloudflare, não no seu servidor; com *Always Use HTTPS* ligado ele vira
   redirect e a validação falha. A solução não é desligar o proxy — é servir um
   certificado próprio no `kamal-proxy`, que o Kamal 2.12 suporta nativamente.
   Na fase de validação esse certificado é **autoassinado** (já gerado, ver
   Passo 2), com a zona em **Full**.
2. **O front não precisa de servidor.** Sendo um SPA estático, o Cloudflare Pages
   entrega melhor que um container nginx na VPS: CDN global, deploy atômico,
   preview por branch, zero RAM da VPS. O `Dockerfile`/`nginx.conf` do front do
   guia ficam sem uso.
3. **80/443 podem ser fechados para o mundo.** Como todo tráfego legítimo vem da
   Cloudflare, o firewall só libera as faixas dela. Isso também impede que
   alguém descubra o IP de origem e contorne o WAF.

---

## 2. O que já está no repositório

```
backend/
  Dockerfile                    multi-stage; SEM assets:precompile (API-only)
  .dockerignore
  bin/docker-entrypoint         db:prepare antes do Thruster abrir a porta 80
  config/deploy.yml             API + worker Sidekiq + accessories db/redis
  .kamal/secrets                só referências a env vars — versionável
  .kamal/certs/                 o PEM da Cloudflare entra aqui (gitignorado)
frontend/
  public/_redirects             fallback do SPA (BrowserRouter)
  public/_headers               cache + segurança + CSP
bin/deploy-setup                provisionamento idempotente do host
.env.deploy                     segredos, JÁ GERADO, gitignorado
.env.deploy.example             referência versionada
```

Hardening aplicado ao Rails (`backend/config/`):

| Arquivo | Mudança | Por quê |
|---|---|---|
| `environments/production.rb` | `config.hosts` via `APP_HOSTS` **e** `/up` excluído | Sem a exclusão o healthcheck toma 403 e **todo deploy faz rollback** |
| `environments/production.rb` | `cache_store = :redis_cache_store` (banco 2) | O cache guarda estado **compartilhado** — a trava de geração e os contadores de tentativa. `memory_store` é por processo, e com `WEB_CONCURRENCY: 2` protegeria metade do servidor |
| `environments/production.rb` | mailer/`default_url_options` de `BACKEND_URL` | URLs absolutas de anexo apontariam para `example.com` |
| `initializers/cors.rb` | `FRONTEND_ORIGINS` explícito | `origins '*'` deixa qualquer site dirigir a API pelo navegador de quem está logado |
| `puma.rb` | `workers` declarado | O arquivo stock não declara — `WEB_CONCURRENCY` não fazia nada |
| `cable.yml` | `CABLE_REDIS_URL` própria | Senão o pub/sub do cable vai parar no banco 0, o da fila |

---

## 3. Antes de começar

Local (já feito): `kamal 2.12.0`, Docker + buildx, chave `~/.ssh/vekoo_deploy`.

Chave pública de deploy:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAEhtUWRx4c1P6mdpVgWc2kpbIX57eerT05u/9j8QPrG vekoo-deploy
```

Falta preencher **um** valor em `.env.deploy`: o `KAMAL_REGISTRY_PASSWORD`.

---

## 4. Passo a passo

### Passo 1 — GHCR: token do registry  ✅ feito

1. `github.com/settings/tokens` → **Generate new token (classic)**
2. Escopos: `write:packages` e `read:packages`
3. Cole em `.env.deploy` na linha `KAMAL_REGISTRY_PASSWORD=`

> **Classic, não fine-grained — verificado na prática.** Um token `github_pat_*`
> faz `docker login` com sucesso e falha no push com
> `permission_denied: The token provided does not match expected scopes`.
> O login passar não significa nada.

O `REGISTRY_USER` é **`warley-oliveira`** (dono do token), que não precisa
coincidir com o dono do repositório — a imagem vai para
`ghcr.io/warley-oliveira/vekoo-api`.

### Passo 2 — TLS da origem  ✅ feito

**Já feito.** O certificado autoassinado está gerado, com par conferido e handshake
TLS testado:

```
backend/.kamal/certs/syco.vekoo.app.pem    CN=syco.vekoo.app, válido até 2036
backend/.kamal/certs/syco.vekoo.app.key    chmod 600
```

Falta só um ajuste na zona, que não envolve credencial nem geração de certificado:

1. Cloudflare → zona **vekoo.app** → **SSL/TLS → Overview** → modo **Full**
2. **SSL/TLS → Edge Certificates** → *Always Use HTTPS*: **On**

> **Full, não Full (strict).** *Strict* valida a cadeia do certificado da origem e
> recusaria um autoassinado — o site cairia em erro 526. *Full* cifra o salto
> Cloudflare↔origem sem validar a cadeia.

**O que isso custa.** O tráfego entre a Cloudflare e a VPS vai cifrado, mas sem
autenticação da origem: um atacante já posicionado nesse caminho poderia se passar
pelo servidor sem ser detectado. Na prática o risco é baixo — o UFW só aceita 80/443
das faixas da Cloudflare — e é adequado para a fase de validação. Não é o que se leva
para produção com dados reais de clientes.

**Como promover depois, quando quiser.** Gere um **Origin Certificate** em
*SSL/TLS → Origin Server → Create Certificate* (RSA 2048, hostname
`syco.vekoo.app`, 15 anos), sobrescreva os **mesmos dois arquivos**, mude a zona
para **Full (strict)** e rode `kamal deploy`. Nenhuma linha de configuração muda —
o `deploy.yml` já aponta para esses caminhos.

### Passo 3 — DNS  ✅ feito

Em **DNS → Records** da zona `vekoo.app`:

| Nome | Tipo | Conteúdo | Proxy |
|---|---|---|---|
| `syco` | A | `107.152.37.137` | Proxied (laranja) |
| `my` | — | criado sozinho no Passo 6 | Proxied |

Se já existir um registro `my` apontando para outro lugar, **apague** — o
Cloudflare Pages cria o dele no Passo 6.

### Passo 4 — Provisionar o servidor  ✅ feito

```bash
ssh root@107.152.37.137 \
  "bash -s -- $(base64 -w0 ~/.ssh/vekoo_deploy.pub)" < bin/deploy-setup
```

Host: **Ubuntu 26.04 LTS** (`resolute`), 4 vCPU, 3.8 GB RAM, 96 GB.
Docker CE 29.7.2 + buildx, usuário `deploy` no grupo `docker`, 2 GB de swap,
rotação de log do Docker, fail2ban, backup noturno às 03:20 com retenção de 14
dias, e autenticação por senha desligada.

> **A chave vai em base64** porque o `ssh` junta os argumentos numa string única
> sem re-aspá-los; passada crua, o shell remoto a quebra nos espaços.

> **O `00-` no nome do arquivo de hardening não é estética.** Esta imagem traz
> `50-cloud-init.conf` com `PasswordAuthentication yes` **e**
> `60-cloudimg-settings.conf` com `no`. No OpenSSH vale a *primeira* ocorrência,
> então o `50` vencia e a senha continuava funcionando — exatamente como
> encontramos o servidor.

#### O firewall: por que o UFW sozinho não bastava

A versão anterior deste script restringia 80/443 no UFW. **Não teria funcionado.**
O `kamal-proxy` publica 80/443 como portas de container: o Docker faz DNAT em
`PREROUTING` e o pacote segue pelo `FORWARD`, atravessando a chain `DOCKER-USER`
— nunca o `INPUT`, que é onde o UFW atua.

A correção é uma chain própria enganchada em `DOCKER-USER`, aplicada por unidade
systemd que roda junto com o Docker (que recria `DOCKER-USER` a cada restart),
com timer semanal para atualizar as faixas:

```
-A DOCKER-USER -j VEKOO-CF
-A VEKOO-CF -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A VEKOO-CF -s 173.245.48.0/20 -i eth0 -p tcp -m multiport --dports 80,443 -j RETURN
   … 15 faixas IPv4 + IPv6 …
-A VEKOO-CF -i eth0 -p tcp -m multiport --dports 80,443 -j DROP
```

> **O `-i eth0` é o detalhe que salva o site.** Um DROP genérico em
> `--dports 80,443` mataria também o tráfego do `kamal-proxy` para o container da
> API, que igualmente escuta na 80. Casando só a interface externa, o tráfego
> entre containers passa por uma bridge do Docker e nunca encosta na regra.

Comprovado no servidor:

| Teste | Resultado |
|---|---|
| `curl` da máquina de deploy (IP não-Cloudflare) | timeout — **bloqueado** |
| `curl` do próprio servidor em `127.0.0.1` | 200 |
| container → container na porta 80 | 200 |

### Passo 5 — Primeiro deploy da API  ✅ feito

```bash
set -a; . ./.env.deploy; set +a
cd backend

kamal setup          # só na primeira vez: accessories + proxy + deploy
```

`db:prepare` roda no entrypoint, antes do Thruster abrir a porta — então
migrations já estão aplicadas quando o healthcheck passa. Não existe a janela de
500 entre "código novo" e "tabela ainda não criada".

Num banco vazio o `db:prepare` **já roda o seed sozinho** (verificado em smoke
test: 12 carrosséis ativos + 2 na lixeira, 84 cards, a conta de demonstração).
Só rode `kamal seed` explicitamente se quiser re-semear — é idempotente.

Conferir:

```bash
kamal app logs -f
kamal proxy logs
curl -s https://syco.vekoo.app/up          # espera 200
curl -si https://syco.vekoo.app/catalog | head -20
```

### Passo 6 — Cloudflare Pages (front)

**6.1 — Criar o projeto**

1. Dashboard → **Workers & Pages** → **Create** → aba **Pages** → **Connect to Git**
2. Autorize o GitHub e escolha o repositório `AndreMatheus29/vekoo`
3. Branch de produção: `main`

**6.2 — Build settings**

| Campo | Valor |
|---|---|
| Framework preset | `Vite` (ou `None`) |
| Build command | `npm run build` |
| Build output directory | `dist` |
| **Root directory** | `frontend` |

O **Root directory** é o campo que quebra o build se esquecido — é um monorepo, e
sem ele a Cloudflare procura o `package.json` na raiz.

**6.3 — Variáveis de ambiente** (*Settings → Environment variables → Production*)

| Nome | Valor |
|---|---|
| `VITE_API_URL` | `https://syco.vekoo.app` |
| `NODE_VERSION` | `22` |

`VITE_*` é **inlinada em build time** — mudar o valor exige um novo build, não
basta reiniciar. Verificado neste repositório: a variável vinda só do ambiente
(sem `.env` no repo, que é o caso da Cloudflare) é lida corretamente pelo Vite
apesar do `envDir: '..'` do `vite.config.ts`.

**6.4 — Domínio custom**

*Custom domains* → **Set up a domain** → `my.vekoo.app` → **Activate**.
A Cloudflare cria o CNAME proxied sozinha e emite o certificado de edge.

**6.5 — Conferir**

```bash
curl -I https://my.vekoo.app/login          # 200, não 404 -> _redirects funcionando
curl -I https://my.vekoo.app/assets/index-*.js | grep -i cache-control
```

Uma rota de cliente como `/login` devolvendo **404** significa que o
`public/_redirects` não foi para o `dist` — é o erro clássico do SPA no Pages.

---

## 5. Deploy do dia a dia

```bash
set -a; . ./.env.deploy; set +a
```

| Situação | Comando |
|---|---|
| Front mudou | `git push` — a Cloudflare builda e publica sozinha |
| Back mudou | `cd backend && kamal deploy` |
| Só reiniciar a API | `cd backend && kamal redeploy` (pula o build) |
| Voltar atrás (API) | `cd backend && kamal rollback` |
| Voltar atrás (front) | Pages → *Deployments* → **Rollback** no deploy anterior |
| Console do Rails | `cd backend && kamal console` |
| psql | `cd backend && kamal dbc` |

`kamal deploy` builda e sobe. `kamal redeploy` **pula o build** — só serve para
reiniciar com a mesma imagem.

---

## 6. Operação

```bash
kamal app logs -f --grep ERROR
kamal accessory logs db
kamal app details
```

Backup (já no cron do host, `/usr/local/bin/vekoo-backup`):

```bash
ssh deploy@107.152.37.137 'ls -lh /var/backups/vekoo'
```

Restore — **teste pelo menos uma vez**, backup não testado não é backup:

```bash
scp deploy@107.152.37.137:/var/backups/vekoo/db-AAAAMMDD-HHMMSS.pgdump .
pg_restore -d "postgres://..." --clean --if-exists db-AAAAMMDD-HHMMSS.pgdump
```

---

## 7. Armadilhas específicas deste setup

- **`kamal proxy reboot` derruba todos os apps do host.** O proxy é global.
- **Uma única versão da gem `kamal`** para tudo que roda neste host.
- **Nenhum accessory pode ter `port:`.** O Docker escreve na chain `DOCKER-USER`
  do iptables e **ignora o UFW**: um `port: 5432` exporia o Postgres à internet
  mesmo com o firewall fechado.
- **`vekoo_storage` é volume nomeado, nunca bind mount.** Um volume nomeado nasce
  com o dono do diretório da imagem (`1000:1000`); um bind mount nasce
  `root:root` e o primeiro upload morre com `EACCES`.
- **`RAILS_MAX_THREADS` do worker (6) tem que ser ≥ `:concurrency` do
  `config/sidekiq.yml` (5)**, senão os jobs travam com `ConnectionTimeoutError`
  intermitente.
- **Postgres fixado em `16.10`.** Um bump de major se recusa a subir sobre um
  `PGDATA` existente.
- **O builder do buildx guarda mount de distro WSL que já morreu.** O Kamal cria
  um builder `docker-container` chamado `kamal-local-docker-container` e o
  reaproveita entre deploys. Se o Docker Desktop foi reinstalado ou a distro WSL
  trocou de nome, o builder guardado aponta para um bind mount que não existe
  mais e o build morre em `booting buildkit` com *"bind source path does not
  exist: /run/desktop/mnt/host/wsl/docker-desktop-bind-mounts/Ubuntu-22.04/…"*.
  Não é erro de rede nem de Dockerfile. A saída é recriar o builder:

  ```bash
  docker buildx rm kamal-local-docker-container   # o Kamal recria no próximo deploy
  ```

- **`kamal deploy | tail` esconde a falha.** O código de saída que o shell
  reporta é o do `tail`, não o do Kamal — um deploy que falhou sai com 0 e
  parece sucesso. Redirecione para arquivo e cheque o `$?` do próprio `kamal`.

- **O Kamal builda a partir de um CLONE do git, não do working directory.** O
  que não estiver commitado simplesmente não existe no contexto de build — o
  sintoma é `failed to read dockerfile: no such file or directory` mesmo com o
  arquivo ali na sua frente. `kamal deploy` sempre depois do commit. (Existe
  `builder.context: .` para buildar do diretório local, mas isso publica código
  que não está em lugar nenhum — sem rollback e sem reprodutibilidade.)
- **O Cloudflare Pages builda a partir do GitHub.** Commit sem `git push` sobe a
  API e deixa o front parado na versão anterior.
- **Em Workers, `_redirects` com `/* /index.html 200` faz o deploy FALHAR.** Não é
  ignorado como se poderia supor: a validação recusa com
  *"Infinite loop detected in this rule"* — e só depois de já ter subido os
  assets, o que faz parecer erro de rede. O fallback do SPA em Workers vem de
  `not_found_handling: "single-page-application"` no `wrangler.jsonc`. Aquela
  regra é de Pages; se algum dia voltar para lá, recrie o arquivo.
- **`_headers` funciona nos dois** (Pages e Workers), e sem a armadilha de herança
  do `add_header` do nginx: ali as regras se acumulam.
- **Modo SSL da Cloudflare importa muito.** Com *Flexible* a Cloudflare fala HTTP
  com a origem, o `kamal-proxy` redireciona para HTTPS e o resultado é um loop de
  redirect. Com *Full (strict)* o certificado autoassinado é recusado e o site cai
  em **526**. Enquanto o certificado for autoassinado, tem que ser **Full**.
- **Trocar `VITE_API_URL` exige rebuild do Pages**, não só salvar a variável.

---

## 8. Estado da integração

O front **consome a API**. `lib/auth.tsx` fala com `/login`, `/signup`, `/me` e
`/password-resets`; a biblioteca, as pastas, a lixeira, o editor, os créditos e
os avisos passam por hooks SWR sobre `lib/api.ts`; o acervo vem de `/catalog`; a
geração por IA e o upload de imagem vão para o servidor. `lib/store.tsx` e
`lib/mock-data.ts` não existem mais.

Consequência prática para o deploy: **`my.vekoo.app` agora depende de
`syco.vekoo.app`**. Antes os dois lados eram independentes e o front funcionava
sozinho com dados fictícios; agora, se a API cair, a tela de entrada mostra
"não conseguimos falar com o servidor" com um botão de tentar de novo — e não
uma biblioteca vazia.

`VITE_API_URL` continua sendo a única configuração que liga um lado ao outro, e
ela já estava no lugar.

### ⚠️ O front: dois caminhos, e o que sabemos de cada um

Há **duas** publicações do front em jogo, e confundi-las custa um deploy que
parece ter funcionado sem ter mudado nada.

**1. O Worker desta máquina — `vekoo.warleyolf.workers.dev`.**
`npx wrangler deploy` daqui publica na conta **Aiva**
(`17aee35bed892314b81788febc0748f0`, `warleyolf@gmail.com`). Funciona, e é onde a
versão mais recente do front está viva. Mas essa conta enxerga **uma** zona,
`aiva-assets.com` — a zona `vekoo.app` **não está nela**. Declarar
`routes: [{ pattern: "my.vekoo.app", custom_domain: true }]` no
`wrangler.jsonc` falha com *"The zone vekoo.app does not exist on your account"*
(código 10083). Por isso o arquivo não declara rota.

**2. O domínio de produção — `my.vekoo.app`.** Servido por outra conta. Não há
`.github/workflows` no repositório, então quem builda é a própria Cloudflare a
partir do repositório conectado no painel (era assim que o Passo 6 foi montado).
**Consequência: o deploy do front é `git push`**, e ele só acontece no
repositório que o projeto observa.

> **Um `wrangler deploy` bem-sucedido não significa que o site mudou.** Ele
> publica o Worker da conta em que você está logado. Se `my.vekoo.app` é servido
> por outra conta, o comando imprime sucesso e o site continua igual.

**A conferência que pega isso**, e que vale fazer sempre depois de publicar:

```bash
JS=$(curl -s https://my.vekoo.app/ | grep -o '/assets/index-[^"]*\.js' | head -1)
curl -s "https://my.vekoo.app$JS" | grep -c syco.vekoo.app   # tem que ser > 0
```

O nome do arquivo muda a cada build; se ele **não** mudou, nada foi publicado.
E se o bundle não contém a URL da API, é uma versão anterior ao rewire — antes
dele nenhuma tela importava `lib/api.ts`, e o rolldown removia a URL por
tree-shaking.

**Se o push não disparar build**, o projeto está conectado a outro repositório
(há dois remotos: `origin` → `AndreMatheus29/vekoo`, `origin2` →
`warley-oliveira/vekoo`). No painel da conta dona de `vekoo.app`:
*Workers & Pages* → o projeto → *Settings* → *Build* → confira o repositório e o
branch. Alternativa: apontar `my.vekoo.app` para o Worker `vekoo` desta conta
(*Domains & Routes* → *Add* → *Custom domain*) — e então tirar
`https://vekoo.warleyolf.workers.dev` de `FRONTEND_ORIGINS` no `deploy.yml`,
porque a URL de preview não precisa continuar liberada em produção.

### Variáveis que entraram depois do primeiro deploy

| Nome | Onde | Para quê |
|---|---|---|
| `ANTHROPIC_API_KEY` | `env.secret` do `deploy.yml` + `.env.deploy` | Geração por IA. **Sem ela os endpoints `/ai/*` respondem `failed` com log claro e não cobram crédito** — o resto do produto segue funcionando |
| `CACHE_REDIS_URL` | `env.clear` do `deploy.yml` | `Rails.cache` (banco 2; 0 é a fila do Sidekiq, 1 o pub/sub do ActionCable) |

### `response_timeout` do proxy subiu para 300s

A geração por IA responde em **SSE**, e um carrossel leva de 5 a 30 segundos. Os
60s originais cortariam a conexão no meio. O `event: start` sai imediatamente,
então o tempo até o primeiro byte continua baixo; o teto precisa caber é na
geração inteira.

> **Buffering é o risco a vigiar aqui.** Entre o Puma e o navegador há Thruster,
> `kamal-proxy` e Cloudflare. `buffering.max_response_body: 0` (já configurado)
> desliga o buffer de resposta do proxy, e a API manda `X-Accel-Buffering: no`.
> Se algum dia os eventos chegarem todos de uma vez no fim, o teste é
> `curl -N https://syco.vekoo.app/ai/rewrite …` — os eventos têm que sair
> pingados. O plano B é `app_port: 3000` no `deploy.yml` com
> `CMD ["./bin/rails","server"]` no Dockerfile, tirando o Thruster do caminho.

### Active Storage

As tabelas `active_storage_*` entraram em UUID, como o resto do banco
(`config.generators` com `primary_key_type: :uuid`). O volume `vekoo_storage` já
existia desde o primeiro deploy, então **os anexos sobrevivem a deploy** — mas
ele precisa entrar no backup, que hoje só leva o Postgres.

## 9. Checklist do primeiro deploy

- [x] `KAMAL_REGISTRY_PASSWORD` — PAT **classic** em `.env.deploy`
- [x] Certificado da origem em `backend/.kamal/certs/` (`.pem` **e** `.key`) — gerado
- [x] Zona `vekoo.app` em **Full** (não strict)
- [x] `syco` → A `107.152.37.137`, proxied
- [x] `bin/deploy-setup` rodado; login como `deploy` confirmado
- [x] `kamal setup`
- [x] `curl https://syco.vekoo.app/up` → 200
- [x] Front no Cloudflare **Workers** (Worker somente-assets; ver `frontend/wrangler.jsonc`)
- [x] `VITE_API_URL` e `NODE_VERSION` nas env vars de Production
- [x] `my.vekoo.app` ativo; `curl -I https://my.vekoo.app/login` → 200
- [ ] Restore de backup testado uma vez

---

## 10. API em produção — verificado em 25/08/2026

`https://syco.vekoo.app` está no ar. Imagem
`ghcr.io/warley-oliveira/vekoo-api:329c216`, cinco containers no host
(`kamal-proxy`, `vekoo-api-db`, `vekoo-api-redis`, `vekoo-api-web`,
`vekoo-api-worker`).

| Teste (pela Cloudflare, de fora) | Resultado |
|---|---|
| `GET /up` | 200 |
| `GET /catalog` | JSON com formatos e presets de tema |
| `POST /login` (conta de demonstração) | 201, devolve conta + organização + token |
| `GET /carousels` com Bearer | 12 carrosséis, títulos em pt-BR |
| `GET /me` | conta e organização corretas |
| CORS de `https://my.vekoo.app` | header presente |
| CORS de `https://evil.com` | header ausente — bloqueado |
| Banco | 14 carrosséis, 1 conta, 1 organização, 3 avisos |
| Sidekiq | conectado a `redis://vekoo-api-redis:6379/0` |

O JSON sai em camelCase com datas em milissegundos
(`createdAt: 1785088679359`) — a mesma forma dos tipos do front.

### Armadilha encontrada no caminho: fail2ban derrubando o deploy

O primeiro `kamal setup` fez o build (813 s) e o push, e **então** morreu com
`Connection reset by peer`. Não era rede: um deploy abre muitas conexões SSH e,
com `maxretry = 5`, a máquina de deploy trip o jail `sshd` no meio do processo —
depois de a imagem já estar no registry, o que torna o sintoma confuso.

O `bin/deploy-setup` agora resolve isso sozinho: lê `SSH_CLIENT` para descobrir
o IP de quem está rodando o script e o coloca em `ignoreip`.

Se acontecer de novo (IP dinâmico, outra máquina de deploy):

```bash
kamal lock release          # a queda deixa o lock preso
```

## 11. O que já foi verificado localmente

Antes de qualquer coisa tocar o servidor, isto foi testado nesta máquina:

| Verificação | Resultado |
|---|---|
| `docker build` da API | passa |
| Boot em `RAILS_ENV=production` contra Postgres 16.10 | Puma cluster, 2 workers, `/up` → 200 |
| `db:prepare` no entrypoint | cria o schema **e** semeia (84 cards) |
| `/up` com `Host:` de IP (como o kamal-proxy sonda) | **200** — o deploy não vai fazer rollback |
| `/catalog` com `Host: evil.com` | **403** — `config.hosts` ativo |
| CORS de `https://my.vekoo.app` | `Access-Control-Allow-Origin` presente |
| CORS de `https://evil.com` | header ausente — bloqueado no navegador |
| `kamal config` | válido; repositório `ghcr.io/andrematheus29/vekoo-api` |
| Build de produção do front | passa (`tsc -b && vite build`) |
| `VITE_API_URL` só via ambiente (sem `.env`) | inlinada no bundle apesar do `envDir: '..'` |
| Tag `postgres:16.10` e `PGDATA` em subdiretório | existem e funcionam |
| Par certificado/chave da origem | módulos conferem; handshake TLS real ok |
| Kamal resolvendo os PEMs de `.kamal/secrets` | 1288 e 1703 bytes lidos corretamente |
