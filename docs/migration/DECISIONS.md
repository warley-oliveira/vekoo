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

### Pessoas: tela (fe-settings-people)

- **Padrão das telas de configuração, seguido pelas próximas:** `AreaNav` no topo, `SettingsSection` com salvar por seção, interruptor que vale na hora, edição em `SidePanel` (depois trocado pelo modal, ver "Modal no lugar de drawer").
- **Excluir pessoa fica no fim da ficha:** não aparece no menu da linha, explica o efeito e exige digitar EXCLUIR. "Revogar" é o caminho normal.
- **Campo único "Grupo de permissão"** inclui "Dono", visível só para quem é dono, com confirmação ao promover. Novo cadastro já vem no grupo "Usuário".
- **Nível `own` não é oferecido:** nenhum controlador o distingue de `all`, então dar a opção enganaria quem configura. Se vier da API, é preservado e aparece com um selo.
- **Confirmações acrescentadas:** trocar a senha de outra pessoa e perder o próprio acesso. Fechar painel com alteração pendente também pede confirmação.
- **Lista inteira no navegador:** a tela percorre todas as páginas de `/users`, porque a API não ordena e só filtra por um valor em cada filtro. Isso pesa em organização muito grande.
- **Tela nova, `/settings/organization`:** logo, nome, fuso, razão social, CNPJ e preferências do chat, sem item no menu lateral. Entra pela aba da área de usuários e pelo menu da conta.
- **Idioma anda com a conta:** a escolha grava em `PATCH /profile`. Ao abrir a sessão vale o da conta; conta sem idioma mantém a escolha local.
- **Acréscimo na API:** token de quem foi revogado responde `401 accessRevoked`, em vez de `unauthorized`, para a tela explicar o motivo. A pessoa sai sozinha cerca de 250 ms depois da revogação.

### Integrações: tela (fe-connectors)

- **Conexão:** no celular, o código de pareamento é o padrão, e não o QR. O diálogo pode ser fechado durante a espera, com aviso; só fica travado enquanto há pedido em andamento.
- **Linguagem:** `IWA-...` é trocado na tela pelo nome do tipo, inclusive nos avisos da API.
- **Ações por tipo:** widget só tem ligar e desligar, porque o site exige `active`. Canal sem provedor gravado também avisa do descarte na pausa, porque o back-end usa AIVA nesse caso.
- **Messenger foi ligado** (estava comentado na origem) e usa `VITE_FB_APP_ID`, porque o back troca o código com `META_APP_ID`.
- **Criar LeadChat não é oferecido**, como na origem; os que já existem funcionam.
- **Modelos:** variáveis detectadas do texto; máximo de 3 botões, sendo 1 de telefone e 2 de URL; URL dinâmica pede exemplo. A mídia do cabeçalho é um campo de URL pública por enquanto.
- **De fora:** histórico de desconexão (a API não expõe), e a documentação completa do widget virou um guia resumido, porque depende do bundle.
- **CSP:** `connect.facebook.net` em `script-src`; `www.facebook.com` e `web.facebook.com` em `connect-src` e `frame-src`. O `frame-src` é precaução: nenhum frame foi observado em teste.
- **Acréscimo na API:** o código de pareamento se perdia (o canal não o reenviava a quem assinava depois, o `GET` não o trazia, e o `activate` não aceitava `phoneNumberPairing`). Corrigido, com 10 specs. A chave `pairingCode` vem do conhecimento da Evolution v2, sem confirmação em instância real.

### Chat e contatos: API (be-inbox)

- **Modelos do copiloto:** Opus 5.5 no agente e Haiku 5.5 em resumo e qualificação, com `fallbacks: :default`, ou seja, a própria API pode responder com outro modelo se o principal não puder atender. Para desligar, tire o parâmetro em `Ai::Chat.converse`.
- **Custo de IA:** 2 créditos por mensagem do copiloto (devolvidos se nada útil sair) e 1 por sugestão de resposta. `aiCosts` em `/catalog` ainda não lista esses dois.
- **Contatos unificados sempre ligados:** `unified_contacts_enabled` não existe mais. A lista clássica segue em `/chats`.
- **`chat_list_to` vale em tudo:** conversa por id, mensagens, unificados, contatos, lote, exportação, busca, copiloto e, depois da integração, os canais de WebSocket. Fora do nível, responde 404. Na origem, só a lista v2 respeitava.
- **Normalização de campo** sem `dryRun` só mostra a prévia (na origem, aplicava de vez). Para aplicar, `dryRun: false`.
- **Comportamento novo:** áudio e anexo enviados pausam a automação; mudar a automação à mão cancela o religamento agendado; mensagem apagada sai da prévia da lista.
- **Unicidade:** chave de campo (estável ao renomear), atalho de mensagem rápida e nome de etiqueta.
- **Exportação:** arquivo no Active Storage, removido 5 minutos depois de o link de 1 hora vencer. Fórmulas no CSV são neutralizadas. Exportação na hora vai até 5000 linhas.
- **Formato:** `POST` em `bulk-delete` (em vez de `DELETE` com corpo); `/chats` e `/unified-contacts` sem `total`.

### Motor de scripts (be-engine)

- **`--jitless` no processo inteiro:** é o que faz os limites valerem. 5 milhões de iterações levam 36 ms em vez de 3 ms; um script típico não muda.
- **Limites por execução:** 15 s (até 60 s se pedido), 64 MB de heap (até 256 MB), 50 chamadas de rede, 5.000 chamadas a extensões, 5 MB por resposta. Não há cota por organização: um script em laço pode encher `collection.*` ao longo do tempo.
- **`fetch` só nas portas 80, 443, 8080 e 8443**, e nunca para a rede interna. Integração em outra porta quebra; liberar é uma linha em `Limits`.
- **Fora do ambiente JS:** `WebAssembly`, `SharedArrayBuffer`, `Atomics` e `Intl.Segmenter`. Resultado sempre em JSON: `Date` e `BigInt` viram texto, função some, objeto cíclico é erro.
- **Fila própria para scripts (integrador):** processo separado, `config/sidekiq_scripts.yml`, para um script não derrubar quem entrega mensagens.
- **`setFupEnabled` e `setStepperStage`** existem, mas respondem "Not supported". `catalog.image` agora é URL absoluta.

### Calendário: API (be-agenda)

- **Sem rota de exclusão de calendário:** a origem respondia 204 sem apagar nada, e apagar de verdade levaria o histórico junto. Precisa de decisão de produto. `DELETE /calendar-events/:id` arquiva.
- **Lembretes:** texto é grátis; com IA custa 1 crédito e cai no texto se falhar. Passo de sequência só com instrução não envia nada se a geração falhar.
- **Modelo:** fuso IANA em vez de deslocamento inteiro; avatar da pessoa resolvido na leitura, sem espelho.
- **Google Agenda:** fica fora de `/connectors`, com `state` assinado e o token do canal conferido. Falha ao abrir o watch não desfaz a conexão. O link do Meet chega pelo tempo real.
- **Mantidos como na origem:** `enrollAll` não confere lotação, `create_booking` não confere a janela, lembrete ao profissional exige conversa.
- **Defeitos da origem corrigidos** (cada um com spec): recorrência e fim de aula errados, aula avulsa que nunca aparecia, IDORs em turmas e distribuição, horários oferecidos fora da janela e nas folgas, conflito contando outras organizações, lembrete em agendamento arquivado, entre outros.

### Campanhas: API (be-outreach)

- **No máximo uma vez:** queda no meio de um envio, ou recusa por erro passageiro, fica `failed` e não é tentada de novo. Na dúvida, o código é `interrupted`. Duplicar pareceu pior do que perder. Testado com `kill -9` no worker: ninguém recebeu duas vezes.
- **Um job por canal, em vez de um por destinatário:** cada execução envia uma mensagem e agenda a seguinte. Com 50 mil destinatários, a fila agendada do Redis ficou com 3 jobs.
- **Limite diário é do canal**, somando todas as campanhas, no fuso de Brasília. Na origem era por campanha.
- **Pausa automática:** a campanha pausa sem gastar ninguém e avisa quem a criou, quando nenhum canal consegue enviar (`noActiveConnectors`) ou depois de 5 falhas seguidas (`channelFailing`; esse canal só volta quando uma pessoa retoma).
- **`flowId`:** conversa nova com fluxo nasce com automação ligada; sem fluxo, herda o padrão da organização. A origem sempre ligava.
- **Tetos novos:** 2 buscas simultâneas na plataforma e 5 em andamento por organização; 10 por minuto nas rotas síncronas; 16 KB de variáveis por pessoa; 50 mil destinatários por importação.
- **Duas formas do 9º dígito contam como uma pessoa**, com índice único em `phone_key`. Rodízio de mensagens por posição no canal. Cancelar campanha agendada agora é permitido.
- **Defeitos da origem corrigidos:** `Integration::Base.where(:_id.in => ids)` sem escopo deixava disparar pelo canal de outra conta; canal desconectado queimava a lista inteira; retomar zerava o limite diário; a recuperação reenviava mensagem que já tinha saído; `send_days` vazio prendia a thread para sempre; `PATCH` parcial limpava a mídia.
- **Envio sem resposta do provedor não se repete (integrador):** vale para todo envio, inclusive o humano pelo chat. Um timeout de leitura não diz se a mensagem saiu. Resposta de erro do provedor continua sendo repetida, como na origem.

### Mensagens rápidas, anexos e campos: tela (fe-settings-content)

- **Variáveis em mensagem rápida são novidade:** a origem não trocava nada no texto. `{{nome}}`, `{{primeiro_nome}}`, `{{telefone}}`, `{{atendente}}` e as chaves dos campos, trocadas pelo composer ao inserir a mensagem.
- **Normalização de campo:** a sugestão automática só vale em campo Número (em data, `1989-03-14` viraria `1989`); "Transformar em Número" só aparece se todos os valores ficarem numéricos; o campo de destino novo nasce ao aplicar; valor novo em campo de lista entra nas opções.
- **Excluir campo:** o texto diz que os valores continuam guardados, como a API documenta. A origem dizia que se perdiam.
- **Opções de campo que já é lista** valem na hora. Remover regrava a lista inteira, então duas pessoas ao mesmo tempo ainda podem se atropelar.
- **Tiptap:** primeiro uso no repositório, com chunk de 439 kB (138 kB gzip), carregado só nesta tela.
- **Ordem padrão das mensagens rápidas:** nome de A a Z; na origem, mais recentes.
- **De fora:** visibilidade pública/privada da mensagem (o back da origem ignorava), ordenar por conteúdo.
- **Acréscimo na API:** `GET /attachments?kind=image,video,audio,document`.

### Envio de mensagens (integrador)

- **O que uma pessoa escreve chega como foi escrito.** O envio tirava aspas, til, crases, colchetes e sinais do texto de quem atende (`Copo d'água, "gelado"` chegava como `Copo dágua, gelado`), e convertia markdown, enquanto a conversa guardava o original, então ninguém via. A limpeza era para texto de LLM e fica só para ele: vale para o chat e para os lembretes escritos à mão. **Bloco de fluxo com texto escrito à mão precisa do mesmo tratamento** (`verbatim: true`).
- **Anexo citado que não existe mais** não vaza o código `attachment_id_...` para o cliente: o resto da mensagem segue, e o motivo fica em `statusMessage`. Sem nada para enviar, a mensagem é uma falha.
- **`PUT /chats/:id/attributes` soma ao mapa**, e `null` tira a chave. Substituir tudo, como na origem, apagava o que um fluxo gravou enquanto a tela estava aberta.
- **Variáveis de evento de conector voltaram a funcionar:** o código lia `definition.type`, que o modelo não tem, então toda variável saía `null`. Agora `{user.<id>}` lê o campo da conversa, ou o padrão dele; `{system.<id>}` lê o padrão; e o que a resposta traz é gravado no campo da conversa. Era o único uso de `defaultValue`.

### Dashboard, funis e personalizados: API (be-insights)

- **Cards que saem do Dashboard:** ranking de assistentes (a mensagem não guarda `flow_id`), uso de tokens, créditos e custo médio (ninguém grava tokens, e não há crédito por dia). "Equipe e assistentes" vira "Equipe".
- **Cards que mudam:** "Autonomia da IA" vira "Autonomia da automação", calculada como conversa com automação e sem pessoa, sobre as conversas iniciadas. `MetricCard` perde follow-ups.
- **Contagem:** mensagem enviada do celular conta como pessoa (a origem não contava), e campanha fica fora de automação. O rollup é da organização inteira, mas os funis do dashboard seguem a visão de quem olha.
- **Agregações usam `hint`:** sem o índice, a consulta é recusada em vez de varrer. Exige `db:mongoid:create_indexes` antes do tráfego.
- **Funis:** teto de 50 conversas por coluna (a origem ia até 100). Excluir uma etapa manda a conversa para "Sem etapa".
- **Dashboards personalizados:** cada fonte exige a própria permissão, além de `custom_dashboards`, que substitui o `super_user` da origem. Conversas, contatos e mensagens passam por `visible_to`. 90 dias de período por padrão. Recusas novas: `contains` só em texto, lista só em `in` e `nin`, número e data validados.
- **Copiloto:** ferramentas de agenda exigem `calendar`, e as de funil exigem `funnel`. `qualify_appointments` analisa até 10.

### Contatos: tela (fe-contacts)

- **Importação, regras novas:** o código 55 vem ligado por padrão; número com `+` não ganha 55; o zero de discagem é removido; número repetido no arquivo fica de fora. Linhas com problema ficam de fora e são listadas. Na origem qualquer aviso travava, embora o texto dissesse que as linhas seriam ignoradas.
- **Exportação na hora** fica indisponível com mais de 150 ids marcados à mão, porque a URL não comporta. A de segundo plano guarda o link por conta no navegador até vencer.
- **Confirmações:** fechar, reabrir e automação em uma linha só não confirmam, por serem reversíveis; em lote, confirmam.
- **Escolha de colunas** fica no navegador, não na URL. Telas menores que 1500 px escondem aos poucos marca do canal, avatar, prévia e segunda etiqueta, para as colunas padrão caberem a partir de 1280 px.
- **Filtros aplicam na hora**, sem o botão "Aplicar" da origem. Sai a coluna "Assistentes"; o canal ocupa o lugar.
- **Acréscimos na API:** `GET /contacts` com `teamIds[]`, `assignedUser` com vários valores e `conditions`; a linha traz `customAttributes`; `POST /contact-imports` aceita `fileName`; `includeCountryCode` não confunde mais o DDD 55 com o código do país.

### Pipelines: API (be-pipelines)

- **Gatilhos:** `run_code` é novo no gatilho e exige a permissão `flows`. Gatilho de etapa vale para qualquer evento. `toggle_automation` agora pausa a automação do fluxo. Cada ação registra o próprio status; um gatilho com código gera duas execuções; execuções ficam 90 dias; falha vira alerta da categoria `pipelines`.
- **SLA e prazo:** SLA conta por `stage_entered_at`, uma vez por passagem, sem negócios fechados. Prazo dispara uma vez por data e só para o que venceu depois de o gatilho existir.
- **Visibilidade:** a dona da organização substitui o `super_user`. Apagar o último grupo liberado mantém o quadro restrito.
- **Comentários:** respostas têm um nível só; o autor pode ser a automação; como na origem, qualquer pessoa com acesso ao card apaga comentário alheio.
- **API:** reordenar só vale dentro da etapa; `/cards` é paginado; rotas novas para anexos e observar card; `avgTimePerStage` foi redefinido. Modelos de quadro nascem no primeiro uso, em pt-BR.
- **Tetos:** 50 tags, 64 KB de valores de campo, 256 KB de descrição, 20 mil caracteres por comentário, 10 arquivos, 25 MB.
- **Defeitos da origem corrigidos:** IDORs entre organizações em `column_checks#toggle`, `Conversation.find`, `kanban_column_id`, `parent_id` e responsável; SSRF e escape de JSON no webhook; injeção de tokens nas mensagens; `deal_reopened` nunca disparava; reordenar pulava as travas; os jobs de SLA e prazo nunca estavam agendados; corrida no rodízio.

### Chat: tela (fe-chat-core)

- **"Todos" são contatos unificados**, sem etiquetas nem responsável na linha, porque a API não manda esses dados. Aba de canal é a lista clássica.
- **Caixa de texto simples**, com linhas `📎 Nome` para anexos citados, em vez de editor rico. Colar e soltar arquivo passam pelo diálogo de anexos. Gravação de áudio limitada a 15 minutos.
- **Variável sem valor** em mensagem rápida continua à vista, com aviso: o primeiro Enter seleciona a variável, e o segundo envia assim mesmo.
- **"Tentar de novo"** apaga a bolha que falhou (para mim) e reenvia. Envio otimista desiste em 20 s. Reação vai por REST. Excluir uma mensagem usa `bulk-delete`.
- **Conversa aberta marca como lida.** O visualizador percorre toda a mídia carregada.
- **Rolagem:** o histórico não desenha nada acima da tela; as antigas descem 20 linhas antes do topo. A rolagem automática é instantânea e a animação fica na bolha, porque com rolagem animada a posição saltava cerca de 700 px.
- **Reconexão:** pede `request_recent`, com conferência por HTTP se não houver resposta em 6 s, ou em 15 s com o socket fora.
- **Áudio de CDN externo** passa por `/media/download`, porque `connect-src` bloquearia o `fetch`. Depende de `MEDIA_PROXY_ALLOWED_HOSTS`.
- **Com dedo não há lápis:** "Editar nome" fica no menu. A prévia do menu `/` reusa `QuickReplyPreview`, com a bolha verde-suave de lá.
- **Fora, por não existir aqui:** modo depuração (`context-clear`, `context-fup`: sem `super_user`) e filtros por etapa do funil e por assistente (`Chats::Filters` não os conhece).
- **Acréscimos na API:** `lastMessageType` em `/unified-contacts`; mudar só `status_message` agora é transmitido; dividida em partes, o aviso de anexo citado vai na última parte; o aviso é uma frase (`connectors.messages.cited_attachment_missing`), com o id só no log.
- **Acréscimos do integrador:** falha de rede no envio mostra "O canal não respondeu. Tente de novo em instantes." (`Connectors::SendFailure`), em vez do erro cru em inglês; recusa do provedor continua como veio. `presence.update` da Evolution agora chega a `ChatChannel`, e é o único provedor que informa "digitando".

### Dashboard e funis: tela (fe-dashboard-funnels)

- **Comparação com o período anterior:** um segundo `GET /dashboard` dá a variação e a linha cinza. Some em "Hoje" e quando o período anterior está incompleto. Não existe na origem; se a chamada extra incomodar, sai sem afetar o resto.
- **Mapa de calor** é média por dia da semana e hora. A origem tinha uma linha por data, o que daria 90 linhas em 90 dias.
- **Tendência** agrupa por semana acima de 45 dias (31 no celular) e por mês acima de 180. Períodos de 180 e 365 dias foram somados aos da origem.
- **Gráficos:** canais e ranking em barras ranqueadas, no lugar de rosca; autonomia e cancelamento como medidor; comparecimento em cinza e um vermelho, porque verde e vermelho não passam como par para quem não distingue cores. O violeta só aparece na tendência, no medidor de autonomia, no pico das colunas e no mapa de calor.
- **Etapa excluída no painel de edição:** o aviso vem ao salvar, com "Desfazer". No menu da coluna, a confirmação é imediata.
- **Busca no quadro do funil** é acréscimo, pela regra do Charter para coleções. Funil não se reordena, porque a API ordena por nome; só etapas.
- **Painel da conversa no funil** é mais simples que o da origem: histórico só leitura, com mídia como rótulo e "Abrir conversa" para o resto; agendamentos só como lista. O quadro não tem tempo real, como na origem: há um botão "Atualizar".
- **Fora:** ranking de assistentes, follow-ups, tokens, créditos, custo médio e a alternância "Avançado". "Resolução autônoma" se junta a Autonomia, porque é o mesmo número.
- **Acréscimo na API:** `GET /funnels/:id/board` com `q`, `assignedUser` e `tagIds[]`, pelo critério de `GET /chats`.

### Fluxos, ferramentas e webhooks: API (be-automation)

- **Modelos e crédito:** `main` é Opus 5.5 e `fast` é Haiku 5.5, sem `temperature`. Crédito: main 2, fast 1, juiz incluído na rodada que responde, saída sem resposta 1, transcrição por URL 1. Falha devolve o crédito daquela chamada.
- **Execução:** bloco interrompido no meio não repete, vira `failed` com alerta. Debounce de 3 s, segurando até 30 s enquanto o contato digita (a origem não tinha teto). Uma execução viva por fluxo e conversa: mensagem durante espera por tempo não retoma nem recomeça. Pessoa assumindo cancela espera por tempo. Todos os fluxos que casam disparam, como na origem.
- **Texto da IA:** quebra por parágrafo e link; anexo inventado pelo modelo sai do texto. O integrador manteve o apóstrofo dentro da palavra na limpeza: `d'água` virava `dágua`.
- **Métricas:** tokens só na resposta (juiz e blocos sem mensagem ficam de fora); `usage_prompt_tokens` inclui o cache; `flow_id` não sai na API.
- **Pipelines e funil:** no teste do editor, os blocos de Pipelines não mexem em quadro: registram `skipped` e avisam `pipeline_skipped`. Blocos de negócio nunca param o fluxo. `pipeline_update_deal` pode mudar para etapa de outro quadro da organização, sem travas. `set_funnel_stage` não tira do funil.
- **Nomes públicos:** blocos com prefixo `pipeline_`, `stage_id`, `link_chat`, `card_source.type: "chat"`, `assign_team`, `finalize_chat`, `{{chat.*}}`. A API JS (`kanban.*`, `appointment.*`) não mudou. Cabeçalhos `X-Vekoo-*` no lugar de `X-Aiva-*`.
- **API:** `human_handoff` dispara em `pause_automation_for_human!`, e não em `PATCH /chats`. `tool_ids` vazio é nenhuma ferramenta (na origem, todas). `http_request` com status ≥ 400 sai por `error`. Hook nasce em `test`. Entrada de webhook: 1 MB e 1200 por minuto.
- **Novos:** `HookAction::HttpRequest`, `POST /flows/:id/executions`, blocos `catalog_search` e `set_funnel_stage`, alertas `flow_attachment_missing` e `flow_funnel_stage_missing`.
- **Retenção:** execução 30 dias, teste 1 dia, pergunta parada 30 dias, 10 mil logs por hook. `hook_logs` exige `core_settings`.
- **Fora da origem:** `lib/flow_engine`, `FlowChatSandboxChannel`, `FlowChat`, `DecisionToolBuilder`, `useAdminToolCatalog` e o CRUD de admin, `setup_follow_ups`, `next_commercial_time`, bypass de `super_user` e `partner`, `PlanLimitEnforcement`.
- **Defeitos da origem corrigidos:** `ask_question`, `wait_for_message` e `send_interactive` repetiam para sempre ao retomar; `first_message` disparava em toda mensagem, e `keyword` não conferia a palavra; `loop` não iterava; `tool_ids` em branco dava todas as ferramentas; IDORs no canal de teste, etiquetas, anexos, departamentos, contas e etapa de `create_deal`; SSRF em `http_request`; `/tools/:id/test` rodava no Puma.

### Chat: painel, copiloto e lote (fe-chat-details)

- **Permissão ampliada no lote:** quem só tem `chat` agora age em lote na lista do chat, sempre preso a `chat_list_to`. Em `/contacts/bulk-*` vale `chat` ou `contacts`.
- **Terceira coluna** só com o espaço do chat acima de 62rem; abaixo disso, o painel entra por cima da conversa.
- **Modelo de mensagem:** só `approved` aparece na lista. Toda variável é obrigatória, e o exemplo nunca vai no lugar do valor. `{{nome}}` e chaves de campo já vêm preenchidos; `{{1}}` oferece o nome como sugestão.
- **Copiloto:** é uma aba do painel, com botão na lista, em vez de substituir a conversa. Custos 2 e 1 fixos no front, porque `aiCosts` não os lista. 180 s sem sinal viram erro. Conversas ficam no navegador: 20 por pessoa, 100 mensagens cada, sem entrada e saída das ferramentas. Tentar de novo só a pedido, com confirmação se já agiu.
- **Notas:** salvar é explícito, e o rascunho fica em memória por conversa. **Campos:** limpar confirma; salvar não dá toast.
- **Lote na aba "Todos":** marcar um contato marca as conversas dele que casaram com o filtro. "Selecionar todas" alcança só as carregadas.
- **Sessão de 24 horas** só aparece nos canais em que ela trava o envio. Editar etiqueta é pelo lápis no seletor, não por clique no chip.
- **Fora:** seletor de fluxo por conversa, porque aqui os fluxos disparam por gatilho, sem conversa presa a um fluxo (só `outreach_flow_id`, da campanha); `LlmQuotaResetDialog`; escolha de provedor de IA; follow-ups, supressão e "reativar", que a API de ações agendadas não tem.
- **Risco herdado da origem:** etiquetas de sistema continuam editáveis. Renomear `aguardando-operador` quebra a regra de tirar a etiqueta ao responder.
- **Acréscimos na API:** `GET /pipelines/cards?chatId=`; `render_message_text` lê `parameter_name` e preenche a variável do cabeçalho.

### Calendário: tela (fe-calendar)

- **Fuso:** a grade mostra hora de parede, e cada evento cai no fuso do próprio calendário. Com calendários de fusos diferentes, a mesma linha não é o mesmo instante, e a tela avisa.
- **Semana não aparece no celular:** abaixo de `md` ficam agenda, dia e mês, como na origem.
- **Título do agendamento** é opcional, mas exige contato, serviço ou título. **Calendário de turmas** não recebe agendamento: nele se cria "Aula avulsa".
- **Presença** só aparece depois de começar ou se já estiver marcada; na origem, sempre. **Inscrição na turma** lista todos os horários da grade, com os de mesma hora pré-marcados; a origem só deixava mesma hora. Participantes em ordem de nome.
- **Áreas:** o botão insere `{{colaborador}}`, e não `{{profissional}}`; serviço novo nasce repartido por igual; turma nova nasce com a grade vazia; avisos ao colaborador ficam escondidos em calendário de turmas; toda escrita de sequência relê a lista antes de gravar; salvar é por seção, sem barra fixa de "não salvas".
- **Fora ou menor que a origem:** `text_color` na grade; `role` do colaborador, que a API não tem; aba Mensagens só leitura, com as últimas 50; toast de evento novo só para agendamento; excluir calendário (decisão de produto em aberto).
- **Acrescentado:** aula avulsa, cancelar e remarcar aula, arquivar, horários livres e conflito, desfazer depois de arrastar.
- **Acréscimos na API:** `SchedulerBalancer` não escolhe quem tem 0% na distribuição. `Ai::Run`: quem recebia `busy` soltava a vaga de quem estava gerando.

### Pipelines: quadro e card (fe-pipelines-board)

- **Filtros:** rápidos no cliente no quadro; avançados no servidor; na lista, tudo compilado em um `filter`.
- **Soma da etapa sem os perdidos** (a origem somava). **Perdido abre diálogo de motivo opcional** (a origem marcava na hora pelo card).
- **Abrir card entra no histórico:** Voltar fecha o card; a origem não criava entrada. **Criar na etapa mantém o campo aberto**, para criar vários em sequência.
- **"Negócio" saiu da tela:** a seção virou "Venda", e os presets dizem "cards" ("Cards parados"), diferente dos textos da origem no contrato.
- **Comentário só com arquivo:** o corpo vira o nome do arquivo, porque a API exige corpo. Só comentário raiz se fixa.
- **Card de vendas:** título em destaque e empresa ou contato abaixo (a origem fazia o inverso); prazo tem preferência sobre fechamento previsto. "Criado em" fora das colunas padrão, para a lista caber em 1440 px.
- **Fora ou menor que a origem:** conversa embutida no card (é link para `/chat/:chatId`, como pedido); barra de comandos do editor, tabela, cor, realce e título 1, porque as extensões não estão instaladas (conteúdo antigo abre e volta igual); grupos recolhíveis na lista (viraram coluna e ordem por etapa, por causa da paginação no servidor); no card, dias na etapa quando não está parado, "Sem valor", data de ganho ou perda; "Etapa N de M" e barra de probabilidade no painel.
- **Acréscimos na API:** `GET cards` com `sort` e `direction` (`Pipelines::CardSort`), `GET activities` com `type` por vírgula, e o texto puro da descrição corrigido (negrito partia a frase em duas linhas, e dois parágrafos saíam colados).

### Pipelines: administração (fe-pipelines-admin)

- **Metas, regra de fechamento, `required` e filtro de situação** só aparecem em quadro de vendas.
- **Quem não tem `flows`** liga, desliga e exclui gatilho com código, mas não edita. O integrador fechou também a leitura: a API não devolve mais o texto do código a quem não tem `flows`.
- **Condições que a tela não conhece** são preservadas ao salvar. `create_card` só aponta para outros quadros, como na origem. Tirar um quadro do arquivo não pede confirmação.
- **Sem contador "Disparou Nx"**, que a API não devolve: a tela mostra a última execução. Filtro "Ignorado" saiu, porque o motor novo nunca grava `skipped`. `CodeRunnerPopover` não veio: o contrato não tem rota para testar gatilho.
- **Acrescentado:** `run_code` nos gatilhos, condições na frase, filtro de período, ranking e excluir arquivados.
- **Acréscimos na API:** `Pipelines::BoardPeriodMetrics`, `?from&to` em `metrics` (com `422 invalidPeriod`) e `?status&triggerId` no histórico.

### Fluxos: tela (fe-flows)

- **Excluir bloco não pergunta nada:** mostra um aviso com "Desfazer".
- **"Desligar" um fluxo** usa arquivar, e ligar de novo usa `unarchive`, voltando à versão publicada sem publicar o rascunho.
- **A lista baixa todas as páginas e filtra no cliente.** Duplicar é feito no cliente, com desfazer se falhar.
- **Conflito de edição** é detectado no cliente, comparando `updatedAt` ao voltar o foco e a cada 60 s, porque a API não tem trava.
- **Conferência mais rígida que a API:** bloco sem configuração impede publicar, e bloco solto só avisa. O gatilho é trocável, mas não pode ser excluído. O salvamento automático não altera o gatilho de um fluxo publicado; isso só acontece ao publicar.
- **Editar no celular de verdade**, e não só leitura, porque a origem deixava: tocar abre o bloco na tela toda, e cada saída livre oferece "Adicionar bloco".
- **Modelos** renomeados para tirar "agente" e "tools" (mesmos slugs). "Recuperação de carrinho" perdeu a segunda metade, que dependia de uma saída `timeout` que o motor não tem.
- **Mudou ou saiu em relação à origem:** salvar virou automático + Ctrl+S; destaque ao passar o mouse virou clique que foca o bloco; editor rico do prompt base virou texto simples; minimapa só a partir de 12 blocos; `temperature`, seletor de assistente no teste e categoria escrita no bloco saíram.
- **Acréscimos na API:** `stats` na lista, `POST /flows/:id/unarchive`, `GET /flows/:id/versions` e `/versions/:versionId`, `contactName` e `counts` nas execuções.
- **Monaco no próprio pacote**, fora do precache, porque a CSP bloqueia o CDN padrão da biblioteca. Conferido contra a CSP real.

### Campanhas: lista e monitor (fe-campaigns-list)

- **"Respondidos" é dado novo**, que nem a API nem a origem tinham: a primeira mensagem do contato depois do envio conta (`Chat#outreach_recipient_id`, `Recipient#replied_at`, `Campaign#replied_count`), e quem recebeu duas campanhas responde à última. Toca uma linha em `Chats::InboundFlow`; erro ali não bloqueia a mensagem.
- **Pausar não confirma:** o aviso traz "Retomar". Na origem confirmava. Cancelar e excluir confirmam.
- **Veredito do monitor:** só falha pesa, porque entregue e lido chegam atrasados, e há canal que nem avisa. "Algumas falhas" é ≥ 5% e ≥ 2; "muitas" é ≥ 20% e ≥ 3.
- **Clique em rascunho** vai direto para `/edit`. Lote no cliente, 4 por vez; "Duplicar" só com uma campanha selecionada. "Cancelada" em tom neutro.
- **Lista própria de campanhas**, em vez de `DataTable`, para só a linha que mudou redesenhar.
- **Fora:** `FeatureLocked`, `PackageLimitAlert` e `UpgradePromptDialog` (planos fora do escopo; a permissão decide); vídeo "Ver como funciona", que a CSP bloqueia e mostra o produto antigo. `NewCampaignFab` virou botão no cabeçalho, e o anel de progresso virou barra.
- **Acréscimos na API:** `GET /campaigns?sort=`, listas em `status` e `connectorId`, `recipients?status=replied`, `place-extractions?status=a,b`.

### Chat no celular (fe-chat-mobile)

- **Mesma tela, mesmos stores:** a árvore separada da origem não veio. As peças móveis entram por um contexto de variante, e a tela larga não baixa nenhum arquivo delas.
- **Voltar do aparelho desfaz um passo de cada vez:** painel, conversa, lista. Cada camada é uma entrada no histórico. Por enquanto só no chat.
- **Emoji não é folha:** é um painel encaixado no lugar do teclado, porque uma folha cobriria o composer. Anexos, mensagens rápidas e ações são folhas.
- **Celular deitado acima de 768 px** continua em uma coluna. O painel do contato entra pela direita, como a conversa; na origem subia de baixo.
- **Áudio:** soltar envia, deslizar para a esquerda descarta, para cima trava. Voltar com menos de 5 s descarta direto, com 5 s ou mais pergunta. Lixeira e deslizar para cancelar não confirmam, porque o gesto é deliberado.
- **Conversa desmonta ao sair**, e reabrir não faz pedido, porque o histórico mora no store. Na origem ficava montada.
- **Acrescentado:** deslizar para responder, apagar por grafema no painel de emoji, selo "API" na linha, gesto na foto.
- **Cortado como enfeite:** paralaxe da lista, troca animada enviar/microfone, negrito no trecho buscado. `use-fill-viewport-height` não veio: a conversa fica presa ao viewport visual por `--app-vh` e `--app-vv-top`.
- **Fora da área:** `BottomSheet` usa `useSheetFocus`, e abrir folha com busca não sobe mais o teclado, no app todo.

### Ferramentas e webhooks: tela (fe-tools-webhooks)

- **Ferramentas:** a cor do catálogo é ignorada, e o ícone é monocromático, pela direção visual. Instalar é um clique quando não há credencial. Dá para testar função travada. Testar salva antes, e os valores de teste ficam guardados com a função. No celular, o código abre atrás de um aviso com "Abrir o editor".
- **Webhooks:** não ativa sem número do contato nem com alteração por salvar. O aviso de endereço interno não bloqueia salvar. O teste sai do navegador e pede confirmação quando o webhook está ativo. Remover uma ação usa "Desfazer", porque só vale ao salvar. A validação é mais rígida que a da origem. Cabeçalhos de segredo são mascarados pelo nome.
- **Mudou em relação à origem:** JSON Schema cru virou editor estruturado com importar JSON; seções por categoria viraram grade única com filtro; salvar fica no editor em vez de voltar à lista; renomear é em diálogo.
- **Fora:** catálogo interno e superusuário; `ToolsHubPage` e `HubStatsBar`, que eram do domínio de assistentes; cobrança; "Reenviar" e busca textual nos logs, que a API não tem.
- **Acréscimos na API:** excluir um webhook resolve o alerta aberto, que antes ficava preso no número do menu; a mensagem de endereço recusado é em linguagem simples, e genérica de propósito.

### Idioma em chunk próprio (integrador)

- **Só pt-BR vem no pacote inicial.** Os dois idiomas juntos eram 841 KB (243 KB em gzip), metade do JavaScript da primeira visita, e crescendo a cada domínio. O inglês desce em chunk próprio, e `main.tsx` espera `i18nReady` antes de desenhar: em inglês, a primeira tela demora o tempo desse chunk, sem piscar em português. Conferido ao trocar pelo menu da conta. pt-BR segue tudo no pacote inicial (464 KB, 138 KB em gzip): carregar por domínio seria o próximo passo, mas há telas que usam texto de outros domínios.

### Campanhas: assistente (fe-campaigns-wizard)

- **Quatro passos, com o público primeiro:** Para quem, O que dizer, Quando, Revisar. O nome da campanha vem automático e se edita na revisão; o canal fica no passo da mensagem.
- **Tutorial de 9 slides saiu:** o ensino está no próprio fluxo, em dicas sobre variáveis, versões, ritmo, número e o que acontece depois de lançar.
- **Destinatários são gravados no servidor na hora**, e dá para tirar por origem, por pessoa ou todos. O rascunho salva incompleto (`messages_present` só vale fora do rascunho), e lançar e agendar conferem tudo.
- **Importação:** o 55 vem ligado (na origem, desligado); linha ruim não bloqueia (na origem, bloqueava); coluna extra vira variável.
- **Envio:** janela sem atravessar a madrugada, com "O dia todo"; ritmo com calma 3–6 min, equilibrado 1–2 min (padrão da origem), mais rápido 1–1,5 min; detalhado de 1 a 30 min, com o piso de 1 minuto da origem, embora a API aceite menos. 500 por dia e por número, 10 versões, arquivo de 200 MB, mídia de 100 MB.
- **Aviso de volume** só a partir de 1.000 pessoas (na origem, sempre). **Data agendada** fica no aparelho até agendar, e não é copiada ao duplicar (na origem, era). Custo em texto fixo, sem crédito por mensagem; em modelo, avisa que a Meta cobra.
- **Modelos com variável em cabeçalho, botão ou nomeada** aparecem desabilitados, com a explicação, porque a campanha só preenche o corpo por posição.
- **Fora:** filtro "Assistente" nos contatos e a rota síncrona `apify-places-search` (a busca vai por `/place-extractions`).
- **Acréscimos na API:** `POST /campaigns/:id/schedule`, `GET /campaigns/:id/recipient-summary`, `DELETE /campaigns/:id/recipients` (com `?origin=`) e `/recipients/:recipientId`; `ChatAudience` usa a mesma busca da lista de contatos.
- **Integrador:** a CSP libera `accounts.google.com` e `apis.google.com` em `script-src`, `sheets.googleapis.com` em `connect-src`, e `docs.google.com` e `accounts.google.com` em `frame-src`, para o seletor de planilhas. Não testado contra o Google real.

### Dashboards personalizados: tela (fe-custom-dashboards)

- **Entram como abas do Dashboard**, em `?tab=<id>`, sob o mesmo filtro de período, e a criação em `?tab=new`. Ordem: favoritos, depois do mais antigo para o mais novo. Favoritar é novo na tela.
- **Grade de 12 colunas em qualquer largura**: colunas por tamanho de tela da origem saíram, porque o que se arrastava numa tela média sumia ao salvar. O celular permite adicionar, editar e remover, sem mover, com aviso.
- **Números:** nunca coloridos; a regra vira selo, e no medidor vale sobre o percentual da meta. Fórmula em que nenhum passo achou nada mostra o traço e "Sem dados", e não "0,0%". `number_trend` usa o período inteiro no valor e o anterior na variação.
- **Gráficos:** pizza e rosca até 6 partes, com sugestão de barras acima disso; lacuna de tempo preenchida com zero; série única em barras na tinta neutra.
- **Dados:** CSV feito no navegador, porque fórmula só existe na tela; cards carregam ao aparecer; consultas iguais não repetem em 25 s; conflito é conferido antes de salvar por cima.
- **Fora:** "Criar com IA", que não tinha back-end; o assistente de 3 passos virou uma tela só, com prévia; `toggle_public`, que não veio na API. "Desempenho da IA" virou "Automação"; o modelo "Vendas" é novo.
- **Acréscimos na API:** fonte `pipelines`, com os filtros `pipeline_status` e `pipeline_stage`, respeitando `Pipelines::CardVisibility`. Corrigidos: salvar widgets com o mesmo id não gravava nada; `decimal` saía como texto; a consulta crua vinha sem `labels`; empate no `sort` cortava valores diferentes a cada consulta; "maior primeiro" no Postgres abria pelos sem valor.

### Acabamento (fe-polish)

- **Voltar por camadas no app todo** (`lib/back-stack.ts`), **o item de maior risco desta rodada:** troca `history.pushState` e `replaceState` em tempo de carga, e só age com a casca do celular montada. Cada coisa aberta por cima da tela vira uma entrada no histórico, inclusive menus e seletores. Testado só em emulação de 390 px, em Chrome sem tela. Para reverter, juntos: `2c1f507`, `b7ba6cf` e `517e40e`, que no histórico integrado mantêm o assunto.
- **Pílula de metas** no topo do quadro, só em pipeline de vendas, lendo a API depois de o quadro desenhar. Usa violeta, e verde ao bater a meta, em vez do vermelho e amarelo da origem, pela direção visual. Apagar meta segue só nos ajustes.
- **Descrição do card** com tabela, cor, realce, alinhamento, título 1, comandos com `/` e barra flutuante, em chunk lazy. Sem cor de sintaxe em bloco de código, porque `lowlight` não está instalado, e sem a extensão que troca aspas e travessões. A barra flutuante não aparece com dedo.
- **Vocabulário:** "pipeline" e "venda" no front e no back; "Quadro" fica só como nome da visão; "negócio" fica onde quer dizer empresa. "Mapa" nos fluxos. As palavras antigas ficam nas palavras-chave de busca dos blocos.
- **`RelativeTime`** diz "agora" no primeiro minuto. `kit.bulk.selected` sem rótulo diz "3 itens selecionados". `DataTable` ganhou coluna de ações fixa e `columnVisibility`, e as células não se refazem a cada revalidação. `flowDebounceSeconds` em `/automation-settings`, como "Esperar a pessoa terminar de escrever".

### Segurança (sec-review)

Corrigidos, cada um com spec que falhava antes:

- **SSRF com leitura por URL de mídia** em todos os provedores: conta nova forjava webhook com endereço interno e lia a resposta como mídia.
- **Webhooks de provedor sem autenticação** (Evolution, LeadChat): agora há token por conector na URL. **Quem já tem conector precisa reconfigurar o webhook no provedor.** A Meta passa a recusar em produção sem segredo configurado.
- **Sequestro de WABA em `reroute_by_entry`:** só vale conector com `waba_verified_at`. **WABA existente precisa ser reativado.**
- **Limites por IP burláveis** pelo cabeçalho `Forwarded`, e a Cloudflare não era proxy confiável.
- **Upload direto do Active Storage aberto sem conta**; bloqueio do libvips; sem `ffprobe` em anexo.
- **WebSocket sobrevivia** à perda de acesso e à troca de senha, e pedidos de nova senha abertos seguiam valendo. **Comportamento novo:** trocar a própria senha e sair derrubam e reconectam o WebSocket de todos os aparelhos.
- **ffmpeg lia playlist HLS**, e um "áudio" podia ler outro arquivo do disco.
- **`chat_list_to` faltava** em ações agendadas, inscrição em turma, presença e agendamento.
- **`/uploads` e imagem do widget confiavam no tipo declarado.** CSV de contatos ganhou teto de 10 MB. Argumentos de job saíram do log. Carrossel em pasta de outra organização.
- **Cabeçalho com segredo em claro**, em webhooks e gatilhos: agora só de escrita. A resposta traz `••••••••`, mandar a máscara de volta mantém o valor, e trocar destino ou nome responde `422 secretHeaderNeedsRetyping`. `GET /tool-catalog/:id` não entrega mais `jsCode`.

Integrador: Rails 8.1.4.1, rack 3.2.8, nokogiri, loofah, rails-html-sanitizer, crass e json nas versões corrigidas; `bundler-audit` limpo. O Rails corrigido recusa libvips abaixo de 8.13. Em desenvolvimento, `config/vips_local.rb` deixa o WSL com Ubuntu 22.04 subir; em produção a recusa continua. A conta de demonstração não nasce mais em produção, a menos que `SEED_DEMO_DATA=1`.

### Varredura visual (qa-sweep)

74 rotas em 1440 px e 74 em 390 px. Mudanças que a pessoa pode vetar:

- **Conteúdo centrado, com uma largura por área** (decisão da pessoa, desfazendo `238b04b`, que prendia tudo à esquerda). Preso à esquerda, o monitor largo sobrava vazio só de um lado. As abas pulavam porque as abas de uma área usavam larguras diferentes, então Webhooks e a administração do pipeline ficam inteiras em `default`. Esticar (`full`) só em trabalho denso: chat, quadro, calendário e dashboard.
- **Busca global (Ctrl K) acha contatos e telas**, além de carrosséis, e respeita permissão. É acréscimo, sobre endpoints que já existiam. Ainda não acha item de catálogo, fluxo ou card.
- **"Novos contatos" virou "Conversas novas":** o número conta conversas criadas.
- **Favorito em violeta:** era o único âmbar solto na interface.
- **Modais de carrossel viram folha no celular**, com `ResponsiveDialog`.
- **"Criar" no lugar de "Novo" e "Cadastrar"**. "Adicionar" fica onde se junta algo que já existe (pessoa, canal, etiqueta).
- **Semente sem o aviso de modelos**, que prometia "6 modelos" numa tela que diz que eles ainda estão chegando.

### Ponta a ponta (qa-e2e)

API e WebSocket reais, com provedor simulado: 295 de 295 conferências. Roteiro em `~/.cache/vekoo-shot/wt33/`.

- **Tempo real volta sozinho depois de reiniciar o Redis** (`config/initializers/action_cable_redis.rb`). Antes morria até reiniciar o Puma.
- **Envio pelo `ChatChannel` passa pelo job `Chats::OperatorActionJob`,** e agora depende do Sidekiq no ar. Com o provedor mudo, o canal segurava o tempo real de todas as organizações por até 58,8 s.
- **Quem perde a conversa por reatribuição para de ouvir e sai da lista.**
- **Varredura entrega a caixa cujo job do debounce sumiu**, com índice esparso `flow_inbox_deadline`: o deploy precisa de `db:mongoid:create_indexes`, que já roda no `docker-entrypoint`.
- **Queda logo depois de gravar a mensagem:** a nova tentativa completa não lida, prévia e fluxo, em vez de parar em "já existe".
- **Erro de rede não mostra o endereço do provedor** em execução, alerta, gatilho e canal.
- **Campanha recusa fluxo de outra organização.**

### Z-API removido (rm-zapi)

- **O provedor Z-API saiu por inteiro**, por decisão de produto: o conector próprio (`Connector::Zapi`), o provedor `zapi` do WhatsApp Web (`Providers::Zapi`, `zapi_instance_id`, `zapi_token`, a flag `features["zapi"]`), o cliente `lib/zapi_client`, as rotas `/inbound/zapi/...` e `Inbound::ZapiEvents`, `Connector::DisconnectionLog` (só a Z-API gravava), `ZAPI_ACCOUNT_TOKEN` e `ZAPI_CLIENT_TOKEN`. WhatsApp Cloud, Evolution, AIVA e os outros canais não mudam.
- **Pedir o que saiu responde o erro de validação de sempre:** `connectorType: "zapi"` dá `422 invalidConnectorType`, e `providerApi: "zapi"` dá `422 unprocessable` em `providerApi`. Webhook antigo apontado para `/inbound/zapi/...` responde `404` e não enfileira nada.
- **"Apagar para todos" saiu junto**, porque só a Z-API revogava mensagem. `DELETE /chats/:id/messages/:id` e `Messages::DeletionService` não existem mais; `bulk-delete` recebe só `messageIds`, apaga só daqui e responde `{ deletedIds }`; o evento `messages_deleted` perdeu `scope`; o conector perdeu `deleteForEveryoneSupported`. A tela oferece só "Excluir para mim". `deletedAt` e `deletedScope` continuam na mensagem, para o que já foi apagado.
- **Freio de contato:** a contagem por período (25 mensagens em 4 minutos adiam a automação em 10 minutos e somam advertência) só valia na Z-API, e saiu. A regra das advertências (`red_flag_count` ≥ 5 desliga a automação) continua no WhatsApp Web, como antes, em `Chats::InboundThrottle`.
- **Tela de conexão:** saiu a opção "WhatsApp do celular, com mais recursos" e o pedido de QR novo a cada 8 segundos (`generate_qr_code`, `qr_error` em `ConnectorsChannel`).
- **Para quem lê o código:** `Inbound::ProcessWebhookJob` perdeu o argumento `event`, que só a Z-API usava. Nada cria mais conector Z-API, nem a semente nem `platform:sync`, e a produção nunca teve um. Num banco antigo, porém: um documento `_type: "Connector::Zapi"` faz qualquer consulta que o alcance levantar `Mongoid::Errors::UnknownModel`, inclusive a lista de canais da organização inteira; e um `Connector::WhatsappWeb` com `provider_api: "zapi"` carrega, cai na AIVA para falar com o provedor e não salva mais (validação de `provider_api`). Os dois devem ser apagados, com as conversas deles: `Connector::Base.collection.find("$or" => [{ _type: "Connector::Zapi" }, { provider_api: "zapi" }])`.

### Modal no lugar de drawer (modals)

- **Diretiva da pessoa: toda tarefa, edição ou detalhe abre em modal com tamanho dinâmico; drawer só para informação de baixa relevância.** O `SidePanel` (folha pela direita) saiu do kit, e os usos viraram `ResponsiveDialog` (38 em 36 arquivos, mais a vitrine; os 13 do calendário ficam com a frente do calendário).
- **Um modal só, com seis tamanhos** escolhidos pelo conteúdo: `sm` 24rem, `md` 28rem, `lg` 32rem, `xl` 42rem, `2xl` 56rem e `full` (até 88rem × 90dvh, altura fixa). A altura acompanha o conteúdo até o teto; `fixedHeight` trava no teto para wizard e abas não saltarem. Ganhou `headerActions`.
- **Celular (vetável):** `sm` e `md` como cartão centrado com 16 px de margem; `lg` para cima em tela cheia. Ambos presos ao viewport visível, para o teclado não cobrir campo nem botão. Voltar à folha de baixo é trocar `MOBILE_PRESENTATION` para `"sheet"` no componente.
- **Card do pipeline em `full`**, com detalhes à esquerda e comentários e atividade ao lado a partir de 1024 px; abaixo disso, as três abas de antes. Continua abrindo por `?card=`.
- **Ficaram como drawer:** menu "Mais" e escolha de pipeline da barra inferior, central de notificações no celular, ações da página no cabeçalho do celular, menus do chat no celular (conversa, mensagem, seleção, anexar, mensagens rápidas), filtros e seletores (`FilterBar`, `FilterPopover`, `ResponsivePopover`) e o inspetor de bloco do editor de carrossel no celular, que precisa deixar a arte à vista.

## 2. Pendências por frente

### Ponta a ponta e varredura: precisam de decisão

- **Timeout de provedor:** vale o padrão de 60 s. Com o provedor mudo, as 5 threads do Sidekiq ficam presas, e uma mensagem recebida levou 59,5 s para aparecer, em todas as organizações. Sugestão do qa-e2e: cerca de 20 s no `sendText` e fila própria para envio. Timeout menor aumenta os casos de "pode ter saído".
- **Lembrete perdido em queda do Redis:** não sai, fica pendente na conversa e não levanta alerta. Reenviar atrasado, antes do início do agendamento?
- **Latência do debounce:** os 3 s viram de 5 a 13 s, porque o Sidekiq confere os agendados a cada 5 s em média, por processo. Reduzir `average_scheduled_poll_interval` melhora, ao custo de mais consultas ao Redis.
- **`agenda_bookings` em dashboard personalizado:** o período padrão termina agora, e agendamento futuro não conta sem `end`.
- **Modelos e Marcas** seguem no menu como "estão chegando", e "Melhorar plano" só mostra um aviso. Ficam visíveis ou saem?
- **Botão de criar no celular:** flutuante em Chat e Calendário, no cabeçalho no resto. Unificar?
- **Cadastro:** preenche o nome como "`<nome>` Conteúdo", herança dos carrosséis, e chama de "Nome da conta" o que depois é "Organização".
- **Termos de uso e Política de privacidade** em `/login` e `/signup` parecem links, mas não têm destino: falta o conteúdo.

### Ponta a ponta e varredura: conhecidos, sem correção

- **Lote:** `POST /contacts/bulk-assign-user` usa `update_all`, e quem perde a conversa segue ouvindo até reconectar.
- **Listas por stream compartilhada:** ao sair de "sem dono" ou de um departamento, a linha fica parada em `assigned` ou `team`.
- **Só lidos no código, sem reproduzir:** erro interno em fluxo com o Mongo fora mostra host e porta; Redis caindo entre gravar e agendar a nova tentativa perde o fluxo, e `Chats::InboundDelivery` engole erro do dispatcher; `kill -9` no meio de envio humano deixa a mensagem sem `status`.
- **Gatilho com ids de outra organização** salva com `201` e não alcança nada ao executar: deveria responder `422`.
- **Erro 500 com o Mongo fora** responde `{ status, error }`, fora do contrato. A tela trata como `unknown`.
- **Ordem da rajada:** o fluxo recebeu `três, uma, duas` em modo produção, com uma resposta só.
- **Avisos de agendamento** levam a `/calendar`, não ao agendamento. `?event=` só abre o que está no período visível.
- **Visão geral × painel personalizado:** 154 contra 14 conversas na demonstração, porque a semente sorteia `DailyChatStat` e o painel consulta conversas. Na rodada ponta a ponta, com o rollup real, os números bateram (13 = 13), mas nunca numa base real.
- **Semente:** alertas citam canais que não existem; webhook diz "Nenhuma requisição ainda" com 90 no histórico; anexos são PNGs de cor chapada. O banco compartilhado só perde o aviso de modelos e o gatilho "negócio ganho" depois de `db:seed`.
- **Acabamento:** "(sem valor)" cru em "Conversas por atendente"; alvos de toque menores em "2 execuções em 7 dias", "Ver histórico" e "Renomear carrossel"; conversa no celular sem `h1`, porque o nome fica dentro de um botão.
- **Não exercitado:** Evolution, Meta, OpenAI, Whisper, Google e Apify reais; geração de carrossel por IA de ponta a ponta; Puma com vários processos, volume, reinício do Postgres, `kamal-proxy`, Cloudflare, Safari, Firefox e aparelho físico.

### Segurança: precisam de decisão

- **Produção de hoje exposta a CVE-2026-66066** (Rails 8.1.3 com libvips): `VIPS_BLOCK_UNTRUSTED=1` no ambiente, ou subir o Rails. A correção está nesta branch, e não no `main`.
- **`backend/config/master.key` versionado desde o primeiro commit**, e no GitHub. Trocar a chave, tirar do git e pôr no `.gitignore`. Antes, conferir se `.env.deploy` tem `SECRET_KEY_BASE` próprio; com o valor do repositório, quem lê o repositório forja links assinados e decifra tokens de conector. `.env.deploy.example` manda copiar desse arquivo.
- **Copiloto `send_messages`:** a aprovação humana existe só no prompt, sem trava no servidor. Uma mensagem de contato pode induzir o envio para até 50 conversas.
- **`/campaigns/:id/import-contacts` ignora `chat_list_to`:** quem tem `campaigns` importa a base inteira e lê os telefones em `recipients`.
- **Comandos no canal:** qualquer contato com `--RE-ACTIVE-ME--` religa a automação durante atendimento humano.
- **WABA sem dono:** evento de `entry.id` desconhecido fica no conector da URL, ou seja, em outra organização.
- **Mídia enviada por URL:** a Evolution baixa o endereço do lado dela. Se ela estiver na rede interna, é SSRF por tabela: precisa de regra de saída no host.
- **Token de 30 dias em `?token=` no WebSocket:** o Rails filtra; proxy e Cloudflare não foram conferidos. Um ticket curto resolveria.
- **Sem cota por organização:** cadastro grátis usa Apify, Maps, embeddings, Whisper e a instância Evolution por conta do servidor, enche disco (`/attachments` aceita 100 MB por arquivo) e a fila `scripts`.
- **Segredos sem cifra em repouso** em `hook_actions` e `pipeline_triggers`; cabeçalhos em claro em `GET /flows/:id` para quem tem `flows`; corpo e query da ação sem máscara.
- **Menores:** enumeração de contas em `check-email` e login; links assinados de mídia nunca expiram; `POST /credits/consume` deixa qualquer membro gastar o saldo da organização; qualquer pessoa com acesso ao card apaga comentário alheio, como na origem.
- **Não verificado:** exploração real da CVE; produção, `kamal-proxy` e Cloudflare; webhooks com token em provedor real; reconexão do WebSocket e o `422` de cabeçalho no navegador; injeção de prompt em fluxos e copiloto; fuzzing do V8; carga em `$regex` e o teto de 16 MB do funil.
- **`npm audit --omit=dev`:** 24 avisos (2 críticos, 13 altos), quase todos de `shadcn` em `dependencies`, um CLI que `src` não importa: deveria ir para `devDependencies`. No bundle ficam `dompurify` (dentro do Monaco) e `zod`.

### Integrador (Fase 5)

- Sem caminho pela API para ligar `features`: hoje só pelo console.
- Decisão de produto: excluir calendário.
- Revisão de segurança: `ffmpeg` processa arquivo enviado pelo usuário em `Chats::SendAudio` (sem shell, mas demuxers de playlist podem ler arquivo local); conferir `Chats::Filters` e os operadores das agregações.
- Filtros de contato por `team_id` e `custom_attributes` não têm índice, e não foram medidos em base grande. Exportação: se a aba fechar, o link se perde, porque só o canal avisa; uma notificação resolveria.
- Teto de 16 MB no `$facet` do quadro de funil não foi reproduzido: passar dele vira 500.
- Rubocop: os arquivos reciclados do `be-core` têm ofensas de estilo (aspas simples); rodar `rubocop -a` no back-end inteiro ao final.
- Copiloto: seis rodadas de verificação usaram a chave real da Anthropic do `.env`, sem medir o gasto de tokens (be-inbox e be-agenda).
- Semente do catálogo usa fotos genéricas de paisagem em itens de roupa: só afeta a demonstração.
- Não testado até aqui: OpenAI real, jobs recorrentes disparando no Sidekiq, importação em alto volume, push em navegador de verdade, Safari e Firefox, arrastar arquivo de verdade para o `FileDropzone`, aparelho real (iOS e Android: área segura, teclado virtual, arrastar folha), clique em notificação do sistema, pedido real de permissão, deploy no Cloudflare.
- Revisão de segurança: `/media` não confere a organização (o acesso é por chave ou id assinado); `has_one :proxy` tem `destroy` em instância em memória.
- Não confirmados com a Meta: textos do `WabaErrorHandler` para 132005, 132007, 132015 e 132016. Nenhum provedor real foi exercitado, por falta de credenciais.
- Não confirmados contra provedor real: Embedded Signup até o fim, modelos COPY_CODE e AUTHENTICATION.
- Bundle embutível do widget (`aiva-frontend/widget`): fora desta migração; precisa se adaptar ao novo contrato e atualizar o SRI em `config/widget_releases.yml`.
- Dashboard: faceta por `flow_id` em `MessageVolumeDaily`, `flow_id` em `MessageAuthorship.projection` e o card de ranking por fluxo, agora que a mensagem guarda o fluxo. A fonte `messages` não expõe `usage_*`. `aiCosts` em `/catalog` ainda não lista os créditos dos blocos.
- Processo de scripts com concorrência 2 pode virar gargalo em IA com ferramenta.
- Não exercitado de ponta a ponta: `send_template`, `catalog_search`, `goto_flow` e `send_media` em fluxo (só specs), transcrição Whisper, `PruneExecutionsJob` e `PruneLogsJob` no cron, 429 da entrada de webhook, volume.
- `ContactNotificationJob` acha a regra pela posição: excluir um lembrete do meio pode trocar o texto de um já na fila. A correção pede id nas regras. Não há `GET /calendar-events/:id`, então `?event=` só abre o que está no período aberto.
- Sugestão de produto: `wait_for_message` não tem tempo limite, então "se não responder em 24 h, lembrar de novo" não dá para montar. O modelo de carrinho abandonado perdeu essa parte por isso.
- Não testado em aparelho: teclado virtual (simulado), botão voltar físico, gesto de sistema do Android, háptico, permissão do microfone durante o segurar, zoom no visualizador, intervenção de histórico do Chrome em link direto.
- Ferramentas: `transform_to_schema` descarta `properties` de objetos de nível superior, como na origem; função personalizada perde as credenciais (a tela avisa); não há endpoint de teste para script de webhook. `BACKEND_URL` sem valor em desenvolvimento gera URL relativa, que o front resolve com `apiAssetUrl`.
- Campanhas: `ChatAudience` vale para a organização inteira, enquanto `/contacts` respeita `visible_to`: "todos" pode trazer mais do que a tela mostra a quem tem `chat_list_to` restrito. Precisa de decisão: quem pode criar campanha vê toda a base? Filtros de etiqueta, canal e situação no assistente não foram aplicados no navegador, e o caminho do celular parou na confirmação de lançar.
- **`bin/ci` ainda para no Brakeman, com código 3:** 73 avisos, 69 em `pipelines/card_query.rb` (coluna vem de `FieldRegistry`, chave de campo passa por `CUSTOM_KEY_FORMAT`, valor vai como bind), 1 em `pipelines/card_sort.rb`, e `unified_contacts_controller.rb:27`, `chats/send_audio.rb:92` e `normalization_service.rb:88`. As frentes os deram como falsos positivos, e `card_sort.rb` ainda não foi olhado. É da revisão de segurança registrar em `config/brakeman.ignore` com o motivo. O `--ensure-latest`, que dava código 5, saiu.
- Revisão de segurança, achados do deploy: `backend/config/master.key` está versionado (`.gitignore` não o cobre; nada usa `credentials` hoje, mas a chave está no histórico). A conta de demonstração nasce em produção com senha pública, pela semente base. Com `META_APP_SECRET` e `INSTAGRAM_APP_SECRET` vazios, `verify_meta_signature` aceita webhook sem assinatura também em produção.
- **`docker build` não foi rodado** desde a entrada de `ffmpeg` e `mini_racer` na imagem, por falta de memória na máquina. Antes do primeiro deploy: construir, e rodar num container `ffmpeg -version` e um script por `bin/rails runner`. `kamal-proxy` também não foi exercitado: ver `DEPLOY.md`, seção 12.
- **Nenhum e-mail sai em produção.** Não há mailer: `POST /password-resets` responde 202 e a pessoa não recebe o link. Falta escolher o serviço de e-mail.
- OpenAI em duas variáveis: `OPENAI_API_KEY` (embeddings do catálogo) e `OPENAI_ACCESS_TOKEN` (Whisper). Estão documentadas assim. Unificar é trocar uma linha em `chats/audio_transcriber.rb`, e os contratos.
- O `.env.deploy` real, fora do repositório, precisa ganhar as variáveis novas à mão: `DEPLOY.md`, seção 5.
- CSP do seletor de planilhas: `script-src` libera só `accounts.google.com/gsi/` e `apis.google.com/js/` e `/_/`, por caminho, porque essas origens têm endpoints JSONP que furariam a política se liberadas inteiras. Nunca testado contra o Google real: conferir ao configurar as credenciais.

### Front (fases 3 e 4)

- O topo pode receber aviso com `key: null`: `app-shell.tsx` não pode depender de `n.key` (fe-shell, em andamento).
- `fe-connectors` (já integrado): seletor de anexos no cabeçalho do modelo de WhatsApp, agora que a API de anexos existe. Hoje é um campo de URL pública.
- `fe-chat-details`: ações em lote não avisam o tempo real, então chamar `afterBulkAction` depois delas; eventos `bookings_changed` e `scheduled_actions_changed` chegam por `ChatChannel` e `applyChannelMessage` os ignora: o painel que precisar deles escuta por conta própria; conferir `useCan("calendar")` antes de pedir agendamentos do contato.
- `fe-campaigns-wizard`: avisar de variável inexistente antes de lançar; oferecer só `whatsapp_web` no modo texto; ler `?placeExtraction=<id>` (o link das buscas abre o assistente vazio) e `?duplicate=`.
- `fe-chat-details`: `PUT /chats/:id/attributes` agora soma ao que existe, e `null` tira a chave.
- `fe-chat-details`: toggles locais do chat da origem (`showTagsInList`, `showPhoneNumberInList`) não foram portados; e, se fizer sentido, preferências na própria tela do chat por `/organization/chat-settings`.
- Semente: o canal WABA está inativo, então o aviso de 24 horas não aparece na demonstração sem retoque.
- Kit: `EmptyState` aceita uma ação só e `TablePagination` só tem anterior e próxima; nenhuma tela pronta pede mais.
- Download de mídia pelo proxy do be-core: passar em `downloadFile({ fetchBlob })`.
- `fe-custom-dashboards`: entra pelo encaixe `hooks/insights/use-dashboard-extra-tabs.ts`, trocando o corpo do hook; devolve `{ tabs: [{ id, label, icon, render(period) }], create? }`. Tokens de gráfico em `components/dashboard/viz-tokens.css`.

### Back (Fase 2)

- `be-inbox`: `chat_list_to` usa `team` (não `department`), e a atribuição de conversa deve filtrar pessoas `setupOnly`. API de lista de conversas e mensagens, apagar e reagir por REST, `Attachment` conforme `Media::AttachmentLookup`, `import_contacts*` e `normalize_custom_attributes`.
- `be-pipelines` e `be-agenda`: mapeamento em `ConnectorEventService` (usa `model.service` e `model.professional`), `ChatRelations::*`, `BackfillSystemTagsService`.
- `be-outreach`: `Outreach::Recipient` hoje é guardado por `defined?`; remover a guarda. `ChatMessage#campaign_id` já existe.
- `be-agenda`: a origem espelhava o avatar da pessoa em `Collaborator`.
- Avisos criados pelos domínios: `AccountNotice.create!` (o `recycle.rb` já converte).
- `fe-custom-dashboards`: registrar a fonte `pipelines` e os filtros `pipeline_status` e `pipeline_stage` em dashboards personalizados, pelos passos de "Fonte nova" em `docs/migration/api/insights.md`, respeitando `Pipelines::CardVisibility`.

## 3. Achados na origem (`ancient-app`), que continuam lá

Encontrados ao portar o motor de scripts. Aqui estão corrigidos; **na origem, seguem como estavam**. Confirmados lendo o código, sem executar nada lá.

- `lib/mini_racer_engine/workers/fetch.rb:58` e `:81`: `HTTParty.send(method, url, options)` com `method` vindo do script do cliente. Não é só "método HTTP": alcança qualquer método Ruby de `HTTParty`, como `send` e `load`.
- `lib/mini_racer_engine/workers/dynamic_table.rb:212`: `collection.Search` usa `.or`, que no Mongoid significa "o que já estava no filtro OU isto", e por isso devolve registros de **qualquer organização**. Reproduzido com Mongoid 9 aqui; lá a versão é 8.1.
- `lib/mini_racer_engine/workers/tag.rb:114`: `assignUserByEmail` procura em todas as contas da plataforma, com `Admin::User.find_by_email`.
- `lib/mini_racer_engine/workers/fetch.rb`: `fetch` alcança qualquer endereço, inclusive metadados da nuvem, Redis e Postgres. Não há filtro de rede.
- Sem organização no contexto, `collection.*` cai num espaço de tabelas compartilhado; e `$where` chega ao Mongo pelo filtro.

Os dois de portal mais simples: a tabela de métodos HTTP e o `any_of` em `search_records`. Ver "Buracos que a origem tinha" em `docs/migration/api/script-engine.md`.

Encontrados na revisão de segurança (sec-review). Confirmados lendo o código, sem executar nada lá.

- `app/models/integration/z_api.rb:207`, `lib/zapi_client/media.rb:68`, `app/sidekiq/audio_message_job.rb:510`, `app/models/integration/lead_chat.rb:75`, `app/models/integration/whatsapp_api/providers/evolution_api.rb:441`: `HTTParty.get` em URL que vem do corpo do webhook. `app/controllers/api/v1/zapi_controller.rb` não confere nada além de o conector existir, então um webhook forjado faz o servidor buscar qualquer endereço interno e guardar a resposta como mídia da conversa. `app/models/integration/whatsapp_business.rb:732` faz o mesmo com a URL do cabeçalho de modelo.
- `app/controllers/concerns/audio_processing.rb` e `app/models/integration/whatsapp_business.rb:575`: `ffmpeg -i` sem lista de formatos. Uma playlist HLS enviada como áudio lê outro arquivo do servidor. Em `whatsapp_business.rb:575` o comando ainda é texto, passando por shell.
- `Gemfile.lock`: Active Storage 7.0.8.4 com `ruby-vips` e `load_defaults 7.0`. É a combinação da CVE-2026-66066, e as versões corrigidas começam na linha 7.2.
- As rotas do Active Storage não foram desligadas lá, e o upload direto (`/rails/active_storage/direct_uploads`) não confere sessão. Não confirmado em execução: lá a aplicação não é só de API, e o CSRF pode barrar.
