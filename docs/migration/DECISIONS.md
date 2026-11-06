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

### Casca (fe-shell)

- **Ícone do PWA provisório, feito pelo integrador:** o `favicon.svg` era o logo do Vite. Virou a marca `v.` que o app já usa no cabeçalho móvel, em branco sobre o violeta. Para trocar por uma marca oficial: substitua `frontend/public/favicon.svg` e rode `node frontend/scripts/pwa-icons.mjs`.
- **Zoom de pinça continua disponível:** sem `maximum-scale=1`. Os campos têm 16 px no celular, então o iOS não dá zoom ao focar.
- **`/` vai para a primeira área permitida** (`/dashboard` para quem tem acesso); sem nenhuma permissão, cai em `/carousels`.
- **Canal sem confirmação em 10 s** para de insistir e tenta de novo depois de 1 min. Sem isso, cada aba reenviaria o subscribe duas vezes por segundo, para sempre.
- **Avisos:** a terceira aba é "Arquivadas", como na origem. "Dispensar" não pede confirmação, porque só arquiva. O painel mostra até 50 por aba (a origem mostrava 10).
- **Menu da conta:** "Configurações" virou "Meu perfil" e "Preferências de notificação"; "Convidar pessoas" leva a `/settings/users`.
- **Atualização do PWA** é aplicada ao clicar. A origem também aplicava ao navegar.
- **De fora, por escolha:** `window-controls-overlay` (cobriria as ações do topo), a tela pré-React "Atualizando…" (script inline, bloqueado pela CSP), e animações só decorativas da barra móvel.

### Kit de componentes (fe-kit)

- **Uma tela, um título (integrador):** o título mora só na barra superior. `PageHeader` não desenha um segundo título grande: leva título e ações para a barra e deixa a descrição no conteúdo.
- **Alvo de toque global:** em aparelho de toque (`pointer: coarse`), botões ganham área invisível de 40 px, e campos e itens de menu crescem de verdade. Vale também para as telas atuais, inclusive o editor de carrossel.
- **Movimento reduzido global:** com `prefers-reduced-motion`, as animações CSS das primitivas são cortadas, e só o giro de carregamento continua.
- **`FacetedFilter` com checkboxes, sem cmdk:** no cmdk sem campo de busca, o teclado não conseguia marcar opções. Perde-se a navegação por setas.
- **`lib/api.ts` carrega `navigation-guard` por efeito colateral:** é o que protege o botão voltar nas telas com alterações não salvas, porque precisa ouvir o `popstate` antes do roteador. Se `auth.tsx` deixar de ser carregado de imediato, essa proteção se perde sem aviso.
- **`PhoneField`:** quem digita sem "+" está digitando número nacional, com país 55.
- **Densidade do `DataTable`:** é uma preferência única por navegador, não por tabela.
- **"Excluir pasta" agora pede confirmação (integrador):** antes apagava direto. O Charter exige, e os carrosséis não se perdem.

### Núcleo do atendimento (be-core)

- **Configurações que moravam no assistente** foram para `organization.settings` (`automation_*`, `business_work*`, `auto_clear_context_*`), com um endpoint novo: `/automation-settings`.
- **Removidos por dependerem do LLM ou da automação:** `tag_name_stop_phrase`, `stop_automation_phases`, `delay_response` e o debounce de `last.message`.
- **Transcrição de áudio (Whisper) mantida:** exige `OPENAI_ACCESS_TOKEN`, automação ligada e créditos acima de 0, e **não debita créditos**.
- **Pausa de canal:** na Evolution e na AIVA, o que chega durante a pausa é descartado, como na origem. A tela precisa avisar ao pedir confirmação.
- **Modelagem:** `Contact` é um objeto sobre `Chat`, sem coleção própria; `chat_tags` guarda a relação de um lado só; há uma única stream por conversa.
- **Webhooks** vão para job com o corpo cru e 3 tentativas. AIVA e Evolution ficam unificados em `/inbound/evolution/:codename`, sem RabbitMQ. A assinatura da Meta é conferida quando os segredos existem.
- **Mídia de contato com advertência agora é gravada** (a origem descartava).
- **Segurança:** tokens cifrados em repouso; credenciais fixas viraram ENV; o QR code exige `core_settings`; `/connectors` em leitura é aberto a qualquer conta, porque o chat precisa da lista de canais.
- **Criação e ativação:** `POST /connectors` com ativação falha responde `201` com `status: failed`, e `activate` também responde `200` quando o provedor recusa. Reativar pela tela continua respondendo `422`.
- **Entrada de `/connectors` é corpo solto**, sem envelope, diferente do domínio de pessoas. Documentado no contrato.
- **Widget:** o contrato passa a camelCase e milissegundos, então o bundle embutível precisa se adaptar. `window.aiva` foi mantido no snippet, com padrão `https://widget.vekoo.app`.

### Catálogo: tela (fe-catalog)

- **Preço é campo personalizado na API.** A tela o reconhece pela chave (`preco`, `preco_*`, `price`, `price_*`, `valor`) para usar máscara de moeda, mostrar na grade e riscar o preço anterior em promoção.
- **`required` e `defaultValue`** são editáveis no formulário do campo e aplicados só na tela do item. Os textos dizem que a importação não confere.
- **Fotos em item novo** ficam numa fila e sobem ao cadastrar. A origem mandava salvar primeiro. Foto por link é sempre copiada, sem opção.
- **Campo excluído:** o valor é preservado ao salvar o item, como a confirmação promete. A origem o apagava.
- **Importação em painel, sem rota:** fechar não cancela, e uma faixa na grade mostra o andamento. Depois de recarregar, não dá para voltar à tela de colunas.
- **Lote:** ativar e desativar são um PATCH por item, 5 de cada vez, porque não há rota de lote. "Selecionar todos" só aparece até 500 resultados.
- **"Testar busca" foi mantido** do `CatalogSearchProbe` da origem, porque é a mesma busca que o bloco de fluxo vai usar. A grade não usa embeddings. Se o bloco não existir, basta tirar do menu.
- **Acréscimo na API:** `POST /products/items/:id/images` aceita `image.sourceUrl`, e `GET /products/items` aceita `active=true|false`.
- **De fora:** botões de primeira e última página (o kit só tem anterior e próxima) e modelo de planilha, que a origem também não tem.

## 2. Pendências por frente

### Integrador (Fase 5)

- `.env.example` e `DEPLOY.md`: VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), `MONGODB_URI`, `db:mongoid:create_indexes` no deploy, Mongo como accessory.
- Sem caminho pela API para ligar `features`: hoje só pelo console.
- **Bloqueia deploy:** `config/deploy.yml` usa `postgres:16.10`, sem pgvector, e a migration do catálogo falharia. Trocar a imagem antes de migrar (conferir a glibc do volume de produção, para não repetir a incompatibilidade de collation vista em desenvolvimento: lá a variante `pg16-trixie` resolveu).
- `OPENAI_API_KEY` em `.env.example`, `.env.deploy.example`, `deploy.yml` e `DEPLOY.md`.
- `bin/brakeman` sai com código 5 só por causa do `--ensure-latest` (8.0.5 contra 8.1.0), o que quebra `bin/ci` independentemente do código.
- Revisão de segurança: `Products::RemoteImage` pode servir a outros downloads de URL vinda do cliente.
- Semente do catálogo usa fotos genéricas de paisagem em itens de roupa: só afeta a demonstração.
- Não testado até aqui: OpenAI real, jobs recorrentes disparando no Sidekiq, importação em alto volume, push em navegador de verdade, Safari e Firefox, arrastar arquivo de verdade para o `FileDropzone`, aparelho real (iOS e Android: área segura, teclado virtual, arrastar folha), clique em notificação do sistema, pedido real de permissão, deploy no Cloudflare.
- Variáveis novas de provedor: ver a seção "Para o deploy" de `docs/migration/api/connectors.md`.
- Revisão de segurança: `/media` não confere a organização (o acesso é por chave ou id assinado); `has_one :proxy` tem `destroy` em instância em memória.
- Não confirmados com a Meta: textos do `WabaErrorHandler` para 132005, 132007, 132015 e 132016. Nenhum provedor real foi exercitado, por falta de credenciais.
- Bundle embutível do widget (`aiva-frontend/widget`): fora desta migração; precisa se adaptar ao novo contrato e atualizar o SRI em `config/widget_releases.yml`.
- Registrar no `CLAUDE.md` que carrosséis agora ficam em `/carousels`. VAPID em produção. Se o domínio da API mudar, `connect-src` em `_headers` está fixo em `syco.vekoo.app`.

### Front (fases 3 e 4)

- `lib/api.ts` e `AuthErrorCode` não conhecem `accessRevoked` nem os códigos novos do domínio de pessoas (fe-settings-people).
- O topo pode receber aviso com `key: null`: `app-shell.tsx` não pode depender de `n.key` (fe-shell, em andamento).
- `fe-chat-core`: **a CSP precisa mudar junto com o player de áudio.** A origem usa `OggOpusDecoderWebWorker`, que compila WASM e sobe worker de blob: `public/_headers` precisa de `'wasm-unsafe-eval'` em `script-src` e `blob:` em `worker-src`, senão o áudio falha só no Safari/iOS e só em produção (em desenvolvimento não há CSP). Testar contra a CSP real.
- `fe-settings-people`: `account.locale` chega em `/me`, mas nada o aplica, e o idioma escolhido no menu não grava em `PATCH /profile`.
- Download de mídia pelo proxy do be-core: passar em `downloadFile({ fetchBlob })`.
- `fe-chat-mobile`: `use-fill-viewport-height` da origem não foi portado.

### Back (Fase 2)

- `be-inbox`: `chat_list_to` usa `team` (não `department`), e a atribuição de conversa deve filtrar pessoas `setupOnly`. API de lista de conversas e mensagens, apagar e reagir por REST, `Attachment` conforme `Media::AttachmentLookup`, `import_contacts*` e `normalize_custom_attributes`.
- `be-automation`: substituir o stub `Flows::InboundDispatcher`; debounce; eventos `human_handoff` e `contact_created`; leitor de presença (`presence.<chatId>`), para "digitando" chegar à tela; alertas por hook.
- `be-pipelines` e `be-agenda`: mapeamento em `ConnectorEventService` (usa `model.service` e `model.professional`), `ChatRelations::*`, `BackfillSystemTagsService`.
- `be-outreach`: `Outreach::Recipient` hoje é guardado por `defined?`; remover a guarda. `ChatMessage#campaign_id` já existe.
- `be-insights`: calculadores de `DailyChatStat`, que a semente não preenche.
- `be-agenda`: a origem espelhava o avatar da pessoa em `Collaborator`.
- Avisos criados pelos domínios: `AccountNotice.create!` (o `recycle.rb` já converte).
- `be-automation`: bloco de fluxo que busca no catálogo usa `Products::SearchService`; entrega de imagem usa `Products::Image#delivery_url`. Ver `docs/migration/api/products.md`.
- `be-pipelines`: o menu já consome `GET /pipelines/boards` esperando `{ boards: [{ id, name }] }`. Se o formato mudar, ajustar `hooks/use-pipeline-boards.ts`; o front invalida `PIPELINE_BOARDS_KEY` ao criar ou renomear quadro.
- `be-pipelines`: se os bindings `catalog.*` do MiniRacer forem migrados, faltam `Facets` e `Similar`, que não têm serviço.
