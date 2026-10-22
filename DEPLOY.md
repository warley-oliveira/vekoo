# Deploy — Vekoo

Três peças, três comandos. Tudo roda **desta máquina de deploy** (WSL2), sem CI.

| Peça | Endereço | Onde roda | Como sobe |
|---|---|---|---|
| **API** (Rails + Sidekiq + Postgres + Redis) | `https://syco.vekoo.app` (Cloudflare, proxied) · `https://api.107-152-37-59.sslip.io` (direto na origem) | VPS `107.152.37.59` (Ubuntu 24.04, 4 vCPU, 3.8 GB) via **Kamal 2.12** | `cd backend && kamal deploy` |
| **App** (SPA Vite) | `https://my.vekoo.app` · `https://vekoo.vekoo.workers.dev` | Cloudflare Worker **`vekoo`** (só assets) | `npm run build` + `npx wrangler deploy` em `frontend/` |
| **Landing** | `https://vekoo.app` · `https://www.vekoo.app` | Cloudflare Worker **`vekoo-landing`** (só assets) | `npx wrangler deploy` em `landingpage/` |

Conta Cloudflare: **Vekoo** (`a76c0b58ff582e69f16c77412e749f1f`), dona da zona `vekoo.app`.
Servidor montado do zero em 21/10/2026. O servidor antigo (`107.152.37.137`) não existe mais.

---

## 1. Pré-requisitos na máquina de deploy

| Item | Onde | Observação |
|---|---|---|
| `kamal 2.12.0` | gem do Ruby do mise | `kamal version` |
| Docker + buildx | local | o Kamal builda aqui e envia a imagem por túnel SSH |
| Chave SSH | `~/.ssh/vekoo_deploy` | autorizada para o usuário `deploy` do servidor. **Sem ela não há acesso: o servidor não aceita senha** |
| Segredos | `.env.deploy` na raiz (gitignorado, `chmod 600`) | ver abaixo |
| Login Cloudflare | `npx wrangler login` (conta **Vekoo**) | conferir com `npx wrangler whoami` |

`.env.deploy` contém exatamente:

```bash
RAILS_MASTER_KEY=      # = backend/config/master.key
SECRET_KEY_BASE=       # openssl rand -hex 64
POSTGRES_PASSWORD=     # openssl rand -hex 24
DATABASE_URL=postgres://vekoo:<POSTGRES_PASSWORD>@vekoo-api-db:5432/vekoo_production
ANTHROPIC_API_KEY=     # agente (criação por conversa e onboarding)
```

> **Não regere `POSTGRES_PASSWORD` com o banco já criado.** O Postgres só lê essa
> variável na primeira inicialização do volume; trocar depois faz a API perder o
> acesso ao banco.

Não existe registry externo: `registry.server: localhost:5555` é o **registry local
do Kamal**, que sobe um container `registry` aqui e expõe para o servidor por túnel
SSH. Não há GHCR nem token.

---

## 2. Back-end (API)

```bash
cd ~/projects/vekoo_trimit
git commit ...                      # OBRIGATÓRIO antes — ver armadilha abaixo
set -a; . ./.env.deploy; set +a
cd backend && kamal deploy > /tmp/kamal.log 2>&1; echo "exit=$?"; tail -3 /tmp/kamal.log
```

- **O Kamal builda a partir de um CLONE do git, não do working directory.** O que não
  está commitado não vai para produção, sem nenhum aviso. Commit primeiro; push não é
  necessário, porque o clone é local.
- **Não use `kamal deploy | tail`.** O código de saída vira o do `tail` e um deploy
  que falhou parece sucesso.
- `db:prepare` roda no entrypoint do container web antes de a porta abrir: as
  migrations aplicam sozinhas e o healthcheck só passa com o schema no lugar. Num
  banco vazio ele também roda o seed.
- Um deploy leva de 1 a 2 minutos com cache. O primeiro `kamal setup` levou cerca de 4 minutos.

Conferir:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://syco.vekoo.app/up       # 200
curl -s -X POST https://syco.vekoo.app/login -H 'Content-Type: application/json' \
  -d '{"session":{"email":"marina.duarte@exemplo.com.br","password":"carrossel123"}}' \
  -o /dev/null -w '%{http_code}\n'                                     # 201
```

| Situação | Comando (em `backend/`, com `.env.deploy` carregado) |
|---|---|
| Só reiniciar (mesma imagem) | `kamal app boot` |
| Voltar atrás | `kamal rollback <versão>` (versões: `kamal app containers`) |
| Logs | `kamal app logs -f` · `kamal app logs -r worker` · `kamal proxy logs` |
| Console Rails / shell | `kamal console` · `kamal shell` |
| psql | `kamal dbc` |
| Rodar seed de novo (idempotente) | `kamal seed` |
| Lock preso após queda | `kamal lock release` |

Containers no host: `kamal-proxy`, `vekoo-api-web-<sha>`, `vekoo-api-worker-<sha>`,
`vekoo-api-db` (Postgres 16.10), `vekoo-api-redis` (Redis 7.4, AOF ligado).
Volumes nomeados: `vekoo_pgdata`, `vekoo_redis`, `vekoo_storage` (uploads do Active Storage).

Acesso direto: `ssh -i ~/.ssh/vekoo_deploy deploy@107.152.37.59` (o usuário
`deploy` está no grupo `docker`, sem sudo).

### TLS

O kamal-proxy emite **Let's Encrypt** para os dois hosts (`syco.vekoo.app` e o
sslip.io) e renova sozinho. Para `syco` funcionar atrás da Cloudflare, o desafio
HTTP-01 precisa chegar na porta 80 da origem:

> ⚠️ **Nunca ligue *Always Use HTTPS* na zona `vekoo.app`.** Com ele ligado, o
> desafio vira redirect, a renovação falha em ~90 dias e a API passa a dar **525**.
> Modo SSL da zona: **Full** ou **Full (strict)**, os dois funcionam (o
> certificado é válido).

---

## 3. Front-end (app)

```bash
cd ~/projects/vekoo_trimit/frontend
rm -rf dist && VITE_API_URL=https://syco.vekoo.app npm run build
npx wrangler deploy                     # Worker "vekoo"
```

- **`VITE_API_URL` tem que ir na linha de comando.** O `vite.config.ts` lê o `.env`
  da raiz (`envDir: '..'`), que aponta para `http://localhost:3010`. A variável do
  processo vence o `.env`, mas, se for esquecida, o build sai apontando para localhost.
- O SPA fallback vem de `not_found_handling` no `frontend/wrangler.jsonc`. **Não**
  crie `public/_redirects` com `/* /index.html 200`: em Workers isso **derruba** o
  deploy ("Infinite loop detected").
- `my.vekoo.app` está ligado ao Worker `vekoo` pelo painel da Cloudflare, e não pelo
  `wrangler.jsonc`.
- O deploy é **manual**: não há build automático por `git push`.

Conferir que o bundle no ar é o novo e aponta para a API:

```bash
JS=$(curl -s https://my.vekoo.app/ | grep -o '/assets/index-[^"]*\.js' | head -1)
curl -s "https://my.vekoo.app$JS" | grep -c syco.vekoo.app     # > 0
```

---

## 4. Landing page

```bash
cd ~/projects/vekoo_trimit/landingpage
npx wrangler deploy                     # Worker "vekoo-landing"
```

- A fonte é **`vekoo-saas-landing_2.html`**. O `build.command` do
  `landingpage/wrangler.jsonc` copia esse arquivo para `dist/index.html`, junto com
  o `_headers`. Edite o HTML e rode o deploy; não há outro passo.
- Está publicado por **rotas** (`vekoo.app/*`, `www.vekoo.app/*`), não por custom
  domain: os registros DNS de `vekoo.app`/`www` continuam apontando para o
  estacionamento da Hostinger (proxied) e o Worker intercepta antes. **Se apagar
  esses registros, a rota para de receber tráfego.** Para trocar por custom domain,
  apague os registros e use `custom_domain: true`.
- ⚠️ **O formulário da lista de espera não grava nada.** `submitWaitlist()` só
  mostra a tela de sucesso. Falta ligar a um destino: endpoint no Rails (e então
  liberar `https://vekoo.app` em `FRONTEND_ORIGINS`) ou um serviço de formulário.

---

## 5. Trocar o endereço da API

Mexer em **todos** juntos, senão o front para de falar com a API:

1. `backend/config/deploy.yml`: `proxy.hosts`, `APP_HOSTS` (config.hosts; sem o host
   ali a API responde 403), `BACKEND_URL`, `API_ORIGIN` (URL absoluta dos uploads).
2. `frontend/public/_headers`: `connect-src` com `https://` **e** `wss://` (o
   ActionCable em `/cable`).
3. Rebuild do front com o novo `VITE_API_URL` (é inlinado em build time).
4. Se a origem do front mudar: `FRONTEND_ORIGINS` no `deploy.yml` (CORS, lista
   explícita, sem curinga).

---

## 6. Servidor do zero (provisionamento)

Já feito para `107.152.37.59`. Para um host novo (Ubuntu, acesso root):

```bash
ssh root@<IP> "bash -s -- $(base64 -w0 ~/.ssh/vekoo_deploy.pub) open" < bin/deploy-setup
```

Depois troque o IP em `backend/config/deploy.yml` e rode `kamal setup` (só na
primeira vez; ele sobe accessories, proxy e app).

O script instala Docker CE, cria o usuário `deploy`, configura 2 GB de swap,
rotação de log do Docker, UFW (só a 22), fail2ban e backup noturno, e **desliga a
senha no SSH**. O segundo argumento é o modo do firewall dos containers:

- `open`: 80/443 abertos ao mundo. É o modo **atual**, necessário enquanto o
  host sslip.io responde direto e para o Let's Encrypt.
- `cloudflare` (padrão): 80/443 só das faixas da Cloudflare, via chain
  `VEKOO-CF` em `DOCKER-USER`, porque o UFW não filtra portas publicadas por container.
  Exige que todo acesso venha pela Cloudflare (tirar o host sslip.io) e que o
  certificado seja de origem, e não Let's Encrypt.

**O root do servidor não tem a chave de deploy.** Rodar o script de novo exige
colocar uma chave em `/root/.ssh/authorized_keys` pelo console da VPS.

**fail2ban:** o IP desta máquina (`201.80.77.187` no provisionamento) está em
`ignoreip`. Um deploy abre muitas conexões SSH; se o IP mudar e o deploy morrer com
*Connection reset by peer*, o IP foi banido: espere 1 h (bantime) ou ajuste
`/etc/fail2ban/jail.d/sshd.local` como root, e rode `kamal lock release`.

### Backup

Cron diário às 03:20 (`/usr/local/bin/vekoo-backup`): `pg_dump -Fc` do banco e
tar do volume `vekoo_storage` em `/var/backups/vekoo`, com retenção de 14 dias.

```bash
ssh -i ~/.ssh/vekoo_deploy deploy@107.152.37.59 'ls -lh /var/backups/vekoo'
```

Restore **ainda não testado**.

---

## 7. Armadilhas

- **`kamal proxy reboot` derruba tudo do host**: o proxy é global.
- **Nenhum accessory com `port:`.** Porta publicada pelo Docker ignora o UFW e
  exporia Postgres/Redis à internet. App e accessories conversam pela rede `kamal`.
- **`vekoo_storage` é volume nomeado, nunca bind mount.** O bind mount nasce
  `root:root` e o primeiro upload morre com `EACCES` (o container roda como 1000).
- **`RAILS_MAX_THREADS` do worker (6) ≥ `:concurrency` do `config/sidekiq.yml` (5)**,
  senão aparece `ConnectionTimeoutError` intermitente.
- **Postgres fixado em `16.10`.** Um major novo se recusa a subir sobre o `PGDATA` existente.
- **Builder do buildx velho:** se o build morrer em `booting buildkit` com *bind source
  path does not exist*, rode `docker buildx rm kamal-local-docker-container` (o Kamal recria).
- **Fontes:** a imagem traz `fontconfig` + DejaVu como reserva do Pango; as fontes
  das marcas baixam em runtime para `tmp/brand_fonts` (`BrandFonts`). Esse diretório
  some a cada deploy, e o cache é refeito sob demanda.
- **`AGENT_MODEL`** está em `env.clear` do `deploy.yml` (`claude-sonnet-5-5`), com o
  teto `AGENT_MONTHLY_COST_CENTS_CAP`.

---

## 8. Pendências

- [ ] Formulário da landing grava em lugar nenhum (§4)
- [ ] Firewall em modo `open`: a origem aceita tráfego que não vem da Cloudflare (§6)
- [ ] Restore de backup testado uma vez
- [ ] Trocar a senha root da VPS, que circulou em texto; o SSH já não aceita senha
