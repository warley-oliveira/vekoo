#!/usr/bin/env bash
# Prepara um git worktree de sub-agent: banco de teste próprio, Mongo próprio e
# portas próprias. Rodar UMA vez, a partir da raiz do worktree:
#
#   bash docs/migration/tools/worktree-setup.sh <numero-do-agente>
#
# node_modules e gems são compartilhados com o repositório principal — por isso a
# regra é não instalar dependência dentro do worktree (ver CONVENTIONS.md).
set -euo pipefail

N="${1:?informe o numero do agente}"
ROOT="$(git rev-parse --show-toplevel)"
MAIN="/home/warley/workspace/vekoo"
BASE_BRANCH="platform-migration"

[ "$ROOT" = "$MAIN" ] && { echo "Rode dentro do worktree, não no repositório principal."; exit 1; }

# O worktree pode nascer de outra referência: garante a base atual da migração.
git -C "$ROOT" merge --ff-only "$BASE_BRANCH" >/dev/null 2>&1 || git -C "$ROOT" reset --hard "$BASE_BRANCH"

cp "$MAIN/.env" "$ROOT/.env"
ln -sfn ../.env "$ROOT/backend/.env"
ln -sfn "$MAIN/frontend/node_modules" "$ROOT/frontend/node_modules"

# Sobrescreve só o que precisa ser exclusivo deste worktree.
sed -i -E '/^(POSTGRES_DB|MONGO_DB|RAILS_PORT|VITE_PORT|VITE_API_URL|TEST_ENV_NUMBER)=/d' "$ROOT/.env"
cat >> "$ROOT/.env" <<ENV
TEST_ENV_NUMBER=$N
POSTGRES_DB=vekoo_wt${N}_development
MONGO_DB=vekoo_wt${N}_development
RAILS_PORT=$((3100 + N))
VITE_PORT=$((5300 + N))
# Back-end compartilhado (branch de integração, com semente). Para testar uma
# correção do próprio back-end: suba o Rails do worktree em RAILS_PORT e aponte aqui.
VITE_API_URL=http://localhost:3040
ENV

( cd "$ROOT/backend" && RAILS_ENV=test bin/rails db:create db:schema:load >/dev/null )

echo "worktree pronto: $ROOT"
echo "  agente=$N  branch=$(git -C "$ROOT" branch --show-current)  base=$(git -C "$ROOT" log -1 --format=%h)"
echo "  rspec: cd backend && bundle exec rspec   |  vite: cd frontend && npx vite --port $((5300 + N))"
