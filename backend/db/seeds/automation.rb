# Semente do domínio "automation", na organização da conta de demonstração, com a Doma Store. É obra do usuário fictício, não
# interface: fica em pt-BR mesmo quando a API responde em inglês.
#
#   - catálogo de ferramentas (`db/seeds/tool_catalog/`, igual para toda organização);
#   - funções próprias e uma ferramenta instalada;
#   - fluxos publicados, em rascunho e arquivados, com histórico de execução em cada estado;
#   - webhooks em cada estado, com logs ao longo dos últimos dias.
#
# Não dispara nada e não fala com ninguém: nenhum job é enfileirado. O fluxo com IA publicado só responde à palavra "atendente", para
# ninguém gastar crédito sem querer ao mexer no widget. Os modelos de fluxo não são banco: `db/seeds/flow_templates/*.json`.
#
# Idempotente: cada coisa é achada pelo nome. A que já existe fica como está, então rodar de novo não desfaz o que a pessoa fez.
#
#   bin/rails runner 'load "db/seeds/automation.rb"'

Object.send(:remove_const, :VekooAutomationSeeds) if defined?(VekooAutomationSeeds)

module VekooAutomationSeeds
  DEMO_EMAIL = "marina.duarte@exemplo.com.br".freeze
  CATALOG = Rails.root.glob("db/seeds/tool_catalog/*.rb").sort.freeze

  module_function

  def call
    # Fora do `load` envolto, os dois arquivos definem constantes de JavaScript a cada vez que rodam.
    silently { CATALOG.each { |file| load file.to_s, true } }

    account = Account.find_by(email: DEMO_EMAIL)
    return nil unless account

    organization = account.organization
    tools = seed_tools(organization)
    flows = seed_flows(organization, account, tools)
    seed_executions(organization, flows)
    seed_hooks(organization, flows)
    organization
  end

  def silently
    previous = $stdout
    $stdout = File.open(File::NULL, "w")
    yield
  ensure
    $stdout = previous
  end

  # ---------------------------------------------------------------------------------------------
  # Ferramentas
  # ---------------------------------------------------------------------------------------------

  def seed_tools(organization)
    {
      frete: function(organization, "consultar_frete", "Calcula o prazo e o valor do frete para um CEP.", <<~JS, [ cep_parameter ]),
        const cep = String(params.cep || '').replace(/\\D/g, '');
        if (cep.length !== 8) return { ok: false, erro: 'CEP inválido' };
        const sul = cep.startsWith('8') || cep.startsWith('9');
        return { ok: true, prazo_dias: sul ? 2 : 6, valor: sul ? 14.9 : 29.9 };
      JS
      pedido: function(organization, "status_do_pedido", "Diz em que situação está um pedido da loja.", <<~JS, [ order_parameter ]),
        const res = await fetch('https://api.domastore.example/pedidos/' + encodeURIComponent(params.numero), {
          headers: { Authorization: 'Bearer ' + (credentials.api_key || '') }
        });
        if (!res.ok) return { ok: false, status: res.status };
        return await res.json();
      JS
      installation: install(organization, "utilidades-brasil")
    }
  end

  def cep_parameter
    { "name" => "cep", "type" => "string", "required" => true, "description" => "CEP de destino, só com números" }
  end

  def order_parameter
    { "name" => "numero", "type" => "string", "required" => true, "description" => "O número do pedido" }
  end

  def function(organization, name, description, code, parameters)
    tool = ToolFunction::MiniRacer.for_organization(organization.id).where(name: name).take
    return tool if tool

    ToolFunction::MiniRacer.create!(organization_id: organization.id.to_s, name: name, description: description, js_code: code, parameters: parameters)
  end

  def install(organization, slug)
    tool = Tool.where(slug: slug).take
    return nil unless tool

    ToolInstallation.for_organization(organization.id).where(tool_id: tool.id.to_s).take ||
      Tools::InstallService.new(tool, organization).call.data
  end

  # ---------------------------------------------------------------------------------------------
  # Fluxos
  # ---------------------------------------------------------------------------------------------

  def node(id, type, x, y = 0, **data)
    { "id" => id, "type" => type, "position" => { "x" => (x * 1.3).round, "y" => y }, "data" => data.deep_stringify_keys }
  end

  def edge(source, target, handle = nil)
    { "id" => "#{source}-#{target}", "source" => source, "target" => target, "sourceHandle" => handle }.compact
  end

  def definition(nodes, edges, **extra)
    { "nodes" => nodes, "edges" => edges, "viewport" => { "x" => 0, "y" => 0, "zoom" => 1 } }.merge(extra.deep_stringify_keys)
  end

  # A que já existe fica como está.
  def flow(organization, account, name, trigger_type, version_definition, status: "published", description: nil)
    existing = Flow.find_by(organization_id: organization.id, name: name)
    return existing if existing

    created = Flow.create!(
      organization_id: organization.id, name: name, description: description, trigger_type: trigger_type,
      status: "draft", created_by_account_id: account.id
    )
    version = created.versions.create!(version_number: 1, definition: version_definition, created_by_account_id: account.id)

    created.publish!(version: version, account: account) if %w[published archived].include?(status)
    created.update!(status: status) if status == "archived"
    created
  end

  def seed_flows(organization, account, tools)
    {
      welcome: flow(organization, account, "Boas-vindas da Doma", "first_message", welcome_definition,
                    description: "Recebe quem chega pela primeira vez e separa quem quer comprar de quem precisa de ajuda."),
      budget: flow(organization, account, "Pedido de orçamento", "keyword", budget_definition(tools),
                   description: "Quando a pessoa fala em orçamento, coleta o CEP e responde com o frete."),
      survey: flow(organization, account, "Pesquisa de satisfação", "manual", survey_definition,
                   description: "Iniciado à mão, depois da entrega."),
      cart: flow(organization, account, "Carrinho abandonado", "webhook", cart_definition,
                 description: "A loja avisa pelo webhook, e o fluxo lembra o cliente no dia seguinte."),
      ai: flow(organization, account, "Atendente da loja", "keyword", ai_definition(tools),
               description: "Conversa com a IA e transfere quando a pessoa quer falar com alguém. Responde à palavra \"atendente\"."),
      handoff: flow(organization, account, "Aviso de transferência", "human_handoff", handoff_definition,
                    description: "Quando alguém assume a conversa, marca a etiqueta."),
      draft: flow(organization, account, "Reengajamento de clientes (rascunho)", "manual", draft_definition, status: "draft",
                  description: "Ainda em desenho."),
      black_friday: flow(organization, account, "Black Friday 2025", "keyword", black_friday_definition, status: "archived",
                         description: "Campanha que já acabou.")
    }
  end

  def welcome_definition
    definition(
      [
        node("gatilho", "trigger_first_message", 0, label: "Primeira mensagem"),
        node("oi", "send_text", 280, text: "Oi, {{contact.name}}! Que bom ter você aqui na Doma Store. 💜"),
        node("pergunta", "send_interactive", 560,
             text: "Como posso te ajudar hoje?",
             buttons: [ { id: "comprar", title: "Quero comprar" }, { id: "suporte", title: "Preciso de ajuda" } ],
             invalid_text: "Não entendi. Responda com o número da opção.",
             save_to: "motivo"),
        node("vendas", "assign_team", 840, -120, team_id: ""),
        node("etiqueta", "add_tag", 1120, -120, tag_name: "quer-comprar"),
        node("loja", "send_text", 1400, -120, text: "Ótimo! Já vou te passar para quem cuida das vendas."),
        node("suporte", "add_tag", 840, 120, tag_name: "suporte"),
        node("humano", "transfer_to_human", 1120, 120),
        node("fim", "end", 1680)
      ],
      [
        edge("gatilho", "oi"), edge("oi", "pergunta"),
        edge("pergunta", "vendas", "comprar"), edge("vendas", "etiqueta"), edge("etiqueta", "loja"), edge("loja", "fim"),
        edge("pergunta", "suporte", "suporte"), edge("suporte", "humano"), edge("humano", "fim")
      ]
    )
  end

  def budget_definition(tools)
    definition(
      [
        node("gatilho", "trigger_keyword", 0, label: "Orçamento", keywords: %w[orçamento orcamento frete]),
        node("cep", "ask_question", 280, text: "Claro! Qual é o seu CEP?", save_to: "cep"),
        node("frete", "execute_tool", 560, tool_id: tools[:frete].id.to_s, params: { cep: "{{vars.cep}}" }, save_response_to: "frete"),
        node("deu_certo", "condition", 840, match: "all", rules: [ { field: "vars.frete.ok", operator: "equals", value: "true" } ]),
        node("resposta", "send_text", 1120, -120, text: "Para o seu CEP, o frete fica R$ {{vars.frete.valor}} e chega em {{vars.frete.prazo_dias}} dias."),
        node("erro", "send_text", 1120, 120, text: "Não consegui consultar esse CEP. Pode conferir?"),
        node("campo", "set_custom_attribute", 1400, -120, key: "cep", value: "{{vars.cep}}")
      ],
      [
        edge("gatilho", "cep"), edge("cep", "frete"), edge("frete", "deu_certo", "success"), edge("frete", "erro", "error"),
        edge("deu_certo", "resposta", "true"), edge("deu_certo", "erro", "false"), edge("resposta", "campo")
      ],
      fields: [ { key: "cep", label: "CEP", type: "string" } ]
    )
  end

  def survey_definition
    definition(
      [
        node("gatilho", "trigger_manual", 0),
        node("nota", "ask_question", 280, text: "De 0 a 10, o quanto você recomendaria a Doma para uma amiga?", save_to: "nota"),
        node("boa", "condition", 560, rules: [ { field: "vars.nota", operator: "greater_than", value: "8" } ]),
        node("obrigada", "send_text", 840, -120, text: "Ficamos muito felizes! Obrigada, {{contact.name}}."),
        node("conta", "ask_question", 840, 120, text: "Poxa, sentimos muito. O que poderia ter sido melhor?", save_to: "motivo"),
        node("transfere", "transfer_to_human", 1120, 120)
      ],
      [ edge("gatilho", "nota"), edge("nota", "boa"), edge("boa", "obrigada", "true"), edge("boa", "conta", "false"), edge("conta", "transfere") ],
      fields: [ { key: "nota", label: "Nota", type: "string" }, { key: "motivo", label: "Motivo", type: "string" } ]
    )
  end

  def cart_definition
    definition(
      [
        node("gatilho", "trigger_webhook", 0),
        node("espera", "wait", 280, amount: 1, unit: "days"),
        node("lembrete", "send_text", 560, text: "Oi, {{contact.name}}! Você deixou {{vars.webhook.body.produto}} no carrinho. Separei com 10% de desconto: DOMA10."),
        node("etiqueta", "add_tag", 840, tag_name: "carrinho-abandonado")
      ],
      [ edge("gatilho", "espera"), edge("espera", "lembrete"), edge("lembrete", "etiqueta") ]
    )
  end

  def ai_definition(tools)
    definition(
      [
        node("gatilho", "trigger_keyword", 0, keywords: %w[atendente]),
        node("ia", "ai_assistant", 280,
             mode: "interactive",
             model_size: "fast",
             system_prompt: "Você atende {{contact.name}} no WhatsApp. Responda em poucas frases, sem listas.",
             tool_ids: [ tools[:frete].id.to_s ],
             min_turns: 1,
             max_turns: 10,
             outputs: [ { id: "falar_com_pessoa", label: "Falar com uma pessoa", when: "O cliente pede para falar com uma pessoa" } ]),
        node("humano", "transfer_to_human", 560)
      ],
      [ edge("gatilho", "ia"), edge("ia", "humano", "falar_com_pessoa"), edge("ia", "humano", "maxTurns") ],
      base_prompt: "Você é a atendente da Doma Store, loja de roupas de Curitiba. Fale de forma simpática e direta."
    )
  end

  def handoff_definition
    definition(
      [ node("gatilho", "trigger_human_handoff", 0), node("etiqueta", "add_tag", 280, tag_name: "atendimento-humano") ],
      [ edge("gatilho", "etiqueta") ]
    )
  end

  def draft_definition
    definition(
      [
        node("gatilho", "trigger_manual", 0),
        node("oi", "send_text", 280, text: "Oi, {{contact.name}}! Faz tempo que você não aparece. Chegou coleção nova."),
        node("busca", "catalog_search", 560, query: "coleção nova", limit: 3, save_to: "produtos")
      ],
      [ edge("gatilho", "oi"), edge("oi", "busca") ]
    )
  end

  def black_friday_definition
    definition(
      [ node("gatilho", "trigger_keyword", 0, keywords: %w[black]), node("oi", "send_text", 280, text: "A Black Friday acabou, mas temos promoções toda semana!") ],
      [ edge("gatilho", "oi") ]
    )
  end

  # ---------------------------------------------------------------------------------------------
  # Histórico
  # ---------------------------------------------------------------------------------------------

  def seed_executions(organization, flows)
    return if FlowExecution.where(organization_id: organization.id).exists?

    chats = organization.chats.valid_records.order_by(last_message_at: :desc).limit(12).to_a
    return if chats.empty?

    random = Random.new(2026)
    chats.each_with_index do |chat, index|
      flow = [ flows[:welcome], flows[:budget], flows[:survey] ][index % 3]
      status = index.zero? ? "failed" : (index % 4 == 1 ? "waiting_for_message" : "completed")
      execution(organization, flow, chat, status, random.rand(1..20).days.ago)
    end
  end

  def execution(organization, flow, chat, status, started_at)
    version = flow.published_version
    nodes = version.nodes.reject { |item| item["type"].start_with?("trigger_") }.first(3)
    finished = %w[completed failed].include?(status)

    execution = FlowExecution.create!(
      flow: flow, flow_version: version, organization_id: organization.id,
      chat_id: chat.id.to_s, contact_id: chat.external_id,
      status: status,
      context: { "variables" => { "nome" => chat.user_name }, "message_seq" => 1, "event" => "message_received" },
      current_node_id: finished ? nil : nodes.last["id"],
      started_at: started_at,
      completed_at: finished ? started_at + 3.seconds : nil,
      error_message: status == "failed" ? "O canal recusou a mensagem: número sem WhatsApp." : nil,
      created_at: started_at,
      updated_at: started_at
    )

    nodes.each_with_index do |item, index|
      last = index == nodes.length - 1
      FlowExecutionLog.create!(
        flow_execution: execution,
        node_id: item["id"],
        node_type: item["type"],
        input: item["data"],
        output: status == "failed" && last ? {} : { "ok" => true },
        duration_ms: 40 + (index * 35),
        status: log_status(status, last),
        error_message: status == "failed" && last ? execution.error_message : nil,
        executed_at: started_at + index.seconds
      )
    end
  end

  def log_status(status, last)
    return "success" unless last

    { "failed" => "error", "waiting_for_message" => "suspended" }.fetch(status, "success")
  end

  # ---------------------------------------------------------------------------------------------
  # Webhooks
  # ---------------------------------------------------------------------------------------------

  def seed_hooks(organization, flows)
    connector = organization.connectors.where(_type: "Connector::WhatsappWeb").take
    custom_field = CustomField.where(organization_id: organization.id.to_s).order_by(created_at: :asc).first

    order = hook(organization, "Carrinho abandonado da loja virtual", "active") do |created|
      contact_action(created, "{{body.cliente.telefone}}", "{{body.cliente.nome}}")
      next unless connector

      created.hook_actions.create!(
        type: "HookAction::StartFlow",
        config: { "connector_id" => connector.id.to_s, "flow_id" => flows[:cart].id, "send_mode" => "simple" }
      )
      next unless custom_field

      created.hook_actions.create!(
        type: "HookAction::UserField",
        config: { "custom_field_id" => custom_field.id.to_s, "value_template" => "{{body.produto}}" }
      )
    end

    form = hook(organization, "Formulário do site", "test") do |created|
      contact_action(created, "{{body.whatsapp}}", "{{body.nome}}")
      created.update!(received_payload: sample_captures)
    end

    crm = hook(organization, "Espelho no CRM", "inactive") do |created|
      contact_action(created, "{{body.telefone}}", "{{body.nome}}")
      created.hook_actions.create!(
        type: "HookAction::HttpRequest",
        config: {
          "url" => "https://crm.domastore.example/api/leads",
          "http_method" => "POST",
          "headers" => [ { "key" => "X-Origem", "value" => "vekoo" } ],
          "body" => "{\"nome\":\"{{body.nome}}\",\"telefone\":\"{{body.telefone}}\"}"
        }
      )
      created.hook_actions.create!(type: "HookAction::CodeRunner", config: { "code" => "tag.add('crm');\nreturn params;" })
      created.rotate_signing_secret!
    end

    seed_logs(organization, order, form, crm)
  end

  def hook(organization, name, status)
    existing = Hook.find_by(organization_id: organization.id, name: name)
    return existing if existing

    Hook.create!(organization_id: organization.id, name: name, status: status).tap { |created| yield created }
  end

  def contact_action(hook, identifier, name)
    hook.hook_actions.create!(type: "HookAction::ContactHandling", config: { "contact_identifier" => identifier, "contact_name" => name })
  end

  def sample_captures
    [
      {
        "method" => "POST", "ip" => "189.40.71.12", "received_at" => 2.hours.ago.iso8601,
        "headers" => { "Content-Type" => "application/json", "User-Agent" => "Elementor/3.2" }, "query" => { "origem" => "site" },
        "body" => { "nome" => "Larissa Martins", "whatsapp" => "5541998127744", "interesse" => "Vestido de linho" }
      }
    ]
  end

  def seed_logs(organization, *hooks)
    return if HookLog.for_organization(organization.id).exists?

    random = Random.new(2026)
    hooks.each do |hook|
      30.times do |index|
        status = hook.inactive? ? "skipped" : (random.rand(10).zero? ? "error" : "success")
        log(organization, hook, status, random, index)
      end
      hook.update_columns(total_request: 30)
    end
  end

  def log(organization, hook, status, random, index)
    first = %w[Ana Beatriz Camila Daniela Eduarda Fernanda Gabriela Helena].sample(random: random)
    phone = "55419#{format('%08d', random.rand(10_000_000..99_999_999))}"

    created = HookLog.create!(
      hook_id: hook.id,
      hook_uid: hook.uid,
      hook_name: hook.name,
      organization_id: organization.id,
      request_method: "POST",
      request_headers: { "Content-Type" => "application/json", "User-Agent" => "DomaStore/1.0" },
      request_body: { "cliente" => { "nome" => first, "telefone" => phone }, "produto" => "Vestido de linho", "total" => 189.9 },
      request_query: {},
      request_ip: "177.70.#{random.rand(0..255)}.#{random.rand(1..254)}",
      status: status,
      status_code: status == "error" ? 500 : 200,
      error_message: status == "error" ? "A requisição não trouxe o identificador do contato." : nil,
      processing_time_ms: (20 + random.rand(180)).to_f,
      hook_status: hook.status
    )
    created.set(created_at: (index * 8).hours.ago - random.rand(3_600).seconds)
  end
end

VekooAutomationSeeds.call
