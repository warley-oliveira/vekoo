# Decisões e pendências da migração

Registro vivo, escrito pelo integrador a partir do relatório de cada frente. A seção 1 é para o dono do produto vetar; a seção 2 é o que cada frente seguinte precisa cumprir.

## 1. Decisões que podem ser vetadas

### Arquitetura (ver MANIFEST)

- **Funis sem assistente:** modelo novo `Funnel`, com etapas próprias, no lugar das `classification_steps` do assistente.
- **Sem RabbitMQ:** eventos do Evolution chegam por webhook.
- **Uma organização por pessoa:** sem multi-workspace, como já previsto no `CLAUDE.md`.
- **Carrosséis continuam no menu**, no grupo CRIAÇÃO. `/` passa a abrir o Dashboard, e a biblioteca de carrosséis muda para `/carousels`.
- **Semente de exemplo fora de produção:** os domínios só semeiam em produção com `SEED_DEMO_DATA=1`, porque criam pessoas com senha conhecida. A semente original (conta de demonstração e carrosséis) continua como estava.

### Pessoas e permissões (be-access)

- **`DELETE /users/:id` apaga de verdade.** Na origem só removia o acesso. Ids guardados em conversas e cards ficam órfãos; a tela deve preferir "revogar".
- **Leitura de pessoas e departamentos é aberta a qualquer sessão**, como na origem: chat, agenda e pipelines listam colegas. Sem `core_settings`, a pessoa recebe só id, nome, e-mail, avatar, departamentos e `setupOnly`, e apenas de quem está ativo.
- **Permissões mais fechadas que a origem:** `/access-roles` exige `core_settings` até para ler, e `POST /alerts/resolve` também.
- **Preferências do chat** têm rota própria, `PATCH /organization/chat-settings`, com a permissão `chat`. Na origem era qualquer usuário.
- **Grupos padrão** não mudam de nome nem saem, mas as permissões deles são editáveis.
- **Níveis de permissão validados:** `all`, `own`, `none`; em `chat_list_to`, `all`, `team`, `assigned`.
- **Regras acrescentadas:** ninguém revoga nem exclui a si mesmo; a própria senha só muda em `/profile`; trocar a senha de outra pessoa derruba as sessões dela; CNPJ precisa de 14 dígitos; limite de 30 por minuto em `check-email` + `POST /users`, para não virar varredura de e-mails.
- **`GET /notifications` passou a ser paginado** (20 por padrão; antes vinha tudo). Aviso do produto conta como categoria `system`, e o `DELETE` dele apaga para a organização inteira.
- **Endpoint de push** só aceita HTTPS com nome público, para o servidor não virar acesso à rede interna. DNS rebinding continua possível.

### Catálogo (be-products)

- **Busca sem chave da OpenAI:** encadeia tsvector e depois `ILIKE`. Só `ILIKE`, como pedido no briefing, faria plural deixar de casar.
- **Imagem:** `url` virou `source_url`, opcional. A `url` da API é a original, e a miniatura é WebP, porque JPEG estraga fundo transparente.
- **Validações mais estritas que a origem:** link precisa ser http(s); categoria-pai de outra organização dá 422 (a origem descartava em silêncio); valor de campo personalizado é convertido ao gravar, e inválido dá 422.
- **Reimportação** só altera `active` se a coluna vier. A origem reativava itens desativados à mão.
- **Espelhamento de imagem** recusa endereço interno (SSRF), fixa o IP validado e só aceita as portas 80 e 443. Imagem em outra porta continua externa.
- **Acréscimos que a origem não tinha:** backfill de embeddings de hora em hora; varredura que encerra importação parada há 30 min e apaga a abandonada há 7 dias; teto de 500 ids no `bulk-destroy`; 422 ao excluir importação em andamento.
- **Mantidos como na origem:** `required` e `defaultValue` dos campos não são aplicados pela API, e a listagem esconde inativos por padrão.
- **Defeitos da origem corrigidos** (cada um com spec): upload de CSV recusado nesta versão da gem, `q` da tela ignorado, `mirror_images` que nunca enfileirava, `items_count` que podia ficar negativo, índice de busca defasado ao vincular ou renomear categoria, "Não" virando ativo, `1.234,56` descartado, dois cliques em "Importar" reprocessando o arquivo, entre outros.

## 2. Pendências por frente

### Integrador (Fase 5)

- `.env.example` e `DEPLOY.md`: VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), `MONGODB_URI`, `db:mongoid:create_indexes` no deploy, Mongo como accessory.
- Sem caminho pela API para ligar `features`: hoje só pelo console.
- **Bloqueia deploy:** `config/deploy.yml` usa `postgres:16.10`, sem pgvector, e a migration do catálogo falharia. Trocar a imagem antes de migrar (conferir a glibc do volume de produção, para não repetir a incompatibilidade de collation vista em desenvolvimento: lá a variante `pg16-trixie` resolveu).
- `OPENAI_API_KEY` em `.env.example`, `.env.deploy.example`, `deploy.yml` e `DEPLOY.md`.
- `bin/brakeman` sai com código 5 só por causa do `--ensure-latest` (8.0.5 contra 8.1.0), o que quebra `bin/ci` independentemente do código.
- Revisão de segurança: `Products::RemoteImage` pode servir a outros downloads de URL vinda do cliente.
- Não testado até aqui: OpenAI real, jobs recorrentes disparando no Sidekiq, importação em alto volume, push em navegador de verdade.

### Front (fases 3 e 4)

- `lib/api.ts` e `AuthErrorCode` não conhecem `accessRevoked` nem os códigos novos do domínio de pessoas (fe-settings-people).
- O topo pode receber aviso com `key: null`: `app-shell.tsx` não pode depender de `n.key` (fe-shell, em andamento).
- `fe-contacts-catalog`: ler a seção "Para a tela" de `docs/migration/api/products.md`; a grade de gestão manda `includeInactive=true`.

### Back (Fase 2)

- `be-inbox`: `chat_list_to` usa `team` (não `department`), e a atribuição de conversa deve filtrar pessoas `setupOnly`.
- `be-agenda`: a origem espelhava o avatar da pessoa em `Collaborator`.
- Avisos criados pelos domínios: `AccountNotice.create!` (o `recycle.rb` já converte).
- `be-automation`: bloco de fluxo que busca no catálogo usa `Products::SearchService`; entrega de imagem usa `Products::Image#delivery_url`. Ver `docs/migration/api/products.md`.
- `be-pipelines`: se os bindings `catalog.*` do MiniRacer forem migrados, faltam `Facets` e `Similar`, que não têm serviço.
