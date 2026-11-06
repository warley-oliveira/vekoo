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

- **Padrão das telas de configuração, seguido pelas próximas:** `AreaNav` no topo, `SettingsSection` com salvar por seção, interruptor que vale na hora, edição em `SidePanel`.
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
- **Linguagem:** "Z-API" saiu da escolha e da etiqueta do canal, e fica só em "Conexão", nos dados. `IWA-...` é trocado na tela pelo nome do tipo, inclusive nos avisos da API.
- **Ações por tipo:** widget só tem ligar e desligar, porque o site exige `active`; Z-API direta só oferece "Desconectar". Canal sem provedor gravado também avisa do descarte na pausa, porque o back-end usa AIVA nesse caso.
- **Messenger foi ligado** (estava comentado na origem) e usa `VITE_FB_APP_ID`, porque o back troca o código com `META_APP_ID`.
- **Criar Z-API direta e LeadChat não é oferecido**, como na origem; os que já existem funcionam.
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

## 2. Pendências por frente

### Integrador (Fase 5)

- `.env.example` e `DEPLOY.md`: VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`), `MONGODB_URI`, `db:mongoid:create_indexes` no deploy, Mongo como accessory.
- Sem caminho pela API para ligar `features`: hoje só pelo console.
- **Bloqueia deploy:** `config/deploy.yml` usa `postgres:16.10`, sem pgvector, e a migration do catálogo falharia. Trocar a imagem antes de migrar (conferir a glibc do volume de produção, para não repetir a incompatibilidade de collation vista em desenvolvimento: lá a variante `pg16-trixie` resolveu).
- `OPENAI_API_KEY` em `.env.example`, `.env.deploy.example`, `deploy.yml` e `DEPLOY.md`.
- `bin/brakeman` sai com código 5 só por causa do `--ensure-latest` (8.0.5 contra 8.1.0), o que quebra `bin/ci` independentemente do código.
- Rodar o processo de scripts em produção (`config/sidekiq_scripts.yml`) como papel próprio no `deploy.yml`.
- ENV novas: `GOOGLE_MAPS_API_KEY`, `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `GOOGLE_CALENDAR_REDIRECT_URI`. `ffmpeg` na imagem.
- Decisão de produto: excluir calendário.
- Deploy: `db:mongoid:create_indexes` **antes** do tráfego é obrigatório (as agregações usam `hint`), e `dashboards:backfill_operational[90]` fora do horário de pico.
- Revisão de segurança: `ffmpeg` processa arquivo enviado pelo usuário em `Chats::SendAudio` (sem shell, mas demuxers de playlist podem ler arquivo local); conferir `Chats::Filters` e os operadores das agregações. Os 3 avisos do Brakeman em aberto (`unified_contacts_controller.rb:27`, `chats/send_audio.rb:92`, `normalization_service.rb:88`) são falsos positivos, a registrar em `config/brakeman.ignore` com o motivo.
- Filtros de contato por `team_id` e `custom_attributes` não têm índice, e não foram medidos em base grande. Exportação: se a aba fechar, o link se perde, porque só o canal avisa; uma notificação resolveria.
- Teto de 16 MB no `$facet` do quadro de funil não foi reproduzido: passar dele vira 500.
- ENV novas: `APIFY_API_TOKEN`, `GOOGLE_SHEETS_CLIENT_ID`, `GOOGLE_SHEETS_API_KEY`, `GOOGLE_SHEETS_APP_ID`.
- `Inbound::ZapiEvents` não trata status, então o destinatário de campanha pela Z-API fica em `sent`.
- Rubocop: os arquivos reciclados do `be-core` têm ofensas de estilo (aspas simples); rodar `rubocop -a` no back-end inteiro ao final.
- Copiloto: seis rodadas de verificação usaram a chave real da Anthropic do `.env`, sem medir o gasto de tokens (be-inbox e be-agenda).
- Semente do catálogo usa fotos genéricas de paisagem em itens de roupa: só afeta a demonstração.
- Não testado até aqui: OpenAI real, jobs recorrentes disparando no Sidekiq, importação em alto volume, push em navegador de verdade, Safari e Firefox, arrastar arquivo de verdade para o `FileDropzone`, aparelho real (iOS e Android: área segura, teclado virtual, arrastar folha), clique em notificação do sistema, pedido real de permissão, deploy no Cloudflare.
- Variáveis novas de provedor: ver a seção "Para o deploy" de `docs/migration/api/connectors.md`.
- Revisão de segurança: `/media` não confere a organização (o acesso é por chave ou id assinado); `has_one :proxy` tem `destroy` em instância em memória.
- Não confirmados com a Meta: textos do `WabaErrorHandler` para 132005, 132007, 132015 e 132016. Nenhum provedor real foi exercitado, por falta de credenciais.
- Front em produção: `VITE_FB_APP_ID`, `VITE_FB_CONFIG_ID`, `VITE_FB_META_CONFIG_ID`, `VITE_FB_SDK_VERSION`, `VITE_IG_APP_ID` e `VITE_IG_REDIRECT_URI` (sem elas, as opções da Meta aparecem desabilitadas, com aviso), e registrar `https://<front>/auth/instagram/callback` na Meta.
- Não confirmados contra provedor real: Embedded Signup até o fim, modelos COPY_CODE e AUTHENTICATION, pareamento na Z-API (`zapi_get_phone_code` existe, mas nenhum fluxo chama).
- Bundle embutível do widget (`aiva-frontend/widget`): fora desta migração; precisa se adaptar ao novo contrato e atualizar o SRI em `config/widget_releases.yml`.
- `MEDIA_PROXY_ALLOWED_HOSTS` em produção precisa listar o CDN de mídia: host fora da lista dá erro no player de áudio do Safari, e só nele.
- Dashboard: faceta por `flow_id` em `MessageVolumeDaily`, `flow_id` em `MessageAuthorship.projection` e o card de ranking por fluxo, agora que a mensagem guarda o fluxo. A fonte `messages` não expõe `usage_*`. `aiCosts` em `/catalog` ainda não lista os créditos dos blocos.
- Processo de scripts com concorrência 2 pode virar gargalo em IA com ferramenta.
- Brakeman: os 69 avisos de `pipelines/card_query.rb` são falsos positivos (coluna vem de `FieldRegistry`, chave de campo passa por `CUSTOM_KEY_FORMAT`, valor vai como bind): registrar em `config/brakeman.ignore` com o motivo.
- Não exercitado de ponta a ponta: `send_template`, `catalog_search`, `goto_flow` e `send_media` em fluxo (só specs), transcrição Whisper, `PruneExecutionsJob` e `PruneLogsJob` no cron, 429 da entrada de webhook, volume.
- Registrar no `CLAUDE.md` que carrosséis agora ficam em `/carousels`. VAPID em produção. Se o domínio da API mudar, `connect-src` em `_headers` está fixo em `syco.vekoo.app`.

### Front (fases 3 e 4)

- O topo pode receber aviso com `key: null`: `app-shell.tsx` não pode depender de `n.key` (fe-shell, em andamento).
- `fe-connectors` (já integrado): seletor de anexos no cabeçalho do modelo de WhatsApp, agora que a API de anexos existe. Hoje é um campo de URL pública.
- `fe-chat-details`: ações em lote não avisam o tempo real, então chamar `afterBulkAction` depois delas; eventos `bookings_changed` e `scheduled_actions_changed` chegam por `ChatChannel` e `applyChannelMessage` os ignora: o painel que precisar deles escuta por conta própria; conferir `useCan("calendar")` antes de pedir agendamentos do contato.
- `fe-campaigns-*`: avisar de variável inexistente antes de lançar; tratar os status `sending` e `skipped`; oferecer só `whatsapp_web` no modo texto.
- `fe-calendar`: retorno do OAuth (o id do calendário é o começo do `state`); trocar a aula calculada quando é materializada; esconder excluir calendário; a busca de `class-session-dialog` usa `/chats/lookup`.
- `fe-chat-details`: `PUT /chats/:id/attributes` agora soma ao que existe, e `null` tira a chave.
- `fe-chat-details`: toggles locais do chat da origem (`showTagsInList`, `showPhoneNumberInList`) não foram portados; e, se fizer sentido, preferências na própria tela do chat por `/organization/chat-settings`.
- Kit: `SortableArea` por teclado não funciona dentro de `SidePanel` ou `ResponsiveDialog`: o `Dialog` do Base UI para a propagação das setas antes do sensor do dnd-kit. `fe-dashboard-funnels` contornou com setas no pegador.
- Kit: `MultiSelectField` desativado não muda de aparência (contornado na ficha da pessoa); `EmptyState` aceita uma ação só; `TablePagination` só tem anterior e próxima; `DataTable` sem coluna de ações fixa e sem `columnVisibility`; `NumberInput` e `SearchableSelect` ignoram `aria-label`; `Progress` indeterminado aparece vazio.
- Download de mídia pelo proxy do be-core: passar em `downloadFile({ fetchBlob })`.
- `fe-custom-dashboards`: entra pelo encaixe `hooks/insights/use-dashboard-extra-tabs.ts`, trocando o corpo do hook; devolve `{ tabs: [{ id, label, icon, render(period) }], create? }`. Tokens de gráfico em `components/dashboard/viz-tokens.css`.
- `fe-automation`: montar a partir de `docs/migration/api/automation.md`, inclusive os eventos `attachment_missing` e `pipeline_skipped`, e `flow_debounce_seconds` em `/automation-settings`.
- `fe-chat-mobile`: `use-fill-viewport-height` da origem não foi portado.

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
