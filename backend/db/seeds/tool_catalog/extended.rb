# Seed estendido do catálogo de Tools.
#
# Inclui integrações externas (Shopify, Slack, OpenWeather, Stripe) e ferramentas
# nativas da plataforma (Kanban CRM, Tags do contato, Atendimento Humano,
# Memória do contato, Agendamentos, Banco de dados dinâmico) que exploram as
# APIs já disponíveis no sandbox MiniRacer.
#
# Cada tool é idempotente via find_or_initialize_by(slug: ...).
# Tools nativas usam `icon` (Iconify) + `color`; externas usam `image_url` da marca.
#
# Para executar no console do rails: load Rails.root.join('db/seeds/tool_catalog/extended.rb')

puts '[seed:tools_extended] começando…'

# =============================================================================
# 1) SHOPIFY — e-commerce, com credenciais
# =============================================================================

# SHOPIFY_HEADERS_JS = <<~JS.strip
#   const store = String(credentials.store_url || '').replace(/^https?:\\/\\//, '').replace(/\\/$/, '');
#   const token = String(credentials.access_token || '');
#   if (!store || !token) return { error: 'Credenciais Shopify ausentes' };
#   const base = 'https://' + store + '/admin/api/2024-07';
#   const headers = { 'X-Shopify-Access-Token': token, 'Content-Type': 'application/json' };
# JS

# shopify = Tool.find_or_initialize_by(slug: 'shopify')
# shopify.assign_attributes(
#   name: 'Shopify',
#   description: 'Conecte sua loja Shopify para consultar produtos, pedidos e clientes diretamente nas conversas.',
#   image_url: 'https://cdn.shopify.com/shopifycloud/brochure/assets/brand-assets/shopify-logo-primary-logo-456baa801ee66a0a435671082365958316831c9960c480451dd0330bcdae304f.svg',
#   icon: 'simple-icons:shopify',
#   color: '#95BF47',
#   category: 'ecommerce',
#   active: true,
#   credentials_schema: [
#     { 'name' => 'store_url', 'label' => 'Loja (xxx.myshopify.com)', 'type' => 'string',
#       'required' => true, 'help' => 'Subdomínio da loja, ex.: minha-loja.myshopify.com' },
#     { 'name' => 'access_token', 'label' => 'Admin API Access Token', 'type' => 'password',
#       'required' => true, 'help' => 'Criado em Settings → Apps → Develop apps → API credentials' }
#   ],
#   function_templates: [
#     {
#       'name' => 'shopify_list_products',
#       'description' => 'Lista produtos da loja Shopify (até 50). Retorna id, título, status e preço.',
#       'parameters' => [
#         { 'name' => 'limit', 'type' => 'integer', 'required' => false,
#           'description' => 'Quantos produtos (1-50, default 10)' }
#       ],
#       'js_code' => SHOPIFY_HEADERS_JS + "\n" + <<~JS
#         const limit = Math.min(Math.max(parseInt(params.limit) || 10, 1), 50);
#         const res = await fetch(base + '/products.json?limit=' + limit + '&fields=id,title,status,variants', { headers });
#         const json = await res.json();
#         if (!res.ok) return { error: 'shopify error', status: res.status, body: json };
#         return {
#           products: (json.products || []).map(p => ({
#             id: p.id,
#             title: p.title,
#             status: p.status,
#             price: p.variants && p.variants[0] ? p.variants[0].price : null
#           }))
#         };
#       JS
#     },
#     {
#       'name' => 'shopify_search_products',
#       'description' => 'Busca produtos por título.',
#       'parameters' => [
#         { 'name' => 'query', 'type' => 'string', 'required' => true, 'description' => 'Texto da busca' }
#       ],
#       'js_code' => SHOPIFY_HEADERS_JS + "\n" + <<~JS
#         const q = encodeURIComponent(String(params.query || ''));
#         const res = await fetch(base + '/products.json?limit=20&title=' + q + '&fields=id,title,handle,status', { headers });
#         const json = await res.json();
#         if (!res.ok) return { error: 'shopify error', status: res.status };
#         return { products: json.products || [], count: (json.products || []).length };
#       JS
#     },
#     {
#       'name' => 'shopify_get_product',
#       'description' => 'Detalhes completos de um produto pelo ID.',
#       'parameters' => [
#         { 'name' => 'product_id', 'type' => 'string', 'required' => true,
#           'description' => 'ID numérico do produto Shopify' }
#       ],
#       'js_code' => SHOPIFY_HEADERS_JS + "\n" + <<~JS
#         const res = await fetch(base + '/products/' + encodeURIComponent(params.product_id) + '.json', { headers });
#         if (res.status === 404) return { error: 'produto não encontrado' };
#         const json = await res.json();
#         return res.ok ? json.product : { error: 'shopify error', status: res.status };
#       JS
#     },
#     {
#       'name' => 'shopify_list_orders',
#       'description' => 'Lista os pedidos mais recentes da loja com filtro opcional por status.',
#       'parameters' => [
#         { 'name' => 'status', 'type' => 'string', 'required' => false,
#           'description' => 'Filtrar por status', 'enum' => %w[any open closed cancelled] },
#         { 'name' => 'limit', 'type' => 'integer', 'required' => false, 'description' => '1-50, default 10' }
#       ],
#       'js_code' => SHOPIFY_HEADERS_JS + "\n" + <<~JS
#         const limit = Math.min(Math.max(parseInt(params.limit) || 10, 1), 50);
#         const status = String(params.status || 'any');
#         const url = base + '/orders.json?status=' + status + '&limit=' + limit +
#                     '&fields=id,name,email,total_price,financial_status,fulfillment_status,created_at';
#         const res = await fetch(url, { headers });
#         const json = await res.json();
#         if (!res.ok) return { error: 'shopify error', status: res.status };
#         return { orders: json.orders || [] };
#       JS
#     },
#     {
#       'name' => 'shopify_get_order',
#       'description' => 'Detalhes de um pedido pelo ID.',
#       'parameters' => [
#         { 'name' => 'order_id', 'type' => 'string', 'required' => true, 'description' => 'ID numérico do pedido' }
#       ],
#       'js_code' => SHOPIFY_HEADERS_JS + "\n" + <<~JS
#         const res = await fetch(base + '/orders/' + encodeURIComponent(params.order_id) + '.json', { headers });
#         if (res.status === 404) return { error: 'pedido não encontrado' };
#         const json = await res.json();
#         return res.ok ? json.order : { error: 'shopify error', status: res.status };
#       JS
#     },
#     {
#       'name' => 'shopify_create_customer',
#       'description' => 'Cria um cliente na Shopify.',
#       'parameters' => [
#         { 'name' => 'first_name', 'type' => 'string', 'required' => true, 'description' => 'Primeiro nome' },
#         { 'name' => 'last_name',  'type' => 'string', 'required' => false, 'description' => 'Sobrenome' },
#         { 'name' => 'email',      'type' => 'string', 'required' => true, 'description' => 'Email' },
#         { 'name' => 'phone',      'type' => 'string', 'required' => false,
#           'description' => 'Telefone em E.164 (+5511…)' }
#       ],
#       'js_code' => SHOPIFY_HEADERS_JS + "\n" + <<~JS
#         const body = JSON.stringify({
#           customer: {
#             first_name: params.first_name,
#             last_name: params.last_name || '',
#             email: params.email,
#             phone: params.phone || null,
#             verified_email: true,
#             send_email_invite: false
#           }
#         });
#         const res = await fetch(base + '/customers.json', { method: 'POST', headers, body });
#         const json = await res.json();
#         if (!res.ok) return { error: 'shopify error', status: res.status, details: json };
#         return { customer: json.customer };
#       JS
#     }
#   ]
# )
# shopify.save!
# puts "  ✔ #{shopify.name} (#{shopify.function_templates.size} funções)"

# =============================================================================
# 2) PIPELINES — nativo (refatorado do antigo "Kanban CRM")
#
# Todas as funções operam sempre sobre o CARD DO LEAD ATUAL (via
# `kanban.cardsForConversation()` ou `board.cardsForConversation()[0]`).
# NENHUMA aceita `card_id` como parâmetro — isso evitaria que a IA, por
# engano, mexesse no card de outro lead. Veja boas práticas no doc da API.
# =============================================================================

# Cleanup: a Tool antiga 'kanban-crm' foi renomeada para 'pipelines'. Remove
# a versão antiga para não duplicar no catálogo (instalações existentes ficam
# orfãs do tool_id antigo, mas os FunctionAction::MiniRacer clonados continuam
# funcionando até o usuário desinstalar manualmente).
Tool.where(slug: 'kanban-crm').destroy_all

pipelines_tool = Tool.find_or_initialize_by(slug: 'pipelines')
pipelines_tool.assign_attributes(
  name: 'Pipelines',
  description: 'CRM dentro do atendimento: qualifica o lead atual em um pipeline, avança, ' \
               'preenche dados de negócio e fecha como ganho ou perdido. Todas as ações ' \
               'agem sobre o card do lead em atendimento (nunca em cards de outros leads).',
  image_url: nil,
  icon: 'solar:planet-bold-duotone',
  color: '#2563eb',
  category: 'crm',
  active: true,
  credentials_schema: [],
  function_templates: [
    {
      'name' => 'list_pipelines',
      'description' => 'Lista todos os pipelines (boards) ativos do workspace, com suas colunas. ' \
                       'Use para descobrir em qual pipeline qualificar o lead.',
      'parameters' => [],
      'js_code' => <<~JS
        return kanban.boards().map(b => ({
          id: b.id,
          name: b.name,
          type: b.board_type,
          columns: (b.columns || []).map(c => ({ id: c.id, name: c.name, position: c.position }))
        }));
      JS
    },
    {
      'name' => 'get_lead_pipeline_context',
      'description' => 'Retorna um resumo de todos os cards do LEAD ATUAL em qualquer pipeline do ' \
                       'workspace. Use no início do turno para entender em que estágio o lead está.',
      'parameters' => [],
      'js_code' => <<~JS
        const cards = kanban.cardsForConversation();
        if (cards.length === 0) {
          return { has_card: false, message: 'Lead ainda não está em nenhum pipeline.' };
        }
        return {
          has_card: true,
          cards: cards.map(c => {
            const checklists = c.checklists ? c.checklists() : [];
            const total = checklists.reduce((s, cl) => s + cl.items.length, 0);
            const done  = checklists.reduce((s, cl) => s + cl.items.filter(i => i.completed).length, 0);
            return {
              id: c.id,
              title: c.title,
              priority: c.priority,
              deal_value: c.deal_value,
              deal_probability: c.deal_probability,
              column_id: c.kanban_column_id,
              status: c.won_at ? 'won' : c.lost_at ? 'lost' : 'open',
              labels: (c.labels || []).map(l => l.name),
              tags: c.tags || [],
              progress: total > 0 ? (done + '/' + total) : null
            };
          })
        };
      JS
    },
    {
      'name' => 'qualify_lead_in_pipeline',
      'description' => 'Cria um card para o LEAD ATUAL em um pipeline. Idempotente: se o lead já ' \
                       'tiver card neste pipeline, retorna o existente sem duplicar. Por padrão cria ' \
                       'na primeira coluna; passe `column` para escolher outra.',
      'parameters' => [
        { 'name' => 'pipeline',     'type' => 'string', 'required' => true,
          'description' => 'Nome ou id do pipeline (board)' },
        { 'name' => 'title',        'type' => 'string', 'required' => true,
          'description' => 'Título do card (ex.: "Lead WhatsApp — Maria Souza")' },
        { 'name' => 'column',       'type' => 'string', 'required' => false,
          'description' => 'Coluna inicial (id ou nome). Default: primeira coluna do pipeline.' },
        { 'name' => 'priority',     'type' => 'string', 'required' => false,
          'description' => 'Prioridade do card', 'enum' => %w[low medium high urgent] },
        { 'name' => 'deal_value',   'type' => 'number', 'required' => false,
          'description' => 'Valor estimado do negócio em reais' },
        { 'name' => 'company_name', 'type' => 'string', 'required' => false,
          'description' => 'Empresa/conta do lead' },
        { 'name' => 'contact_email', 'type' => 'string', 'required' => false,
          'description' => 'Email do lead' },
        { 'name' => 'description', 'type' => 'string', 'required' => false,
          'description' => 'Notas livres sobre o lead' }
      ],
      'js_code' => <<~JS
        const board = kanban.board(params.pipeline);
        if (!board) return { error: 'Pipeline "' + params.pipeline + '" não encontrado' };

        // Idempotência: já existe card deste lead neste pipeline?
        const existing = board.cardsForConversation()[0];
        if (existing) {
          return {
            already_exists: true,
            card_id: existing.id,
            column: (board.columns.find(c => c.id === existing.kanban_column_id) || {}).name,
            message: 'Lead já está neste pipeline.'
          };
        }

        const column = params.column ? board.column(params.column) : board.columns[0];
        if (!column) return { error: 'Coluna "' + (params.column || '(primeira)') + '" não encontrada' };

        const attrs = { title: params.title };
        if (params.priority)      attrs.priority = params.priority;
        if (params.description)   attrs.description = params.description;
        if (params.company_name)  attrs.company_name = params.company_name;
        if (params.contact_email) attrs.contact_email = params.contact_email;
        if (params.deal_value !== undefined && params.deal_value !== null) {
          attrs.deal_value = Number(params.deal_value);
        }

        const card = column.createCard(attrs);
        if (!card) return { error: 'Falha ao criar card no pipeline' };

        card.addComment('Lead qualificado pela IA durante o atendimento.');

        return {
          created: true,
          card_id: card.id,
          pipeline: board.name,
          column: column.name
        };
      JS
    },
    {
      'name' => 'advance_lead_in_pipeline',
      'description' => 'Move o card do LEAD ATUAL para a próxima coluna do pipeline (ou para a coluna ' \
                       'indicada em `to_column`). Respeita gates de checklist obrigatório — se houver ' \
                       'itens pendentes, retorna `{ blocked: true, pending_items: [...] }` para que a ' \
                       'IA peça esses dados antes de tentar de novo.',
      'parameters' => [
        { 'name' => 'pipeline',   'type' => 'string', 'required' => true,
          'description' => 'Nome ou id do pipeline (board)' },
        { 'name' => 'to_column',  'type' => 'string', 'required' => false,
          'description' => 'Coluna destino (id ou nome). Default: próxima coluna em sequência.' },
        { 'name' => 'at_end',     'type' => 'boolean', 'required' => false,
          'description' => 'Inserir no fim da coluna destino? Default: false (insere no topo).' }
      ],
      'js_code' => <<~JS
        const board = kanban.board(params.pipeline);
        if (!board) return { error: 'Pipeline "' + params.pipeline + '" não encontrado' };

        const card = board.cardsForConversation()[0];
        if (!card) return { error: 'Lead ainda não tem card neste pipeline.' };

        let target;
        if (params.to_column) {
          target = board.column(params.to_column);
          if (!target) return { error: 'Coluna "' + params.to_column + '" não encontrada' };
        } else {
          const idx = board.columns.findIndex(c => c.id === card.kanban_column_id);
          target = board.columns[idx + 1];
          if (!target) return { error: 'Card já está na última coluna do pipeline.' };
        }

        const result = card.moveTo(target.id, !!params.at_end);

        // Gate de checklist incompleto vem como result.ok === false
        if (result && result.ok === false && result.error === 'checklist_incomplete') {
          return {
            blocked: true,
            reason: 'checklist_incomplete',
            pending_items: result.pending_items || [],
            message: 'Antes de avançar, é necessário concluir os itens obrigatórios listados.'
          };
        }

        card.addComment('Card movido para "' + target.name + '" pela IA.');
        return { moved: true, to_column: target.name };
      JS
    },
    {
      'name' => 'update_lead_card',
      'description' => 'Atualiza dados do card do LEAD ATUAL (prioridade, valor, probabilidade, empresa, ' \
                       'datas, tags, etc.). Use apenas para o card desta conversa.',
      'parameters' => [
        { 'name' => 'priority',           'type' => 'string', 'required' => false,
          'description' => 'low | medium | high | urgent', 'enum' => %w[low medium high urgent] },
        { 'name' => 'deal_value',         'type' => 'number', 'required' => false,
          'description' => 'Valor atualizado do negócio em reais' },
        { 'name' => 'deal_probability',   'type' => 'number', 'required' => false,
          'description' => 'Probabilidade de fechar (0–100)' },
        { 'name' => 'company_name',       'type' => 'string', 'required' => false,
          'description' => 'Empresa do lead' },
        { 'name' => 'contact_email',      'type' => 'string', 'required' => false,
          'description' => 'Email de contato' },
        { 'name' => 'contact_phone',      'type' => 'string', 'required' => false,
          'description' => 'Telefone (E.164)' },
        { 'name' => 'expected_close_date', 'type' => 'string', 'required' => false,
          'description' => 'Data esperada de fechamento (YYYY-MM-DD)' },
        { 'name' => 'description',        'type' => 'string', 'required' => false,
          'description' => 'Notas internas sobre o lead' },
        { 'name' => 'tags',               'type' => 'array',  'required' => false,
          'description' => 'Lista de tags (substitui as anteriores)', 'items_type' => 'string' }
      ],
      'js_code' => <<~JS
        const card = kanban.cardsForConversation()[0];
        if (!card) return { error: 'Lead ainda não tem card em nenhum pipeline.' };

        const attrs = {};
        if (params.priority !== undefined)            attrs.priority = params.priority;
        if (params.deal_value !== undefined)          attrs.deal_value = Number(params.deal_value);
        if (params.deal_probability !== undefined)    attrs.deal_probability = Number(params.deal_probability);
        if (params.company_name !== undefined)        attrs.company_name = params.company_name;
        if (params.contact_email !== undefined)       attrs.contact_email = params.contact_email;
        if (params.contact_phone !== undefined)       attrs.contact_phone = params.contact_phone;
        if (params.expected_close_date !== undefined) attrs.expected_close_date = params.expected_close_date;
        if (params.description !== undefined)         attrs.description = params.description;
        if (Array.isArray(params.tags))               attrs.tags = params.tags;

        if (Object.keys(attrs).length === 0) {
          return { ok: false, error: 'Nenhum campo enviado para atualizar.' };
        }

        const updated = card.update(attrs);
        return updated ? { ok: true, updated } : { ok: false, error: 'Falha ao atualizar card' };
      JS
    },
    {
      'name' => 'mark_lead_won',
      'description' => 'Fecha o negócio do LEAD ATUAL como GANHO. Aceita opcionalmente valor final e ' \
                       'comentário. Define probabilidade em 100% automaticamente.',
      'parameters' => [
        { 'name' => 'final_value', 'type' => 'number', 'required' => false,
          'description' => 'Valor final fechado em reais' },
        { 'name' => 'note',        'type' => 'string', 'required' => false,
          'description' => 'Comentário a registrar no card (ex.: contexto do fechamento)' }
      ],
      'js_code' => <<~JS
        const card = kanban.cardsForConversation()[0];
        if (!card) return { error: 'Lead ainda não tem card em nenhum pipeline.' };

        if (params.final_value !== undefined) {
          card.update({ deal_value: Number(params.final_value), deal_probability: 100 });
        }

        const result = card.markWon();
        if (!result) return { ok: false, error: 'Falha ao marcar como ganho' };

        const note = params.note || 'Negócio fechado (won) registrado pela IA.';
        card.addComment(note);

        return { ok: true, status: 'won', card_id: result.id };
      JS
    },
    {
      'name' => 'mark_lead_lost',
      'description' => 'Fecha o negócio do LEAD ATUAL como PERDIDO. Sempre informe `reason` para ' \
                       'rastreabilidade — o motivo é registrado no card e em comentário.',
      'parameters' => [
        { 'name' => 'reason', 'type' => 'string', 'required' => true,
          'description' => 'Motivo da perda (ex.: "preço acima do orçamento", "desistiu")' }
      ],
      'js_code' => <<~JS
        const card = kanban.cardsForConversation()[0];
        if (!card) return { error: 'Lead ainda não tem card em nenhum pipeline.' };

        const result = card.markLost(params.reason);
        if (!result) return { ok: false, error: 'Falha ao marcar como perdido' };

        card.addComment('Negócio perdido (lost) — motivo: ' + params.reason);
        return { ok: true, status: 'lost', card_id: result.id, reason: params.reason };
      JS
    },
    {
      'name' => 'add_label_to_lead',
      'description' => 'Anexa uma label ao card do LEAD ATUAL. Aceita o NOME da label (cria no ' \
                       'workspace se não existir, case-insensitive). Idempotente — anexar duas vezes ' \
                       'não duplica.',
      'parameters' => [
        { 'name' => 'label', 'type' => 'string', 'required' => true,
          'description' => 'Nome da label (ex.: "lead-quente", "vip")' }
      ],
      'js_code' => <<~JS
        const card = kanban.cardsForConversation()[0];
        if (!card) return { error: 'Lead ainda não tem card em nenhum pipeline.' };

        const label = card.addLabel(params.label);
        return label ? { ok: true, label } : { ok: false, error: 'Falha ao adicionar label' };
      JS
    },
    {
      'name' => 'set_lead_custom_field',
      'description' => 'Define o valor de um custom field do card do LEAD ATUAL. A referência ao ' \
                       'campo é tolerante (aceita key ou nome, case e acento insensitive). Em campos ' \
                       'select o valor também é casado contra as options configuradas.',
      'parameters' => [
        { 'name' => 'field', 'type' => 'string', 'required' => true,
          'description' => 'Nome ou key do custom field (ex.: "Qualificação", "orcamento")' },
        { 'name' => 'value', 'type' => 'string', 'required' => true,
          'description' => 'Valor a salvar (string — converta para número se o campo for numérico)' }
      ],
      'js_code' => <<~JS
        const card = kanban.cardsForConversation()[0];
        if (!card) return { error: 'Lead ainda não tem card em nenhum pipeline.' };

        const updated = card.setCustomField(params.field, params.value);
        if (!updated) return { ok: false, error: 'Falha ao definir custom field' };

        return {
          ok: true,
          field: params.field,
          stored_value: card.getCustomField(params.field)
        };
      JS
    },
    {
      'name' => 'comment_on_lead_card',
      'description' => 'Adiciona um comentário ao card do LEAD ATUAL — visível para o time humano no ' \
                       'painel. Use em momentos-chave: qualificação, mudança de intenção, agendamento.',
      'parameters' => [
        { 'name' => 'body', 'type' => 'string', 'required' => true,
          'description' => 'Texto do comentário' }
      ],
      'js_code' => <<~JS
        const card = kanban.cardsForConversation()[0];
        if (!card) return { error: 'Lead ainda não tem card em nenhum pipeline.' };

        const comment = card.addComment(params.body);
        return comment ? { ok: true, comment } : { ok: false, error: 'Falha ao comentar' };
      JS
    },
    {
      'name' => 'add_checklist_to_lead_card',
      'description' => 'Cria um checklist no card do LEAD ATUAL com os itens informados. Útil para ' \
                       'rastrear etapas de onboarding ou pré-fechamento.',
      'parameters' => [
        { 'name' => 'name',  'type' => 'string', 'required' => true,
          'description' => 'Nome do checklist (ex.: "Onboarding", "Pré-fechamento")' },
        { 'name' => 'items', 'type' => 'array',  'required' => true,
          'description' => 'Lista de títulos de itens', 'items_type' => 'string' }
      ],
      'js_code' => <<~JS
        const card = kanban.cardsForConversation()[0];
        if (!card) return { error: 'Lead ainda não tem card em nenhum pipeline.' };

        const checklist = card.addChecklist(params.name);
        if (!checklist) return { ok: false, error: 'Falha ao criar checklist' };

        const titles = Array.isArray(params.items) ? params.items : [];
        const added = titles
          .map(t => checklist.addItem(String(t)))
          .filter(Boolean);

        return {
          ok: true,
          checklist_id: checklist.id,
          items_added: added.length,
          items: added.map(i => ({ id: i.id, title: i.title }))
        };
      JS
    }
  ]
)
pipelines_tool.save!
puts "  ✔ #{pipelines_tool.name} (#{pipelines_tool.function_templates.size} funções)"

# =============================================================================
# 3) ATENDIMENTO HUMANO — nativo
# =============================================================================

handoff = Tool.find_or_initialize_by(slug: 'atendimento-humano')
handoff.assign_attributes(
  name: 'Atendimento Humano',
  description: 'Transfere a conversa para um atendente ou departamento, pausa/retoma a automação e lista o time da organização.',
  image_url: nil,
  icon: 'solar:user-hands-bold-duotone',
  color: '#0ea5e9',
  category: 'communication',
  active: true,
  credentials_schema: [],
  function_templates: [
    {
      'name' => 'transfer_to_human_by_email',
      'description' => 'Atribui a conversa atual a um atendente específico pelo email e pausa a IA.',
      'parameters' => [
        { 'name' => 'email', 'type' => 'string', 'required' => true, 'description' => 'Email do atendente' }
      ],
      'js_code' => <<~JS
        assignUserByEmail(params.email);
        disableAutomation();
        return { ok: true, assigned_to: params.email, automation: 'disabled' };
      JS
    },
    {
      'name' => 'transfer_to_department',
      'description' => 'Atribui a conversa a um departamento e pausa a IA.',
      'parameters' => [
        { 'name' => 'department', 'type' => 'string', 'required' => true, 'description' => 'Nome do departamento' }
      ],
      'js_code' => <<~JS
        assignDepartmentByName(params.department);
        disableAutomation();
        return { ok: true, department: params.department, automation: 'disabled' };
      JS
    },
    {
      'name' => 'resume_bot',
      'description' => 'Reativa a automação de IA para a conversa atual.',
      'parameters' => [],
      'js_code' => "enableAutomation();\nreturn { ok: true, automation: 'enabled' };\n"
    },
    {
      'name' => 'list_team_members',
      'description' => 'Lista todos os atendentes do workspace (id, nome, email).',
      'parameters' => [],
      'js_code' => "return { users: userList() };\n"
    },
    {
      'name' => 'assigned_agent',
      'description' => 'Retorna o atendente atualmente atribuído à conversa, ou null.',
      'parameters' => [],
      'js_code' => "return { agent: assignedUser() };\n"
    }
  ]
)
handoff.save!
puts "  ✔ #{handoff.name} (#{handoff.function_templates.size} funções)"

# =============================================================================
# 4) TAGS DO CONTATO — nativo
# =============================================================================

tags_tool = Tool.find_or_initialize_by(slug: 'contact-tags')
tags_tool.assign_attributes(
  name: 'Tags do Contato',
  description: 'Aplica, remove e consulta tags do contato atual — útil para segmentação e gatilhos.',
  image_url: nil,
  icon: 'solar:tag-bold-duotone',
  color: '#a855f7',
  category: 'crm',
  active: true,
  credentials_schema: [],
  function_templates: [
    {
      'name' => 'add_contact_tag',
      'description' => 'Adiciona uma tag ao contato atual. Cria a tag no workspace se não existir.',
      'parameters' => [
        { 'name' => 'name', 'type' => 'string', 'required' => true, 'description' => 'Nome da tag (ex.: lead-quente)' }
      ],
      'js_code' => "tag.add(params.name);\nreturn { ok: true, added: params.name };\n"
    },
    {
      'name' => 'remove_contact_tag',
      'description' => 'Remove uma tag do contato atual.',
      'parameters' => [
        { 'name' => 'name', 'type' => 'string', 'required' => true, 'description' => 'Nome da tag a remover' }
      ],
      'js_code' => "tag.remove(params.name);\nreturn { ok: true, removed: params.name };\n"
    },
    {
      'name' => 'list_contact_tags',
      'description' => 'Lista todas as tags aplicadas ao contato atual.',
      'parameters' => [],
      'js_code' => "return { tags: tag.listUserTags() };\n"
    },
    {
      'name' => 'list_workspace_tags',
      'description' => 'Lista todas as tags disponíveis no workspace.',
      'parameters' => [],
      'js_code' => "return { tags: tag.list() };\n"
    }
  ]
)
tags_tool.save!
puts "  ✔ #{tags_tool.name} (#{tags_tool.function_templates.size} funções)"

# =============================================================================
# 5) MEMÓRIA DO CONTATO — nativo
# =============================================================================

memory_tool = Tool.find_or_initialize_by(slug: 'contact-memory')
memory_tool.assign_attributes(
  name: 'Memória do Contato',
  description: 'Persiste informações no perfil do contato — desde notas internas (contactStorage) até atributos visíveis no chat (contactAttribute).',
  image_url: nil,
  icon: 'solar:brain-bold-duotone',
  color: '#f97316',
  category: 'crm',
  active: true,
  credentials_schema: [],
  function_templates: [
    {
      'name' => 'remember_fact',
      'description' => 'Salva um fato sobre o contato em memória interna (não visível no chat).',
      'parameters' => [
        { 'name' => 'key',   'type' => 'string', 'required' => true, 'description' => 'Chave (ex.: produto_favorito)' },
        { 'name' => 'value', 'type' => 'string', 'required' => true, 'description' => 'Valor a salvar' }
      ],
      'js_code' => "contactStorage.setItem(params.key, params.value);\nreturn { ok: true, key: params.key };\n"
    },
    {
      'name' => 'recall_fact',
      'description' => 'Lê um fato previamente salvo. Retorna null se não existir.',
      'parameters' => [
        { 'name' => 'key', 'type' => 'string', 'required' => true, 'description' => 'Chave a buscar' }
      ],
      'js_code' => "return { value: contactStorage.getItem(params.key) };\n"
    },
    {
      'name' => 'set_contact_attribute',
      'description' => 'Define um atributo visível na ficha do contato (ex.: email, cpf, profissão).',
      'parameters' => [
        { 'name' => 'key',   'type' => 'string', 'required' => true, 'description' => 'Nome do atributo' },
        { 'name' => 'value', 'type' => 'string', 'required' => true, 'description' => 'Valor (string)' }
      ],
      'js_code' => "const ok = contactAttribute.setItem(params.key, params.value);\nreturn { ok };\n"
    },
    {
      'name' => 'get_contact_attribute',
      'description' => 'Lê um atributo da ficha do contato.',
      'parameters' => [
        { 'name' => 'key', 'type' => 'string', 'required' => true, 'description' => 'Nome do atributo' }
      ],
      'js_code' => "return { value: contactAttribute.getItem(params.key) };\n"
    },
    {
      'name' => 'who_is_this_contact',
      'description' => 'Retorna informações básicas do contato atual (nome, telefone, id).',
      'parameters' => [],
      'js_code' => "return getContactInfo();\n"
    }
  ]
)
memory_tool.save!
puts "  ✔ #{memory_tool.name} (#{memory_tool.function_templates.size} funções)"

# =============================================================================
# 6) AGENDAMENTOS — nativo
# =============================================================================

appointments = Tool.find_or_initialize_by(slug: 'appointments')
appointments.assign_attributes(
  name: 'Agendamentos',
  description: 'Consulta serviços, busca horários livres, cria e cancela agendamentos no calendário do workspace.',
  image_url: nil,
  icon: 'solar:calendar-mark-bold-duotone',
  color: '#14b8a6',
  category: 'communication',
  active: true,
  credentials_schema: [],
  function_templates: [
    {
      'name' => 'list_services',
      'description' => 'Lista todos os serviços disponíveis para agendamento.',
      'parameters' => [],
      'js_code' => "return { services: appointment.services() };\n"
    },
    {
      'name' => 'list_employees',
      'description' => 'Lista todos os profissionais que prestam atendimento.',
      'parameters' => [],
      'js_code' => "return { employees: appointment.employees() };\n"
    },
    {
      'name' => 'get_available_slots',
      'description' => 'Retorna horários disponíveis para um serviço em um período.',
      'parameters' => [
        { 'name' => 'service_name', 'type' => 'string', 'required' => true, 'description' => 'Nome do serviço' },
        { 'name' => 'date_start',   'type' => 'string', 'required' => true, 'description' => 'YYYY-MM-DDTHH:mm:ss' },
        { 'name' => 'date_end',     'type' => 'string', 'required' => true, 'description' => 'YYYY-MM-DDTHH:mm:ss' },
        { 'name' => 'employee_name', 'type' => 'string', 'required' => false,
          'description' => 'Filtrar por profissional' }
      ],
      'js_code' => <<~JS
        const slots = appointment.serviceAvailableSlots(
          params.service_name, params.date_start, params.date_end, params.employee_name
        );
        return { slots: slots, count: (slots || []).length };
      JS
    },
    {
      'name' => 'create_appointment',
      'description' => 'Cria um agendamento.',
      'parameters' => [
        { 'name' => 'employee_name', 'type' => 'string', 'required' => true,
          'description' => 'Profissional que vai atender' },
        { 'name' => 'service_name',  'type' => 'string', 'required' => true, 'description' => 'Serviço a agendar' },
        { 'name' => 'start_time',    'type' => 'string', 'required' => true, 'description' => 'Início em ISO 8601' }
      ],
      'js_code' => "return appointment.create(params.employee_name, params.service_name, params.start_time);\n"
    },
    {
      'name' => 'cancel_appointment',
      'description' => 'Cancela um agendamento existente pelo ID.',
      'parameters' => [
        { 'name' => 'appointment_id', 'type' => 'string', 'required' => true, 'description' => 'ID do agendamento' }
      ],
      'js_code' => "appointment.cancel(params.appointment_id);\nreturn { ok: true, cancelled: params.appointment_id };\n"
    }
  ]
)
appointments.save!
puts "  ✔ #{appointments.name} (#{appointments.function_templates.size} funções)"

# =============================================================================
# 7) BANCO DE DADOS DINÂMICO — nativo (collection)
# =============================================================================

db_tool = Tool.find_or_initialize_by(slug: 'dynamic-database')
db_tool.assign_attributes(
  name: 'Banco de Dados Dinâmico',
  description: 'CRUD em tabelas dinâmicas do workspace. Cria, lê, atualiza, conta e busca registros sem precisar criar tabela manualmente.',
  image_url: nil,
  icon: 'solar:server-square-bold-duotone',
  color: '#6366f1',
  category: 'utilities',
  active: true,
  credentials_schema: [],
  function_templates: [
    {
      'name' => 'db_create_record',
      'description' => 'Cria um registro em uma tabela (cria a tabela se não existir).',
      'parameters' => [
        { 'name' => 'table', 'type' => 'string', 'required' => true, 'description' => 'Nome da tabela' },
        { 'name' => 'data',  'type' => 'object', 'required' => true, 'description' => 'Objeto com os campos' }
      ],
      'js_code' => "return collection.Create(params.table, params.data || {});\n"
    },
    {
      'name' => 'db_find_records',
      'description' => 'Busca registros que atendem aos critérios.',
      'parameters' => [
        { 'name' => 'table',    'type' => 'string', 'required' => true, 'description' => 'Nome da tabela' },
        { 'name' => 'criteria', 'type' => 'object', 'required' => false, 'description' => 'Filtros (campo: valor)' }
      ],
      'js_code' => "return collection.Where(params.table, params.criteria || {});\n"
    },
    {
      'name' => 'db_find_one',
      'description' => 'Retorna o primeiro registro que atende aos critérios.',
      'parameters' => [
        { 'name' => 'table',    'type' => 'string', 'required' => true, 'description' => 'Nome da tabela' },
        { 'name' => 'criteria', 'type' => 'object', 'required' => true, 'description' => 'Filtros' }
      ],
      'js_code' => "return collection.FindOne(params.table, params.criteria);\n"
    },
    {
      'name' => 'db_update_record',
      'description' => 'Atualiza um registro pelo ID (merge parcial).',
      'parameters' => [
        { 'name' => 'table', 'type' => 'string', 'required' => true, 'description' => 'Nome da tabela' },
        { 'name' => 'id',    'type' => 'string', 'required' => true, 'description' => 'ID do registro' },
        { 'name' => 'data',  'type' => 'object', 'required' => true, 'description' => 'Campos a atualizar' }
      ],
      'js_code' => "return collection.Update(params.table, params.id, params.data || {});\n"
    },
    {
      'name' => 'db_delete_record',
      'description' => 'Remove um registro pelo ID.',
      'parameters' => [
        { 'name' => 'table', 'type' => 'string', 'required' => true, 'description' => 'Nome da tabela' },
        { 'name' => 'id',    'type' => 'string', 'required' => true, 'description' => 'ID do registro' }
      ],
      'js_code' => "return collection.Delete(params.table, params.id);\n"
    },
    {
      'name' => 'db_count_records',
      'description' => 'Conta registros que atendem aos critérios.',
      'parameters' => [
        { 'name' => 'table',    'type' => 'string', 'required' => true, 'description' => 'Nome da tabela' },
        { 'name' => 'criteria', 'type' => 'object', 'required' => false, 'description' => 'Filtros opcionais' }
      ],
      'js_code' => "return collection.Count(params.table, params.criteria || {});\n"
    },
    {
      'name' => 'db_search_records',
      'description' => 'Busca textual (case-insensitive) em campos específicos da tabela.',
      'parameters' => [
        { 'name' => 'table',  'type' => 'string',         'required' => true, 'description' => 'Nome da tabela' },
        { 'name' => 'text',   'type' => 'string',         'required' => true, 'description' => 'Texto a buscar' },
        { 'name' => 'fields', 'type' => 'array',          'required' => true,
          'description' => 'Lista de campos onde procurar', 'items_type' => 'string' }
      ],
      'js_code' => "return collection.Search(params.table, params.text, params.fields || []);\n"
    }
  ]
)
db_tool.save!
puts "  ✔ #{db_tool.name} (#{db_tool.function_templates.size} funções)"

# =============================================================================
# 8) SLACK — webhook (credencial: webhook_url)
# =============================================================================

# slack = Tool.find_or_initialize_by(slug: 'slack-webhook')
# slack.assign_attributes(
#   name: 'Slack',
#   description: 'Envia notificações para um canal do Slack via Incoming Webhook.',
#   image_url: nil,
#   icon: 'simple-icons:slack',
#   color: '#4A154B',
#   category: 'communication',
#   active: true,
#   credentials_schema: [
#     { 'name' => 'webhook_url', 'label' => 'Webhook URL', 'type' => 'password', 'required' => true,
#       'help' => 'Crie em https://api.slack.com/messaging/webhooks e cole a URL completa' }
#   ],
#   function_templates: [
#     {
#       'name' => 'send_slack_message',
#       'description' => 'Envia uma mensagem para o canal configurado no webhook.',
#       'parameters' => [
#         { 'name' => 'text',       'type' => 'string', 'required' => true,
#           'description' => 'Texto da mensagem (Markdown suportado)' },
#         { 'name' => 'username',   'type' => 'string', 'required' => false, 'description' => 'Override do nome do bot' },
#         { 'name' => 'icon_emoji', 'type' => 'string', 'required' => false,
#           'description' => 'Emoji do ícone (ex.: :robot_face:)' }
#       ],
#       'js_code' => <<~JS
#         const url = String(credentials.webhook_url || '');
#         if (!url) return { error: 'webhook_url não configurada' };
#         const payload = { text: params.text };
#         if (params.username)   payload.username = params.username;
#         if (params.icon_emoji) payload.icon_emoji = params.icon_emoji;
#         const res = await fetch(url, {
#           method: 'POST',
#           headers: { 'Content-Type': 'application/json' },
#           body: JSON.stringify(payload)
#         });
#         return { ok: res.ok, status: res.status };
#       JS
#     }
#   ]
# )
# slack.save!
# puts "  ✔ #{slack.name} (#{slack.function_templates.size} funções)"

# =============================================================================
# 9) OPENWEATHER — clima atual (credencial: api_key)
# =============================================================================

# weather = Tool.find_or_initialize_by(slug: 'openweather')
# weather.assign_attributes(
#   name: 'OpenWeather',
#   description: 'Consulta clima atual e previsão por cidade usando a API OpenWeatherMap.',
#   image_url: nil,
#   icon: 'solar:sun-bold-duotone',
#   color: '#f59e0b',
#   category: 'utilities',
#   active: true,
#   credentials_schema: [
#     { 'name' => 'api_key', 'label' => 'API key', 'type' => 'password', 'required' => true,
#       'help' => 'Crie uma chave gratuita em https://openweathermap.org/api' }
#   ],
#   function_templates: [
#     {
#       'name' => 'get_current_weather',
#       'description' => 'Retorna o clima atual em uma cidade (temperatura em °C, condição e umidade).',
#       'parameters' => [
#         { 'name' => 'city',    'type' => 'string', 'required' => true, 'description' => 'Cidade (ex.: São Paulo,BR)' },
#         { 'name' => 'units',   'type' => 'string', 'required' => false, 'description' => 'metric (default) | imperial',
#           'enum' => %w[metric imperial] }
#       ],
#       'js_code' => <<~JS
#         const key = String(credentials.api_key || '');
#         if (!key) return { error: 'api_key não configurada' };
#         const units = params.units || 'metric';
#         const url = 'https://api.openweathermap.org/data/2.5/weather?q='
#                   + encodeURIComponent(params.city) + '&units=' + units + '&lang=pt_br&appid=' + key;
#         const res = await fetch(url);
#         const json = await res.json();
#         if (!res.ok) return { error: 'openweather error', status: res.status, message: json.message };
#         return {
#           city: json.name,
#           country: json.sys && json.sys.country,
#           temp: json.main && json.main.temp,
#           feels_like: json.main && json.main.feels_like,
#           humidity: json.main && json.main.humidity,
#           condition: json.weather && json.weather[0] && json.weather[0].description,
#           wind_speed: json.wind && json.wind.speed,
#           units: units
#         };
#       JS
#     }
#   ]
# )
# weather.save!
# puts "  ✔ #{weather.name} (#{weather.function_templates.size} funções)"

# =============================================================================
# 10) STRIPE — pagamentos (credencial: api_key)
# =============================================================================

# stripe = Tool.find_or_initialize_by(slug: 'stripe-payments')
# stripe.assign_attributes(
#   name: 'Stripe',
#   description: 'Cria sessões de checkout, consulta clientes e assinaturas na conta Stripe configurada.',
#   image_url: nil,
#   icon: 'simple-icons:stripe',
#   color: '#635bff',
#   category: 'ecommerce',
#   active: true,
#   credentials_schema: [
#     { 'name' => 'api_key', 'label' => 'Secret key (sk_…)', 'type' => 'password', 'required' => true,
#       'help' => 'Use a Restricted API key com permissão mínima. Nunca compartilhe a live secret.' }
#   ],
#   function_templates: [
#     {
#       'name' => 'stripe_create_checkout',
#       'description' => 'Cria uma sessão de Checkout para um preço já cadastrado e retorna a URL de pagamento.',
#       'parameters' => [
#         { 'name' => 'price_id',     'type' => 'string', 'required' => true, 'description' => 'ID do preço (price_…)' },
#         { 'name' => 'success_url',  'type' => 'string', 'required' => true,
#           'description' => 'URL de retorno em sucesso' },
#         { 'name' => 'cancel_url',   'type' => 'string', 'required' => true,
#           'description' => 'URL de retorno em cancelamento' },
#         { 'name' => 'quantity',     'type' => 'integer', 'required' => false,
#           'description' => 'Quantidade (default 1)' },
#         { 'name' => 'mode',         'type' => 'string', 'required' => false, 'description' => 'payment | subscription | setup',
#           'enum' => %w[payment subscription setup] }
#       ],
#       'js_code' => <<~JS
#         const key = String(credentials.api_key || '');
#         if (!key) return { error: 'api_key não configurada' };
#         const body = new URLSearchParams({
#           mode: params.mode || 'payment',
#           success_url: params.success_url,
#           cancel_url: params.cancel_url,
#           'line_items[0][price]': params.price_id,
#           'line_items[0][quantity]': String(params.quantity || 1)
#         }).toString();
#         const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
#           method: 'POST',
#           headers: {
#             Authorization: 'Bearer ' + key,
#             'Content-Type': 'application/x-www-form-urlencoded'
#           },
#           body
#         });
#         const json = await res.json();
#         if (!res.ok) return { error: 'stripe error', status: res.status, message: json.error && json.error.message };
#         return { id: json.id, url: json.url, status: json.status };
#       JS
#     },
#     {
#       'name' => 'stripe_get_customer',
#       'description' => 'Busca um cliente pelo email no Stripe.',
#       'parameters' => [
#         { 'name' => 'email', 'type' => 'string', 'required' => true, 'description' => 'Email do cliente' }
#       ],
#       'js_code' => <<~JS
#         const key = String(credentials.api_key || '');
#         if (!key) return { error: 'api_key não configurada' };
#         const url = 'https://api.stripe.com/v1/customers/search?query='
#                   + encodeURIComponent("email:'" + params.email + "'");
#         const res = await fetch(url, { headers: { Authorization: 'Bearer ' + key } });
#         const json = await res.json();
#         if (!res.ok) return { error: 'stripe error', status: res.status };
#         return { customers: json.data || [], count: (json.data || []).length };
#       JS
#     },
#     {
#       'name' => 'stripe_list_subscriptions',
#       'description' => 'Lista assinaturas ativas de um cliente.',
#       'parameters' => [
#         { 'name' => 'customer_id', 'type' => 'string', 'required' => true, 'description' => 'ID do cliente (cus_…)' }
#       ],
#       'js_code' => <<~JS
#         const key = String(credentials.api_key || '');
#         if (!key) return { error: 'api_key não configurada' };
#         const res = await fetch(
#           'https://api.stripe.com/v1/subscriptions?customer=' + encodeURIComponent(params.customer_id) + '&limit=20',
#           { headers: { Authorization: 'Bearer ' + key } }
#         );
#         const json = await res.json();
#         if (!res.ok) return { error: 'stripe error', status: res.status };
#         return { subscriptions: json.data || [] };
#       JS
#     }
#   ]
# )
# stripe.save!
# puts "  ✔ #{stripe.name} (#{stripe.function_templates.size} funções)"

# =============================================================================
# 12) CATÁLOGO — busca de itens do catálogo do workspace (nativo, sem credencial)
# =============================================================================

catalog_tool = Tool.find_or_initialize_by(slug: 'catalog')
catalog_tool.assign_attributes(
  name: 'Catálogo',
  description: 'Busca no catálogo do workspace (produtos, imóveis, serviços). Busca híbrida: ' \
               'semântica por embedding + textual, com filtro por categoria, tag e campos personalizados.',
  image_url: nil,
  icon: 'solar:bag-smile-bold-duotone',
  color: '#0ea5e9',
  category: 'ecommerce',
  active: true,
  credentials_schema: [],
  function_templates: [
    {
      'name' => 'catalog_search',
      # A instrução da última linha não é decorativa: MessageHandling só transforma
      # a referência em mídia quando ela aparece isolada por quebra de linha no
      # texto final da assistente (app/services/message_handling.rb SPLIT_REGEX).
      'description' => 'Busca itens no catálogo por descrição em linguagem natural, código ou modelo. ' \
                       'Cada item retorna `image`: para ENVIAR a foto ao cliente, escreva esse valor ' \
                       'sozinho em uma linha, sem markdown, sem colchetes e sem texto ao redor.',
      'parameters' => [
        { 'name' => 'query', 'type' => 'string', 'required' => true,
          'description' => 'O que o cliente procura, com as palavras dele' },
        { 'name' => 'categories', 'type' => 'array', 'required' => false, 'items_type' => 'string',
          'description' => 'Paths de categoria para restringir (inclui as subcategorias)' },
        { 'name' => 'tags', 'type' => 'array', 'required' => false, 'items_type' => 'string',
          'description' => 'Tags para restringir a busca' },
        { 'name' => 'custom', 'type' => 'object', 'required' => false,
          'description' => 'Filtro por campo personalizado: { "cor": "preta" } ou faixa { "preco": { "min": 100, "max": 500 } }' },
        { 'name' => 'limit', 'type' => 'integer', 'required' => false, 'description' => 'Máximo de itens (1 a 20)' }
      ],
      'js_code' => "return catalog.Search(params.query, {\n" \
                   "  categories: params.categories, tags: params.tags,\n" \
                   "  custom: params.custom, limit: params.limit\n" \
                   "});\n"
    },
    {
      'name' => 'catalog_get_item',
      'description' => 'Detalhes completos de um item, pelo código (SKU) ou id. Use depois da busca, ' \
                       'quando o cliente escolher um item específico.',
      'parameters' => [
        { 'name' => 'id', 'type' => 'string', 'required' => true, 'description' => 'Código (SKU) ou id do item' }
      ],
      'js_code' => "return catalog.Get(params.id);\n"
    },
    {
      'name' => 'catalog_list_categories',
      'description' => 'Lista as categorias do catálogo com a quantidade de itens em cada uma. ' \
                       'Use para oferecer opções quando o cliente não souber o que quer.',
      'parameters' => [],
      'js_code' => "return catalog.Categories();\n"
    },
    {
      'name' => 'catalog_facet_values',
      'description' => 'Valores disponíveis de uma tag ou campo personalizado, com a contagem de itens. ' \
                       'Use para afunilar a conversa: "temos em preto, branco e azul".',
      'parameters' => [
        { 'name' => 'field', 'type' => 'string', 'required' => true,
          'description' => 'A palavra "tags" ou a chave de um campo personalizado (ex.: "cor")' }
      ],
      'js_code' => "return catalog.Facets(params.field);\n"
    },
    {
      'name' => 'catalog_similar_items',
      'description' => 'Itens parecidos com um item já mostrado. Use para sugerir alternativas quando ' \
                       'o cliente não gostar do que foi apresentado ou o item não servir.',
      'parameters' => [
        { 'name' => 'id', 'type' => 'string', 'required' => true,
          'description' => 'Código (SKU) ou id do item de referência' },
        { 'name' => 'limit', 'type' => 'integer', 'required' => false, 'description' => 'Máximo de sugestões (1 a 20)' }
      ],
      'js_code' => "return catalog.Similar(params.id, params.limit);\n"
    }
  ]
)
catalog_tool.save!
puts "  \u2714 #{catalog_tool.name} (#{catalog_tool.function_templates.size} funções)"

puts "[seed:tools_extended] concluído — #{Tool.count} tools no catálogo."
