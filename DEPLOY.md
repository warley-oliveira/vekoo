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

## Produção — `3a0a0fa` desde 2026-11-01 (tag `prod-3a0a0fa`)

Logo com símbolo no "cria pra mim" do onboarding (`Logos::Concepts`, `LogoConceptsJob`) e o
vtracer 0.6.4 fixo na imagem. Sem janela (62 s; dump antes em
`~/backups/vekoo/pre-deploy-2026-11-01-0207.dump`), sem migration. Conferido: vtracer nos dois
containers, geração disponível no worker, vetorização e montagem de verdade com imagem sintética.

### `3fa4f53` (tag `prod-3fa4f53`)

Deploy pequeno sobre a `8d804fd` (sem janela: a API não caiu, 67 s; dump antes em
`~/backups/vekoo/pre-deploy-2026-11-01-0056.dump`): degradê por lâmina no editor com aviso de
leitura, staff entrando na organização das marcas de teste pelo seletor de marca, e a exclusão
de organização corrigida. Migrations só acrescentam (`piece_renders.legibility`,
`organizations.internal`, `sessions.acting_organization_id`).

### O deploy grande — `8d804fd` (tag `prod-8d804fd`)

Deploy grande da `main` (merge da `feat/reference-bank`): documento da peça e editor,
agente com foto, onboarding por conversa, banco de referências e curadoria, descrição das
fotos, ritmo do carrossel e cadastro fechado (`SIGNUP_ALLOWLIST`, 3 e-mails). 16 migrations,
a primeira com a extensão `vector`. Antes: `da2e0da` (tag `prod-da2e0da`, o hotfix do Redis
sobre a `e6c2eb9`).

A janela, na ordem: dump validado e copiado (`~/backups/vekoo/pre-deploy-2026-11-01-0008.*`,
hash conferido) → `kamal app stop` → `kamal accessory reboot db` (pgvector 0.8.7, Postgres
16.15, collation 2.41 igual) → `ALTER USER vekoo` com a senha nova → `kamal deploy
--skip-push` (imagem construída antes, 122 s) → conferências → marcas de teste
(`references:eval:brands PHOTOS=0`) e o acervo da curadoria do dev
(`references:import FILE=-`: 60 cards com vetor e miniatura, 30 fotos descritas) → organização
da demonstração apagada → front. API fora do ar por ~10 min.

**Segredos trocados na mesma janela** (vazaram num print): `RAILS_MASTER_KEY` (com o
`credentials.yml.enc` recriptografado), `SECRET_KEY_BASE`, a senha do Postgres
(`POSTGRES_PASSWORD` e `DATABASE_URL`) e a `ANTHROPIC_API_KEY` — agora uma chave para
produção e outra para o dev. O Postgres e o Redis não publicam porta: só existem na rede
`kamal`, e o `DATABASE_URL` não serve de fora do servidor. A `e6c2eb9` e a `da2e0da` não
sobem mais (chave mestra e senha do banco antigas): voltar atrás é pelo dump, não por
`kamal rollback`.

Aprendido na janela:
- `kamal app exec --reuse` **sem `-r web` roda em todos os papéis** (web e worker, um depois
  do outro): tarefa que cria coisa roda duas vezes. Comando avulso: sempre `-r web`.
- Apagar uma organização falhava: `onboarding_events` e `image_generations` apontam para
  ela e o modelo não as apagava junto (corrigir no código).
- O `.env.deploy` é lido pelo shell: valor com espaço (a lista de e-mails) precisa vir sem
  espaço ou entre aspas, senão só o primeiro pedaço entra.

---

## 1. Pré-requisitos na máquina de deploy

| Item | Onde | Observação |
|---|---|---|
| `kamal 2.12.0` | gem do Ruby do mise | `kamal version` |
| Docker + buildx | local | o Kamal builda aqui e envia a imagem por túnel SSH |
| Chave SSH | `~/.ssh/vekoo_deploy` | autorizada para o usuário `deploy` do servidor. **Sem ela não há acesso: o servidor não aceita senha** |
| Segredos | `.env.deploy` na raiz (gitignorado, `chmod 600`) | ver abaixo |
| Login Cloudflare | `npx wrangler login` (conta **Vekoo**) | conferir com `npx wrangler whoami` |
| `vtracer 0.6.4` (dev) | `~/.local/bin/vtracer` | vetoriza o símbolo das logos propostas. Na imagem de produção ele vem do estágio `vtracer` do `Dockerfile`; no dev, o mesmo binário, tirado de lá: `docker build --target vtracer -t vekoo-vtracer:0.6.4 backend && docker create --name vt vekoo-vtracer:0.6.4 && docker cp vt:/opt/vtracer/bin/vtracer ~/.local/bin/ && docker rm vt` (outro caminho: `VTRACER_PATH`). Sem ele, o "cria pra mim" da logo oferece só o logotipo com o nome |

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
  banco vazio ele também roda o seed — que em produção aplica **só o acervo** (temas,
  imagens, paletas): a conta de demonstração, que tem a senha no código, só nasce em
  development e test (`db/seeds.rb`).
- Um deploy leva de 1 a 2 minutos com cache. O primeiro `kamal setup` levou cerca de 4 minutos.

Conferir:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://syco.vekoo.app/up       # 200
# A conta de demonstração não existe em produção: o login dela tem que falhar.
curl -s -X POST https://syco.vekoo.app/login -H 'Content-Type: application/json' \
  -d '{"session":{"email":"marina.duarte@exemplo.com.br","password":"carrossel123"}}' \
  -o /dev/null -w '%{http_code}\n'                                     # 401
```

| Situação | Comando (em `backend/`, com `.env.deploy` carregado) |
|---|---|
| Só reiniciar (mesma imagem) | `kamal app boot` |
| Voltar atrás | `kamal rollback <versão>` (versões: `kamal app containers`) |
| Logs | `kamal app logs -f` · `kamal app logs -r worker` · `kamal proxy logs` |
| Console Rails / shell | `kamal console` · `kamal shell` |
| psql | `kamal dbc` |
| Reaplicar o acervo (idempotente; em produção não cria conta) | `kamal seed` |
| Lock preso após queda | `kamal lock release` |

Containers no host: `kamal-proxy`, `vekoo-api-web-<sha>`, `vekoo-api-worker-<sha>`,
`vekoo-api-db` (Postgres 16 + pgvector, tag fixada no `deploy.yml`), `vekoo-api-redis` (Redis 7.4, AOF ligado).
Volumes nomeados: `vekoo_pgdata`, `vekoo_redis`, `vekoo_storage` (uploads do Active Storage).

Acesso direto: `ssh -i ~/.ssh/vekoo_deploy deploy@107.152.37.59` (o usuário
`deploy` está no grupo `docker`, sem sudo).

### Trocar a imagem do Postgres (pgvector) — uma vez

O banco de referências guarda embedding em `vector(768)`: o accessory `db` passa de
`postgres:16.10` para `pgvector/pgvector:0.8.7-pg16-trixie` (Postgres 16.15), fixada
na **tag específica e no digest** da imagem testada no dev — nunca `pg16` ou `latest`.
Mesma major, então o `PGDATA` sobe sem conversão; **mesmo Debian**: o `postgres:16.10`
do servidor é trixie com glibc 2.41 (conferido em 2026-10-27), e a imagem nova também —
a ordenação de texto dos índices não muda. Mudar o `deploy.yml` não basta:
a imagem só troca com `kamal accessory reboot db`. **Isso tem que acontecer antes do
primeiro deploy com a migration `20261027213001_enable_vector`** — sem a extensão, o
`db:prepare` falha, o healthcheck não passa e o Kamal mantém o container antigo.

Regras: janela de madrugada (longe do backup das 03:20), com horário confirmado; o
dump **validado e copiado para fora do servidor** antes de qualquer outra coisa; e
**ok explícito antes de cada passo destrutivo** (⚠ abaixo). De `backend/` com
`.env.deploy` carregado:

```bash
SSH="ssh -i ~/.ssh/vekoo_deploy deploy@107.152.37.59"
STAMP=$(date +%F-%H%M)

# 0. Pré-checagem (só leitura): tem que dizer trixie e glibc 2.41, como em 2026-10-27.
#    Se mudou, PARE: a tag no deploy.yml tem que acompanhar a base. Anote a collation.
$SSH "docker exec vekoo-api-db sh -c 'grep PRETTY /etc/os-release; postgres --version'"
$SSH "docker exec vekoo-api-db psql -U vekoo -d vekoo_production -tAc \
  \"select datcollversion from pg_database where datname = current_database()\""

# 1. Dump completo na home do `deploy` (que ele sempre pode escrever)…
$SSH "mkdir -p ~/backups \
  && docker exec vekoo-api-db pg_dump -U vekoo -Fc vekoo_production > ~/backups/pre-pgvector-$STAMP.dump \
  && docker exec vekoo-api-db pg_dumpall -U vekoo --globals-only > ~/backups/pre-pgvector-globals-$STAMP.sql"

# 2. …validado: tamanho (perto do backup da última noite, nunca zero) e conteúdo
#    (as tabelas com dado estão lá: TABLE DATA de accounts, brand_cores, pieces…).
$SSH "ls -l ~/backups/pre-pgvector-$STAMP.dump /var/backups/vekoo | tail -4"
$SSH "docker exec -i vekoo-api-db pg_restore --list < ~/backups/pre-pgvector-$STAMP.dump \
  | grep -c 'TABLE DATA'; docker exec -i vekoo-api-db pg_restore --list < ~/backups/pre-pgvector-$STAMP.dump \
  | grep 'TABLE DATA public' | grep -E ' (accounts|organizations|brand_cores|brand_core_versions|pieces|piece_versions) '"

# 3. …e copiado para fora do servidor, conferido pelo hash dos dois lados.
mkdir -p ~/backups/vekoo
scp -i ~/.ssh/vekoo_deploy "deploy@107.152.37.59:backups/pre-pgvector-$STAMP.*" ~/backups/vekoo/
$SSH "sha256sum ~/backups/pre-pgvector-$STAMP.*"; sha256sum ~/backups/vekoo/pre-pgvector-$STAMP.*

# 4. ⚠ Para a API e o worker (nada escreve durante a troca).
kamal app stop

# 5. ⚠ Troca a imagem (para, remove e sobe o container no mesmo volume).
kamal accessory reboot db

# 6. Confere: 16.15 · o mesmo número de contas · vector 0.8.7 · as duas versões de
#    collation iguais (2.41). Se divergirem — não deve, a glibc é a mesma —, PARE antes
#    do passo 7: a correção é `REINDEX DATABASE vekoo_production;` seguido de
#    `ALTER DATABASE vekoo_production REFRESH COLLATION VERSION;`, com a API ainda parada.
$SSH "docker exec vekoo-api-db psql -U vekoo -d vekoo_production -tAc \
  \"select version(); select count(*) from accounts; \
    select default_version from pg_available_extensions where name = 'vector'; \
    select datcollversion, pg_database_collation_actual_version(oid) from pg_database where datname = current_database()\""

# 7. Sobe a API de novo; /up e login (ver acima). Só então o deploy da Fase 1.
kamal app start
```

Voltar atrás: versões *minor* de uma mesma major nunca mudam o formato em disco, então
devolver `image: postgres:16.10` ao `deploy.yml` e rodar `kamal accessory reboot db` de
novo sobe o mesmo volume. Último recurso: `pg_restore` do dump do passo 1 num volume novo.

### Vertex AI em produção (conta de serviço) — uma vez, antes da Fase 3

O Vertex AI atende duas coisas: a geração de imagens (Nano Banana — a ferramenta de
foto do agente e o "gerar" do editor) e o embedding do banco de referências. Sem ele a
API responde "indisponível" e não cobra nada, o agente compõe sem foto gerada e os
cards publicam sem vetor (a semelhança não pontua na busca). Em 2026-10-28 a produção
roda `e6c2eb9`, anterior às duas funções; o primeiro deploy que as leva já deve ter isto
pronto.

A credencial é uma **conta de serviço dedicada**, só com o papel **Vertex AI User** —
nunca o ADC pessoal de alguém —, e a chave vai como **segredo do Kamal**, em base64 (o
env-file do Docker não aceita valor com várias linhas). `Ai::Vertex` lê
`GOOGLE_CREDENTIALS_BASE64`; segredo inválido deixa tudo indisponível, com log, e não
cai em outra identidade.

**1. No console do Google Cloud** (o projeto do `GOOGLE_CLOUD_PROJECT` do `.env`):

1. *APIs e serviços* → confirme que a **Vertex AI API** (`aiplatform.googleapis.com`)
   está ativada.
2. *IAM e administrador* → *Contas de serviço* → *Criar conta de serviço*: nome
   `vekoo-api-vertex`, descrição "API de produção: imagens e embedding".
3. *Conceder acesso ao projeto*: **só** o papel **Vertex AI User**
   (`roles/aiplatform.user`). Pule "conceder acesso a usuários".
4. Na conta criada → *Chaves* → *Adicionar chave* → *Criar nova chave* → **JSON**. O
   arquivo baixa uma vez só. Crie **duas** chaves, uma de cada vez: a de produção e a de
   dev. São a mesma conta e o mesmo papel; chave separada deixa apagar a de dev (vazou,
   máquina nova) sem derrubar a produção.

Se o console disser que a criação de chave está desativada (política
`iam.disableServiceAccountKeyCreation`, ligada por padrão em organizações criadas a
partir de 2024), um administrador da organização precisa abrir exceção para este
projeto: *IAM e administrador* → *Políticas da organização* (com o **projeto**
selecionado) → "Disable service account key creation" → *Gerenciar política* →
*Substituir a política do pai* → regra **Não aplicar** → salvar. Quem faz isso precisa
do papel **Administrador de políticas da organização** (`roles/orgpolicy.policyAdmin`)
no nível da organização — o superadministrador do Workspace pode se dar o papel em
*IAM* com a organização selecionada. Depois de criar as duas chaves, volte a política do
projeto para **herdar do pai**: as chaves criadas continuam valendo e ninguém cria
outra por engano. A alternativa sem chave é Workload Identity Federation — mais
trabalho; decidir antes de seguir.

**2. Na máquina de deploy** (WSL — o download fica em `/mnt/c/Users/<você>/Downloads`):

```bash
mkdir -p ~/.config/vekoo && chmod 700 ~/.config/vekoo
mv /mnt/c/Users/<você>/Downloads/<chave-de-producao>.json ~/.config/vekoo/vertex-sa.json
mv /mnt/c/Users/<você>/Downloads/<chave-de-dev>.json ~/.config/vekoo/vertex-sa-dev.json
chmod 600 ~/.config/vekoo/*.json
```

Não deixe cópia em `Downloads` e nunca coloque o JSON dentro do repositório.

**No dev**, o `.env` da raiz aponta para a chave de dev — só o caminho; a chave fica em
`~/.config/vekoo`:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/home/<você>/.config/vekoo/vertex-sa-dev.json
```

O Application Default Credentials lê essa variável antes do login pessoal do `gcloud`
(que o Workspace faz vencer a cada poucos dias). Reinicie o `bin/dev` e confira:

```bash
cd backend && bin/rails runner 'puts Ai::Vertex.credentials.class; puts Ai::Embeddings.new.embed(%q(teste)).size'
#  → Google::Auth::ServiceAccountCredentials · 768
```

**3. O segredo e a configuração** (commit no repositório, menos o `.env.deploy`):

```bash
# .env.deploy (raiz, NÃO versionado) — o shell lê o arquivo na hora do deploy:
GOOGLE_CREDENTIALS_BASE64=$(base64 -w0 ~/.config/vekoo/vertex-sa.json)

# backend/.kamal/secrets
GOOGLE_CREDENTIALS_BASE64=$GOOGLE_CREDENTIALS_BASE64
```

```yaml
# backend/config/deploy.yml → env
  clear:
    GOOGLE_GENAI_USE_VERTEXAI: "True"
    GOOGLE_CLOUD_PROJECT: <o mesmo do .env>
    GOOGLE_CLOUD_LOCATION: global          # Nano Banana
    EMBEDDING_LOCATION: us-central1        # gemini-embedding-001
  secret:
    - GOOGLE_CREDENTIALS_BASE64
```

Não entre com o `secret:` antes de a chave existir: o Kamal recusa o deploy com segredo
faltando.

**4. Deploy e conferência:**

```bash
kamal app exec --reuse "bin/rails runner 'puts Ai::Vertex.available?; puts Ai::Embeddings.new.embed(%q(teste)).size'"
#  → true · 768
kamal app exec --reuse "bin/rails images:smoke"     # gera 1 imagem (~US$ 0,07)
```

**Rotação:** nova chave no console → troca o `vertex-sa.json` → deploy → apaga a chave
velha no console. **Emergência:** apagar a chave no console corta o acesso na hora.

### Instagram (Business Discovery) — app da Meta e token

A importação de referências (curadoria, `/admin/imports`) lê posts públicos de **contas
profissionais** pela Business Discovery da Instagram Graph API — oficial, sem raspagem.
Uso interno da equipe: acesso **Standard**, sem App Review. O token é segredo e nunca
entra no código, no chat ou no histórico do shell.

**Passo 0 (obrigatório antes de usar):** com o token pronto, rode
`bin/rails 'references:instagram_smoke[<@ de uma conta profissional conhecida>]'`. Se a
resposta for `permissionDenied`, o acesso Standard não libera dado de terceiros — **pare**:
o caminho passa a ser App Review com verificação da empresa. Em 2026-10-28 (usuário do
sistema, v26.0) o Standard **liberou**: conta profissional de terceiro volta com os ~50
posts numa chamada, curtidas e comentários inclusos. Conta pessoal, privada ou inexistente
volta igual — HTTP 400 `(#110) Invalid user id` —, então a tela não tem como separar os três.
Conta de carrosséis grandes pesa: a mesma consulta da @homeandapartments (39 posts, 290
lâminas, ~8 s) passou duas vezes e falhou uma com HTTP 500 `(#1) Please reduce the amount of
data you're asking for`. O cliente responde a esse erro pedindo a página pela metade (até 10)
e seguindo o cursor.

**1. Pré-requisitos** (uma vez):

1. O Instagram da Vekoo é conta **profissional do tipo Empresa** (no app: *Configurações →
   Tipo de conta e ferramentas → Mudar para conta profissional → Empresa*).
2. A Vekoo tem uma **Página do Facebook**, e o Instagram está **ligado** a ela (Meta
   Business Suite → *Configurações → Contas → Contas do Instagram → Conectar*).
3. Página e Instagram estão no **portfólio empresarial** da Vekoo
   (business.facebook.com → *Configurações → Contas*).

**2. O app** (developers.facebook.com → *Meus apps → Criar app*):

1. Caso de uso *Outro* → tipo **Empresa** → nome `Vekoo Referências (interno)` → portfólio
   empresarial da Vekoo.
2. No painel do app, *Adicionar produto* → **Instagram** → *API com login do Facebook*.
3. Não peça App Review e não mude o nível de acesso: Standard é o que vale para quem tem
   função no app. Anote o **ID do app** e a **chave secreta** (*Configurações → Básico*).

**3. O token — plano A: usuário do sistema** (não vence em 60 dias):

1. business.facebook.com → *Configurações → Usuários → Usuários do sistema → Adicionar*:
   nome `vekoo-referencias`, função **Funcionário** (não administrador).
2. *Atribuir ativos*: o **app** (`Vekoo Referências`), a **Página** e a **conta do
   Instagram** — o mínimo que a tela oferecer para ler conteúdo e insights, nada de
   gerenciar anúncios.
3. *Gerar novo token* → o app → expiração **Nunca** → permissões **`instagram_basic`,
   `instagram_manage_insights`, `pages_read_engagement`, `pages_show_list`** (e
   `business_management`, se a tela pedir). O token aparece **uma vez**: copie direto para
   o passo 6.

**4. O token — plano B: usuário de longa duração** (60 dias; o acesso aos dados vence em
90 sem nova autorização). Só se o usuário do sistema não estiver disponível:

1. *Ferramentas → Explorador da Graph API* → o app → *Token de acesso do usuário* → as
   mesmas permissões do plano A (mais `ads_read` se o acesso à Página vier pelo Business
   Manager) → *Gerar* → autorize a Página e o Instagram da Vekoo.
2. Troque o token curto pelo longo, sem deixar nada no histórico:

```bash
read -rs SHORT_TOKEN; read -rs META_APP_SECRET    # cole e Enter, sem eco
curl -sG https://graph.facebook.com/oauth/access_token \
  -d grant_type=fb_exchange_token -d client_id=<ID do app> \
  -d client_secret="$META_APP_SECRET" -d fb_exchange_token="$SHORT_TOKEN"
#  → {"access_token": "...", "expires_in": ~5184000}
```

**5. O id do Instagram e a versão da API:**

```bash
read -rs META_ACCESS_TOKEN
curl -sG https://graph.facebook.com/me/accounts -H "Authorization: Bearer $META_ACCESS_TOKEN" \
  -d fields='name,instagram_business_account{id,username}'
#  → o "id" dentro de instagram_business_account é o META_IG_USER_ID
curl -sG https://graph.facebook.com/debug_token -d input_token="$META_ACCESS_TOKEN" \
  -d access_token="<ID do app>|$META_APP_SECRET"
#  → is_valid true, as permissões em scopes, expires_at 0 (plano A) ou a data (plano B)
```

O token vai no cabeçalho `Authorization: Bearer` (nunca na URL nem em log) — o Meta
aceita, conferido no Passo 0.

A versão da Graph API é a que o Explorador mostra (no Passo 0, em 2026-10-28: `v26.0` — é a
que o cabeçalho `facebook-api-version` da resposta traz). Sem
`META_GRAPH_VERSION`, as chamadas usam a versão padrão do app.

**6. Onde guardar:**

```bash
# .env (dev) e .env.deploy (produção) — nenhum dos dois é versionado:
META_ACCESS_TOKEN=...
META_APP_SECRET=...
META_APP_ID=<ID do app>
META_IG_USER_ID=<id do instagram_business_account>
META_GRAPH_VERSION=<versão do Explorador>

# backend/.kamal/secrets
META_ACCESS_TOKEN=$META_ACCESS_TOKEN
META_APP_SECRET=$META_APP_SECRET
```

```yaml
# backend/config/deploy.yml → env
  clear:
    META_APP_ID: <ID do app>
    META_IG_USER_ID: <id>
    META_GRAPH_VERSION: <versão>
  secret:
    - META_ACCESS_TOKEN
    - META_APP_SECRET
```

Como no Vertex: não entre com o `secret:` antes de o token existir.

**7. Vencimento e revogação:** a curadoria mostra um aviso a partir de 14 dias do
vencimento (do token ou do acesso aos dados) e desliga a importação quando o token deixa de
valer. Plano B: repita o passo 4 antes dos 60 dias. Emergência: remova o usuário do sistema
(ou o app) no Business Manager — o token para na hora.

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
  Exige que todo acesso venha pela Cloudflare (tirar o host sslip.io). O Let's Encrypt
  de `syco` continua renovando: o desafio HTTP-01 chega pela Cloudflare, dos IPs dela.

**Fechar a origem (de `open` para `cloudflare`) — na janela, depois do deploy:**

1. Antes (só leitura): no DNS da Cloudflare, todo registro que aponta para
   `107.152.37.59` está **proxied** (laranja); SSL em *Full (strict)*; nada usa o host
   sslip.io (monitor, front, script). `curl -s http://syco.vekoo.app/.well-known/acme-challenge/x`
   tem que responder do kamal-proxy (404), não da Cloudflare.
2. No deploy: tirar `api.107-152-37-59.sslip.io` de `proxy.hosts` e de `APP_HOSTS` no
   `deploy.yml` (commit antes — o Kamal builda do git).
3. Aplicar **só o bloco do firewall**, como root (chave pelo console da VPS). Não rodar o
   `deploy-setup` inteiro de novo: pelo console o `SSH_CLIENT` vem vazio e o fail2ban perde
   o `ignoreip` da máquina de deploy. Proposta: extrair o bloco `DOCKER-USER` para
   `bin/origin-firewall <cloudflare|open>`, que o `deploy-setup` chama.
4. Conferir: `curl -s https://syco.vekoo.app/up` → 200; direto na origem
   (`curl -m 5 -sk https://107.152.37.59/up -H 'Host: syco.vekoo.app'`) → timeout; o tempo
   real conecta pelo app; `iptables -L VEKOO-CF -n | wc -l` com as faixas.
5. Voltar atrás: o mesmo script com `open`. Depuração direta na origem passa a ser por
   túnel SSH (`ssh -L 8443:localhost:443 deploy@107.152.37.59` + `curl --resolve`).

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
- **`RAILS_MASTER_KEY` tem que abrir o `backend/config/credentials.yml.enc` versionado.** O app
  não usa nada de lá (o `secret_key_base` vem do `SECRET_KEY_BASE`), mas o Active Record
  Encryption abre o credentials no boot: chave que não abre derruba o container. Trocou a
  chave, recriptografe o arquivo no mesmo commit. O `master.key` não vai para o git.
- **Nenhum accessory com `port:`.** Porta publicada pelo Docker ignora o UFW e
  exporia Postgres/Redis à internet. App e accessories conversam pela rede `kamal`.
- **`vekoo_storage` é volume nomeado, nunca bind mount.** O bind mount nasce
  `root:root` e o primeiro upload morre com `EACCES` (o container roda como 1000).
- **`RAILS_MAX_THREADS` do worker (6) ≥ `:concurrency` do `config/sidekiq.yml` (5)**,
  senão aparece `ConnectionTimeoutError` intermitente.
- **Postgres fixado na tag (`pgvector/pgvector:0.8.7-pg16-trixie`).** Um major novo se
  recusa a subir sobre o `PGDATA` existente, e outro Debian muda a collation da glibc
  (índices de texto passam a ordenar diferente). Troca de imagem: roteiro em §2.
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
- [x] Vertex AI em produção: conta de serviço `vekoo-api-vertex` (§2) — no ar desde 2026-11-01.
  Conta e as duas chaves criadas em 2026-10-31 (o dev já usa a dele); falta a de produção
  como `GOOGLE_CREDENTIALS_BASE64` no Kamal
- [x] Na janela do deploy da Fase 3, depois das migrations: descrever as fotos que as marcas
  já enviaram — `bin/rails brands:describe_photos DRY_RUN=1` (conta), depois sem o
  `DRY_RUN` (Haiku 5.5, ~US$ 0,0004 por foto). Sem isso o agente vê só o nome do arquivo
  e a busca não desconta produto nem espaço dessas marcas
- [x] Instagram: app da Meta, usuário do sistema e token (§2), e o Passo 0 (`references:instagram_smoke`) — em produção desde 2026-11-01, token sem vencimento
- [x] Conta de demonstração em produção: **apagada** com a organização em 2026-11-01, depois do dump. Existia: Nasceu do seed antigo no primeiro
  `db:prepare` do servidor novo, em 2026-10-22 00:55 UTC (o `created_at` diz 22/09 porque
  o seed antedata 30 dias). Seis sessões até 26/10, US$ 0,0126 de IA: teste interno; a de
  `201.80.77.187` é a máquina de deploy na conferência do pós-deploy. **Travada** em
  2026-10-28 05:31 UTC (senha aleatória, sessões vencidas, nada apagado). Falta apagar a
  organização dela na janela do próximo deploy, **depois** do dump, com ok explícito
- [ ] Contas dos dois sócios em produção (pelo cadastro; os e-mails já estão na lista) e
  `bin/rails 'staff:grant[email]'` (com `-r web`) para os dois
- [ ] **IP real** — em vez de ler `CF-Connecting-IP`: `proxy.forward_headers: true` no
  `deploy.yml` + `config.action_dispatch.trusted_proxies` com as faixas da Cloudflare.
  Conserta o `request.remote_ip` inteiro, não só a sessão: hoje o `rate_limit` do login
  (10/3 min), do cadastro (5/hora) e da nova senha conta **por IP da Cloudflare**, e quem
  entra pela mesma borda divide o limite. Não é falsificável mesmo com a origem aberta (só
  salto da Cloudflare é confiável); o `CF-Connecting-IP` é, enquanto a origem aceitar
  conexão direta
- [ ] **Fechar a origem para a Cloudflare** (janela, depois do deploy) — roteiro no §6
- [ ] Trocar a senha root da VPS, que circulou em texto; o SSH já não aceita senha
- [ ] **Lançamento — teto GLOBAL de gasto de IA.** O `AGENT_MONTHLY_COST_CENTS_CAP`
  (US$ 500/mês) vale **por organização**: cada conta nova ganha o seu, e nada soma o app
  inteiro. Falta um teto que some todas as organizações (agente, onboarding e o que
  mais chamar modelo) e pare de chamar quando estourar. Até lá: limite de gasto no
  Console da Anthropic e alerta de orçamento no Google Cloud (o usuário configura)
- [ ] **Lançamento — a foto do Nano Banana não é confiável no `global`.** Em 2026-10-31,
  30 fotos seguidas no dev levaram 21 recusas 429 (capacidade compartilhada esgotada),
  mesmo com 10 s entre chamadas. O `Ai::GeminiImage` agora tenta de novo duas vezes
  (5 s e 15 s) em 429/503 e, se não der, levanta `Busy` (um `Failed`). Antes de lançar,
  **avaliar** (sem implementar ainda): endpoint regional em vez do `global`; aumento de
  cota ou capacidade reservada (Provisioned Throughput) no Vertex; um modelo de imagem de
  reserva quando o principal recusar. E a falha tem que aparecer para o assinante: hoje a
  tela de criação mostra "a foto não saiu" só enquanto o pedido roda — quando as variações
  chegam, a faixa de fotos mostra só as que deram certo e a peça sai sem foto, em silêncio.
  Precisa de um aviso claro no resultado (qual foto faltou e o que fazer)
- [x] **Próximo deploy — `Organization` apaga `onboarding_events` e `image_generations`**
  junto (hoje a exclusão falha na chave estrangeira; na janela de 2026-11-01 foram apagados à mão)
- [x] **Próximo deploy — controle do degradê no editor.** No ar em `3fa4f53`. Por lâmina com foto: sem, leve
  ou forte, com aviso quando o texto perde leitura. Hoje o degradê é o do layout (a capa
  do carrossel ganhou um mais forte em 2026-11-01: 85%, 0,8, curva 0,9)
- [ ] **Próximo ciclo — logo com símbolo** (pedido do André em 2026-11-01, depois de aprovar o
  fluxo): (1) no arranjo horizontal, o símbolo com mais ou menos a altura do bloco de texto
  (hoje o nome tem ~40% da altura do símbolo, mas o símbolo parece pequeno ao lado do nome
  inteiro); (2) testar cada símbolo em tamanho de foto de perfil (110 px) e evitar detalhe
  fino que vira borrão (a ampulheta dentro do emblema); (3) evitar forma que leia como ícone
  de interface (o corte em cruz do pão parece um "X"); (4) "outras opções" de símbolo (mais
  uma rodada, ~US$ 0,31) e a logo inteira em SVG, com o nome em contorno
- [ ] **Lançamento — abrir o cadastro.** Hoje produção é fechada por padrão
  (`config.x.signup_allowlist` no `production.rb`, de `SIGNUP_ALLOWLIST`). Abrir é tirar
  essa linha — ou trocar a lista por convite

---

# Apêndice — a plataforma de atendimento (`platform-migration`)

Escrito na `platform-migration`, antes de ela receber a `main` de novo, para levar a produção de
carrosséis à plataforma de atendimento (chat, contatos, fluxos, pipelines, campanhas, agenda).
**Ainda não rodou em produção.** O que mudou desde que foi escrito, e vale sobre o texto abaixo:

- O servidor é o **novo** (`107.152.37.59`, montado em 21/10/2026); o `107.152.37.137` não existe mais
  (o texto já foi trocado). Tudo roda na mesma VPS: web, worker, **scripts** e os accessories.
- **TLS é Let's Encrypt pelo kamal-proxy** (`ssl: true`, §2 "TLS"), não o certificado autoassinado
  que o texto original descrevia; `.kamal/certs/` não é mais usado.
- **Registry é o local do Kamal** (`localhost:5555`, por túnel SSH), não o GHCR.
- O Postgres **já** tem pgvector em produção (`pgvector/pgvector:0.8.7-pg16-trixie`, fixado por
  digest, §2 "Trocar a imagem do Postgres"): o passo de trocar a imagem já foi feito pela `main`.
- O que a plataforma acrescenta ao deploy da `main`: o accessory **`mongodb`** (`MONGO_INITDB_ROOT_PASSWORD`
  e `MONGODB_URI`), o papel **`scripts`** (Sidekiq só da fila `scripts`, teto de 1 GB), `HASHID_SALT`,
  e as chaves de canais, push e Google listadas em `.env.deploy.example` — todas em `deploy.yml` e
  `.kamal/secrets`. A VPS tem 3.8 GB de RAM: conferir a memória com tudo no ar (A1).
- A migration `MoveStaffToUsers` leva `accounts.staff` para `users.staff` e tira
  `sessions.acting_organization_id`: depois dela, staff entra na organização das marcas de teste pela
  lista do suporte, não mais pelo seletor de marca.

## A1. O que sobe

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

**O que não sobe com este deploy:** o servidor da Evolution (`EVOLUTION_API_URL` aponta para ele, em outro lugar), o bundle embutível do widget, e-mail (A11).

**Memória.** Numa base vazia, medido localmente: cerca de 300 MB por processo do Rails, em repouso. Somando Mongo (cache de 0.5 GB), Postgres e Redis, são cerca de 2.5 GB dos 3.8 GB, com 2 GB de swap. **Não medido sob carga.** Confira com `docker stats` depois de abrir. Se apertar, o primeiro botão é `WEB_CONCURRENCY: 1`; o segundo, VPS maior.


## A5. Levar a produção atual para a plataforma

O host já tem `vekoo-api-web`, `-worker`, `-db` (`postgres:16.10`, **sem pgvector**) e `-redis`. Esta versão falha sem a extensão, e por segurança: o deploy sem trocar a imagem morre na migration, com `extension "vector" is not available`, e a versão anterior continua no ar (ensaiado).

A API antiga continua funcionando durante todos os passos até o 7, exceto pelos segundos em que o Postgres reinicia. Faça fora do horário de pico.

**1. Preencha `.env.deploy`** com o que entrou: compare com `.env.deploy.example`. No mínimo `MONGO_INITDB_ROOT_PASSWORD` e `MONGODB_URI`, com a mesma senha. Todos os comandos abaixo saem de `backend/`, com o ambiente carregado:

```bash
set -a; . ./.env.deploy; set +a
cd backend
```

**2. Backup agora, e fora do servidor:**

```bash
ssh root@107.152.37.59 /usr/local/bin/vekoo-backup
scp deploy@107.152.37.59:'/var/backups/vekoo/db-*.pgdump' .
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
ssh root@107.152.37.59 "bash -s -- --backup-only" < ../bin/deploy-setup
ssh root@107.152.37.59 /usr/local/bin/vekoo-backup
ssh deploy@107.152.37.59 'ls -lh /var/backups/vekoo'    # db, mongo e storage
```

**7. Deploy.** O entrypoint cria os índices, aplica as migrations e sincroniza o dado do produto, e o papel `scripts` nasce aqui:

```bash
kamal deploy
```

Entre as migrations está a que **separa a pessoa do vínculo** (`20261107003801_split_users_from_accounts`): cada conta vira um `User` com o mesmo id e os mesmos e-mail, senha, nome, telefone, idioma e foto, e a conta passa a ser o vínculo dela com a organização. Sessões, pedidos de nova senha e aparelhos de push mudam de dono só pela coluna: **ninguém precisa entrar de novo**, e todo `account_id` gravado no Postgres e no Mongo continua valendo. Roda numa transação; se algo falhar, nada muda e o deploy volta para a versão anterior. A volta (`db:rollback`) existe enquanto ninguém estiver em duas organizações. Antes, `HASHID_SALT` no `.env.deploy`, se quiser um sal próprio: ele entra na URL do front (`/a/<hashid>/...`) e **não pode mudar depois**, ou todo link guardado quebra.

Depois do deploy, ligue o suporte do Vekoo para quem atende (a pessoa precisa ter conta):

```bash
kamal app exec -r web --reuse "bin/rails 'support:grant[suporte@vekoo.com.br]'"
```

**8. Publique o front** (A7, "Front na Cloudflare"; hoje: §3 acima), com as variáveis novas.

**9. Registre o que fica fora do repositório** (A7) e confira (A8).

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
ssh deploy@107.152.37.59 'docker run --rm --entrypoint ldd pgvector/pgvector:pg16-trixie --version'
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


## A7. Ambiente

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

Quem acrescentar SDK externo ajusta o `_headers` no mesmo commit, e confere o console em produção. **O Google Sheets do assistente de campanha ainda não está lá:** ver A11.

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

Evolution e LeadChat não pedem nada: a ativação do canal configura o webhook, a partir de `BACKEND_URL`.


## A8. O que conferir depois do deploy

```bash
kamal app details                              # web, worker e scripts, os três no ar
kamal accessory details all                    # db, mongodb e redis, healthy
kamal app logs -r web --since 15m | grep -E 'MONGOID: Created indexes|Puma starting|aborted'
```

| O quê | Como | Espera |
|---|---|---|
| API | `curl -s -o /dev/null -w '%{http_code}\n' https://syco.vekoo.app/up` | `200` |
| Sessão e dados | `/login` na tela, com uma conta; abrir o Dashboard, o Chat e os Carrosséis | A URL vira `/a/<hashid>/dashboard`, com dados, sem erro. O dashboard usa `hint`: se ele abre, os índices estão lá |
| Pessoas e vínculos | `kamal app exec -r web --reuse "bin/rails runner 'p [User.count, Account.count, Account.where(user_id: nil).count]'"` | Os dois primeiros iguais ao número de contas de antes; o terceiro, `0` |
| Sessão de antes do deploy | Um navegador que já estava logado, recarregado | Continua dentro, sem pedir senha |
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
| Backup | `ssh deploy@107.152.37.59 'ls -lh /var/backups/vekoo'` no dia seguinte | `db-`, `mongo-` e `storage-` da noite. `/var/log/vekoo-backup.log` sem `FALHOU` |
| Memória | `ssh deploy@107.152.37.59 'docker stats --no-stream'` | Folga, e `scripts` longe de 1 GB |

**A conferência do front**, que vale fazer sempre depois de publicar. O nome do arquivo muda a cada build: se não mudou, nada foi publicado. E se o bundle não contém a URL da API, é uma versão anterior:

```bash
curl -I https://my.vekoo.app/login                 # 200: o fallback do SPA funciona
JS=$(curl -s https://my.vekoo.app/ | grep -o '/assets/index-[^"]*\.js' | head -1)
curl -s "https://my.vekoo.app$JS" | grep -c syco.vekoo.app   # tem que ser > 0
```


## A9. Operação

```bash
kamal app logs -f --grep ERROR
kamal app logs -r scripts --since 1h
kamal accessory logs mongodb
```

**Backup** noturno às 03:20, com retenção de 14 dias, em `/var/backups/vekoo`: Postgres (`db-*.pgdump`), Mongo (`mongo-*.archive.gz`) e anexos (`storage-*.tar.gz`). Cada parte falha sozinha. Mudou o script em `bin/deploy-setup`? `--backup-only`, como em A5. **Fica no mesmo disco:** copie para fora de vez em quando.

**Restore. Teste pelo menos uma vez em produção:** backup não testado não é backup. Os comandos abaixo foram ensaiados localmente.

```bash
# Postgres, no host
docker exec -i vekoo-api-db pg_restore -U vekoo -d vekoo_production --clean --if-exists < db-AAAAMMDD-HHMMSS.pgdump

# Mongo, no host. --drop troca as coleções pelas do arquivo, com os índices
docker exec -i vekoo-api-mongodb sh -c 'exec mongorestore --quiet -u "$MONGO_INITDB_ROOT_USERNAME" -p "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --drop' < mongo-AAAAMMDD-HHMMSS.archive.gz

# Anexos, no host
docker run --rm -i -v vekoo_storage:/data alpine tar xzf - -C /data < storage-AAAAMMDD-HHMMSS.tar.gz
```

**Suporte do Vekoo.** Quem tem `master` entra em qualquer organização pela tela de organizações, e cada entrada fica registrada:

```bash
kamal app exec -r web --reuse "bin/rails 'support:grant[pessoa@vekoo.com.br]'"    # liga
kamal app exec -r web --reuse "bin/rails 'support:revoke[pessoa@vekoo.com.br]'"   # desliga, e as abas de suporte caem na hora
kamal app exec -r web --reuse "bin/rails 'support:accesses[50]'"                  # as últimas entradas: quando, quem, organização, IP
```

Nenhuma rota da API liga `master`. No console, `SupportAccess.recent` traz o mesmo registro.

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


## A11. O que ainda não existe

Não é configuração que falta: é código, ou decisão. A lista completa está em `docs/migration/DECISIONS.md`.

- **E-mail.** Nenhum mailer envia nada. `POST /password-resets` responde 202 em produção e **a pessoa não recebe o link**: "esqueci a senha" não funciona até um serviço de e-mail entrar.
- **CSP do Google Sheets.** O assistente de campanha carrega scripts do Google, e o `_headers` não os libera. Sem isso, o erro só aparece em produção. Ao integrar a frente, acrescente, depois de a revisão de segurança olhar: `script-src https://accounts.google.com https://apis.google.com`; `connect-src https://sheets.googleapis.com`; `frame-src https://accounts.google.com https://docs.google.com`.
- **Bundle embutível do widget.** A API `/widget/v1` e o `/widget-cable` estão no ar, mas o script que o cliente cola no site, em `WIDGET_BASE_URL`, não faz parte desta migração.
- **`features` da organização** (`sync_message_history`) só se ligam pelo console.
- **Armazenamento de anexos** é disco local, no volume: não dá para ter dois hosts da aplicação sem trocar por S3.


## A13. Armadilhas específicas deste setup

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
