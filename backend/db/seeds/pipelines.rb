# Semente do domínio "pipelines": dois quadros da Doma Store (a mesma loja do catálogo, dos canais e da
# agenda), na organização da conta de demonstração: o comercial, com negócios, metas e gatilhos, e o de
# pós-venda, com pedidos em andamento. É obra do usuário fictício, não interface: fica em pt-BR mesmo
# quando a API responde em inglês.
#
# Os cards falam com as conversas da semente de conectores, e os responsáveis são as pessoas da semente
# de acesso. Nada dispara: gatilho, transmissão e aviso ficam desligados durante a carga.
#
# As datas são relativas ao dia em que a semente roda: o quadro nasce com card esfriando, card atrasado,
# meta do mês e histórico dos meses anteriores.
#
# Idempotente: o quadro é achado pelo nome. O que já existe fica como está, então rodar de novo não
# duplica e não desfaz o que a pessoa fez.
#
# Os modelos de quadro não entram aqui: nascem no primeiro uso (`BoardTemplate.ensure_defaults!`), porque
# em produção a semente não roda. Gravá-los também sujava a tabela, que é global: `spec/db/seeds_spec.rb`
# roda fora de transação e só limpa o que é da organização, e a linha que sobrava derrubava outra spec.
#
#   bin/rails runner 'load "db/seeds/pipelines.rb"'

Object.send(:remove_const, :VekooPipelinesSeeds) if defined?(VekooPipelinesSeeds)

module VekooPipelinesSeeds
  DEMO_EMAIL = "marina.duarte@exemplo.com.br".freeze
  COMMERCIAL = "Vendas no atacado".freeze
  AFTER_SALES = "Pós-venda".freeze

  LABELS = {
    "Atacado" => "#1D4ED8",
    "Quente" => "#DC2626",
    "Indicação" => "#059669",
    "Retorno" => "#D97706",
    "Urgente" => "#B91C1C",
    "Troca" => "#7C3AED",
    "Entrega" => "#0891B2"
  }.freeze

  COMMERCIAL_STAGES = [
    { name: "Novos contatos", color: "#90CAF9", sla_hours: 24 },
    { name: "Qualificação", color: "#CE93D8" },
    { name: "Proposta enviada", color: "#FFE082", sla_hours: 72 },
    { name: "Negociação", color: "#FFAB91", wip_limit: 8 },
    { name: "Fechamento", color: "#A5D6A7" }
  ].freeze

  AFTER_SALES_STAGES = [
    { name: "Pedido confirmado", color: "#90CAF9" },
    { name: "Separação", color: "#CE93D8", sla_hours: 48 },
    { name: "Enviado", color: "#FFE082" },
    { name: "Entregue", color: "#A5D6A7" },
    { name: "Acompanhamento", color: "#B0BEC5" }
  ].freeze

  # stage: índice da etapa. entered: há quantos dias está nela. owner: e-mail do responsável. chat: nome
  # do contato na semente de conectores.
  COMMERCIAL_CARDS = [
    { title: "Patrícia Gomes", chat: "Patrícia Gomes", stage: 0, entered: 0, priority: "medium", owner: "juliana.ferreira@exemplo.com.br",
      company: "Ateliê Gomes", email: "patricia@ateliegomes.com.br", phone: "5531988887777", value: 1_850, probability: 20,
      close_in: 30, fields: { "origem_do_contato" => "Anúncio", "pecas" => 15, "lead_score" => 10 }, labels: %w[Quente],
      description: "Veio pelo anúncio do Instagram. Quer saber da coleção de linho para revender no ateliê." },
    { title: "Pedido de uniformes da Escola Girassol", stage: 0, entered: 2, priority: "high", owner: "rafael.nunes@exemplo.com.br",
      company: "Escola Girassol", email: "compras@escolagirassol.com.br", phone: "4133224455", value: 9_600, probability: 25,
      close_in: 45, fields: { "origem_do_contato" => "Site", "pecas" => 160, "lead_score" => 25 }, labels: %w[Atacado],
      description: "Formulário do site: 160 camisetas polo para os professores e a equipe." },
    { title: "Carlos Eduardo Santos", chat: "Carlos Eduardo Santos", stage: 1, entered: 1, priority: "high", owner: "juliana.ferreira@exemplo.com.br",
      company: "Construtora Horizonte", email: "carlos@horizonte.com.br", phone: "5511987651234", value: 3_200, probability: 40,
      close_in: 20, fields: { "origem_do_contato" => "WhatsApp", "pecas" => 40, "lead_score" => 40 }, labels: %w[Atacado Quente],
      description: "40 camisetas de algodão para a equipe de obra. Já recebeu a tabela de atacado.",
      checks: [ "Confirmar quantidade de peças" ],
      comments: [
        { by: "juliana.ferreira@exemplo.com.br", body: "Ele vai levar a tabela para a diretoria. Combinei de ligar na quinta.", days_ago: 1, pinned: true,
          reactions: { "👍" => [ "rafael.nunes@exemplo.com.br" ] } },
        { by: "rafael.nunes@exemplo.com.br", body: "Se fechar acima de 50 peças, dá para fazer o frete grátis.", days_ago: 0,
          replies: [ { by: "juliana.ferreira@exemplo.com.br", body: "Boa, vou oferecer. Obrigada!" } ] }
      ],
      checklists: [ { name: "Antes da proposta", items: [ [ "Pedir o logo em alta resolução", true ], [ "Conferir a grade de tamanhos", false ], [ "Consultar o prazo com a confecção", false ] ] } ] },
    { title: "Reposição da Boutique Maré Alta", stage: 1, entered: 12, priority: "medium", owner: "rafael.nunes@exemplo.com.br",
      company: "Boutique Maré Alta", email: "contato@marealta.com.br", phone: "4832229090", value: 4_750, probability: 35,
      close_in: -3, fields: { "origem_do_contato" => "Indicação", "pecas" => 60, "lead_score" => 35 }, labels: %w[Indicação Retorno],
      description: "Quer repor vestidos midi e bolsas de palha. Faz duas semanas que não responde.",
      comments: [ { by: "rafael.nunes@exemplo.com.br", body: "Mandei duas mensagens e nada. Tento de novo depois do feriado.", days_ago: 5 } ] },
    { title: "Camila Ferraz", chat: "Camila Ferraz", stage: 2, entered: 2, priority: "medium", owner: "juliana.ferreira@exemplo.com.br",
      company: "Loja Ferraz", email: "camila@lojaferraz.com.br", value: 2_380, probability: 55,
      close_in: 12, fields: { "origem_do_contato" => "Instagram", "pecas" => 30, "lead_score" => 55, "validade_da_proposta" => 10.days.from_now.to_date.iso8601 },
      labels: %w[Quente], description: "Revende no Instagram. Gostou do midi de linho do P ao GG." },
    { title: "Kit de boas-vindas da Agência Lume", stage: 2, entered: 5, priority: "high", owner: "rafael.nunes@exemplo.com.br",
      company: "Agência Lume", email: "pessoas@agencialume.com.br", phone: "4130305050", value: 7_400, probability: 60,
      close_in: 15, due_in: -1, fields: { "origem_do_contato" => "Indicação", "pecas" => 90, "lead_score" => 60, "validade_da_proposta" => 3.days.from_now.to_date.iso8601 },
      labels: %w[Atacado Indicação], description: "Camiseta e caneca personalizadas para cada pessoa nova. Prazo da proposta venceu ontem." },
    { title: "Fernanda Lima", chat: "Fernanda Lima", stage: 3, entered: 1, priority: "urgent", owner: "juliana.ferreira@exemplo.com.br",
      company: "Empório da Fernanda", email: "fernanda@emporiodafernanda.com.br", phone: "5531971810932", value: 5_900, probability: 75,
      close_in: 7, fields: { "origem_do_contato" => "WhatsApp", "pecas" => 70, "lead_score" => 80 }, labels: %w[Quente Retorno],
      description: "Quer todo o lote novo de bolsas de palha do Maranhão. Pediu 5% à vista.",
      comments: [ { by: "juliana.ferreira@exemplo.com.br", body: "Dá para dar os 5% à vista? O lote inteiro sai de uma vez.", days_ago: 0,
                    reactions: { "👀" => [ "rafael.nunes@exemplo.com.br" ] } } ] },
    { title: "Coleção de verão da Rede Sol & Mar", stage: 3, entered: 9, priority: "high", owner: "rafael.nunes@exemplo.com.br",
      company: "Rede Sol & Mar", email: "compras@soleemar.com.br", phone: "7132324040", value: 18_500, probability: 65,
      close_in: 25, fields: { "origem_do_contato" => "Site", "pecas" => 240, "lead_score" => 70 }, labels: %w[Atacado],
      description: "Rede de 6 lojas em Salvador. Negociando o prazo de pagamento em 3 vezes." },
    { title: "Hotel Serra Azul: enxoval da loja", stage: 4, entered: 1, priority: "medium", owner: "juliana.ferreira@exemplo.com.br",
      company: "Hotel Serra Azul", email: "gerencia@serraazul.com.br", phone: "5433310022", value: 6_200, probability: 90,
      close_in: 3, fields: { "origem_do_contato" => "Indicação", "pecas" => 80, "lead_score" => 90 }, labels: %w[Atacado Quente],
      description: "Contrato em revisão. Falta só a forma de pagamento para fechar." },
    { title: "Lucas Oliveira", chat: "Lucas Oliveira", stage: 4, entered: 3, priority: "medium", owner: "juliana.ferreira@exemplo.com.br",
      company: "Oliveira Presentes", email: "lucas@oliveirapresentes.com.br", phone: "5541991234567", value: 2_750, probability: 100,
      won: 2, fields: { "origem_do_contato" => "WhatsApp", "pecas" => 35, "lead_score" => 100, "forma_de_pagamento" => "Pix" }, labels: %w[Indicação],
      description: "Primeira compra no atacado. Pagou no Pix." },
    { title: "Café Colonial Dona Rosa", stage: 4, entered: 8, priority: "low", owner: "rafael.nunes@exemplo.com.br",
      company: "Café Colonial Dona Rosa", value: 3_900, probability: 100, won: 6,
      fields: { "origem_do_contato" => "Indicação", "pecas" => 50, "forma_de_pagamento" => "Boleto" }, labels: %w[Indicação],
      description: "Aventais e canecas para a loja nova." },
    { title: "Daniela Souza", chat: "Daniela Souza", stage: 2, entered: 7, priority: "low", owner: "juliana.ferreira@exemplo.com.br",
      company: "Studio Dani", value: 1_200, probability: 0, lost: 4, lost_reason: "Preço acima do orçamento",
      fields: { "origem_do_contato" => "Instagram", "pecas" => 12 }, description: "Achou o frete caro para a quantidade." },
    { title: "Mercado Bom Preço", stage: 3, entered: 20, priority: "medium", owner: "rafael.nunes@exemplo.com.br",
      company: "Mercado Bom Preço", value: 4_100, probability: 0, lost: 15, lost_reason: "Fechou com outro fornecedor",
      fields: { "origem_do_contato" => "Site", "pecas" => 55 }, description: "Fechou com um fornecedor local." },
    # Negócios de meses anteriores, para o histórico de metas.
    { title: "Loja Flor de Lis", stage: 4, entered: 40, priority: "medium", owner: "juliana.ferreira@exemplo.com.br", company: "Flor de Lis", value: 12_400, probability: 100,
      won: 35, archived: true, fields: { "origem_do_contato" => "Site", "pecas" => 150, "forma_de_pagamento" => "Boleto" }, description: "Coleção de inverno." },
    { title: "Clube Pinheiros: camisetas do torneio", stage: 4, entered: 70, priority: "medium", owner: "rafael.nunes@exemplo.com.br", company: "Clube Pinheiros", value: 15_800, probability: 100,
      won: 65, archived: true, fields: { "origem_do_contato" => "Indicação", "pecas" => 200, "forma_de_pagamento" => "Pix" }, description: "Torneio de fim de ano." },
    { title: "Rede Bem Estar: kits de Natal", stage: 4, entered: 100, priority: "high", owner: "juliana.ferreira@exemplo.com.br", company: "Rede Bem Estar", value: 21_300, probability: 100,
      won: 95, archived: true, fields: { "origem_do_contato" => "Site", "pecas" => 280, "forma_de_pagamento" => "Boleto" }, description: "Kits para os funcionários." },
    { title: "Sorveteria Polar", stage: 1, entered: 95, priority: "low", owner: "rafael.nunes@exemplo.com.br", company: "Sorveteria Polar", value: 900, archived: true,
      fields: { "origem_do_contato" => "Anúncio" }, description: "Nunca mais respondeu. Arquivado na limpeza do funil." }
  ].freeze

  AFTER_SALES_CARDS = [
    { title: "Pedido 48213: Roberto Nascimento", chat: "Roberto Nascimento", stage: 2, entered: 2, priority: "medium", owner: "thiago.almeida@exemplo.com.br",
      phone: "5571999990000", due_in: 2, fields: { "numero_do_pedido" => "48213", "transportadora" => "Jadlog", "codigo_de_rastreio" => "JD482130077BR" }, labels: %w[Entrega],
      description: "A transportadora confirmou a saída. Entrega combinada para a tarde.",
      comments: [ { by: "thiago.almeida@exemplo.com.br", body: "Rastreio enviado por modelo, porque a janela de 24 horas já tinha fechado.", days_ago: 1 } ] },
    { title: "Pedido 48177: Márcia Regina", chat: "Márcia Regina Costa", stage: 1, entered: 3, priority: "urgent", owner: "thiago.almeida@exemplo.com.br",
      phone: "5521998761234", due_in: -1, fields: { "numero_do_pedido" => "48177", "transportadora" => "Loggi" }, labels: %w[Urgente Entrega],
      description: "O vestido chemise chegou sem o cinto. Precisa do cinto até sábado.",
      checks: [ "Conferir as peças" ],
      comments: [
        { by: "camila.rocha@exemplo.com.br", body: "Ela está preocupada: é para um evento no sábado.", days_ago: 1, pinned: true },
        { by: "thiago.almeida@exemplo.com.br", body: "Separei o cinto. Sai hoje pela Loggi.", days_ago: 0, reactions: { "🙌" => [ "camila.rocha@exemplo.com.br" ] } }
      ],
      checklists: [ { name: "Reenvio do cinto", items: [ [ "Localizar o cinto no estoque", true ], [ "Embalar com a nota", true ], [ "Agendar a coleta", false ] ] } ] },
    { title: "Troca: João Pedro Almeida", chat: "João Pedro Almeida", stage: 0, entered: 0, priority: "medium", owner: "camila.rocha@exemplo.com.br",
      fields: { "numero_do_pedido" => "48240" }, labels: %w[Troca],
      description: "Camiseta pima G por M, em preto. Vai trazer na loja até sexta.",
      checklists: [ { name: "Troca", items: [ [ "Separar a camiseta M preta", true ], [ "Receber a G na loja", false ] ] } ] },
    { title: "Pedido 48098: Lucas Oliveira", chat: "Lucas Oliveira", stage: 4, entered: 3, priority: "low", owner: "thiago.almeida@exemplo.com.br",
      fields: { "numero_do_pedido" => "48098", "transportadora" => "Correios", "codigo_de_rastreio" => "QB480980112BR" },
      description: "Chegou certinho. Mandar pesquisa de satisfação em 7 dias.", due_in: 4 },
    { title: "Pedido 48195: Beatriz Carvalho", chat: "Beatriz Carvalho", stage: 3, entered: 1, priority: "low", owner: "thiago.almeida@exemplo.com.br",
      fields: { "numero_do_pedido" => "48195", "transportadora" => "Correios", "codigo_de_rastreio" => "QB481950045BR" }, labels: %w[Entrega],
      description: "Entregue ontem." },
    { title: "Pedido 47950: Rafael Mendes", chat: "Rafael Mendes", stage: 4, entered: 40, priority: "low", owner: "thiago.almeida@exemplo.com.br", archived: true,
      fields: { "numero_do_pedido" => "47950", "transportadora" => "Correios" }, description: "Atendimento encerrado." }
  ].freeze

  module_function

  def call
    owner = Account.find_by(email: DEMO_EMAIL)
    return nil unless owner

    organization = owner.organization
    load Rails.root.join("db/seeds/access.rb") unless organization.accounts.where(email: "juliana.ferreira@exemplo.com.br").exists?
    load Rails.root.join("db/seeds/connectors.rb") unless organization.chats.exists?

    @organization = organization
    @owner = owner
    @labels = seed_labels

    after_sales = seed_after_sales
    seed_commercial(after_sales)

    organization
  end

  def person(email)
    @people ||= {}
    @people[email] ||= @organization.accounts.find_by(email: email) || @owner
  end

  def seed_labels
    LABELS.to_h do |name, color|
      [ name, @organization.pipeline_labels.find_or_create_by!(name: name) { |label| label.color = color } ]
    end
  end

  def seed_board(name, stages_config, **attributes)
    return nil if @organization.pipeline_boards.exists?(name: name)

    board = @organization.pipeline_boards.create!(name: name, **attributes)
    stages = stages_config.map { |config| board.stages.create!(config) }
    [ board, stages ]
  end

  # ── Vendas no atacado ─────────────────────────────────────────

  def seed_commercial(after_sales)
    created = seed_board(
      COMMERCIAL, COMMERCIAL_STAGES,
      description: "Negociações de revenda e de pedidos para empresas, do primeiro contato ao fechamento.",
      color: "#1D4ED8", icon: "hand-coins", board_type: "crm",
      deal_rotting_days: 7, deal_close_behavior: "auto_archive_days", deal_close_archive_days: 30,
      require_fields_on_deal_won: true, auto_archive_days: 90
    )
    return unless created

    board, stages = created

    create_fields(board, [
      { name: "Origem do contato", field_type: "select", options: %w[WhatsApp Instagram Anúncio Site Indicação], required: true },
      { name: "Peças", field_type: "number" },
      { name: "Lead Score", field_type: "number", default_value: "0" },
      { name: "Forma de pagamento", field_type: "select", options: %w[Pix Boleto Cartão], required: true },
      { name: "Validade da proposta", field_type: "date", scope: "stage", stage: stages[2], required_to_leave_stage: true }
    ])
    board.update!(lead_score_field_key: "lead_score")

    create_stage_checklist(stages[1], [ [ "Confirmar quantidade de peças", true ], [ "Entender o prazo de entrega", true ], [ "Anotar quem decide a compra", false ] ])
    create_stage_checklist(stages[2], [ [ "Enviar a tabela de preços", true ] ])

    cards = create_cards(COMMERCIAL_CARDS, stages)
    create_goals(board)
    triggers = create_commercial_triggers(board, stages, after_sales)
    create_trigger_history(triggers, cards)
    create_saved_filters(board)
  end

  def create_commercial_triggers(board, stages, after_sales)
    target_stage = after_sales&.stages&.first
    triggers = [
      board.triggers.create!(
        name: "Distribuir novos contatos", event_type: "card_created", stage: stages[0],
        actions: [ { "type" => "assign_user", "account_ids" => [ person("juliana.ferreira@exemplo.com.br").id, person("rafael.nunes@exemplo.com.br").id ] } ]
      ),
      board.triggers.create!(
        name: "Avisar a gerência de venda ganha", event_type: "deal_won",
        actions: [ { "type" => "notify", "account_ids" => [ person("rafael.nunes@exemplo.com.br").id ], "message" => "{{card.title}} fechou por R$ {{card.deal_value}}." } ]
      ),
      board.triggers.create!(
        name: "Pedir o retorno de quem esfriou", event_type: "sla_breached", stage: stages[2], active: false,
        conditions: { "stage_name" => "Proposta enviada" },
        actions: [ { "type" => "notify", "message" => "{{card.title}} está parado em {{stage.name}}." } ]
      ),
      board.triggers.create!(
        name: "Somar pontos ao avançar", event_type: "card_moved",
        actions: [ {
          "type" => "run_code",
          "code" => "const card = kanban.card(params.card.id);\nconst total = card.incrementCustomField('Lead Score', 10);\nreturn { pontos: total };",
          "timeout_ms" => 5000
        } ]
      )
    ]

    if target_stage
      triggers << board.triggers.create!(
        name: "Abrir o pedido no pós-venda", event_type: "deal_won",
        actions: [ {
          "type" => "create_card", "target_board_id" => after_sales.id, "target_stage_id" => target_stage.id,
          "card_title_template" => "Pedido: {{card.company_name}}", "card_description_template" => "Venda de R$ {{card.deal_value}}, fechada por {{card.assigned_to}}.",
          "card_inherit_labels" => true, "card_priority" => "medium"
        } ]
      )
    end

    triggers
  end

  def create_trigger_history(triggers, cards)
    won_cards = cards.select(&:won_at)
    code_trigger = triggers.find(&:runs_code?)
    notify_trigger = triggers.find { |trigger| trigger.event_type == "deal_won" }

    won_cards.first(3).each_with_index do |card, index|
      Pipelines::TriggerExecution.create!(
        trigger: notify_trigger, card: card, status: "success", executed_at: card.won_at + 1.minute,
        executed_actions: [ { "type" => "notify", "status" => "success", "notified" => 1 } ]
      )
      Pipelines::TriggerExecution.create!(
        trigger: code_trigger, card: card, status: index.zero? ? "failure" : "success", executed_at: card.won_at - 1.hour,
        executed_actions: [ { "type" => "run_code", "status" => index.zero? ? "failure" : "success" }.merge(index.zero? ? { "error" => "TypeError: card is null" } : { "result" => "{\"pontos\":#{40 + index * 10}.0}" }) ],
        error_message: index.zero? ? "TypeError: card is null" : nil
      )
    end
  end

  def create_goals(board)
    today = Date.current.beginning_of_month
    targets = { 0 => 45_000, 1 => 40_000, 2 => 38_000, 3 => 35_000, 4 => 30_000, 5 => 30_000 }

    targets.each do |months_ago, value|
      board.goals.create!(scope: "funnel", period_month: today.prev_month(months_ago), target_value: value, created_by: @owner)
    end

    { "juliana.ferreira@exemplo.com.br" => 22_000, "rafael.nunes@exemplo.com.br" => 18_000 }.each do |email, value|
      board.goals.create!(scope: "user", assigned_account: person(email), period_month: today, target_value: value, created_by: @owner)
    end
  end

  def create_saved_filters(board)
    big = board.saved_filters.create!(
      organization: @organization, owner: person("rafael.nunes@exemplo.com.br"), name: "Vendas acima de R$ 5 mil", visibility: "shared",
      definition: { "version" => 1, "all" => [ { "field" => "deal_value", "operator" => "gte", "value" => 5000 }, { "field" => "deal_status", "operator" => "eq", "value" => "open" } ], "any" => [] }
    )
    mine = board.saved_filters.create!(
      organization: @organization, owner: @owner, name: "Atacado quente", visibility: "private",
      definition: { "version" => 1, "all" => [ { "field" => "label_ids", "operator" => "contains_any", "value" => [ @labels.fetch("Atacado").id, @labels.fetch("Quente").id ] } ], "any" => [] }
    )

    Pipelines::SavedFilterFavorite.create!(user: @owner, board: board, saved_filter: big)
    Pipelines::SavedFilterFavorite.create!(user: @owner, board: board, saved_filter: mine)
    Pipelines::SavedFilterFavorite.create!(user: @owner, board: board, preset_key: "rotten_deals")
  end

  # ── Pós-venda ─────────────────────────────────────────────────

  def seed_after_sales
    created = seed_board(
      AFTER_SALES, AFTER_SALES_STAGES,
      description: "O caminho de cada pedido depois da compra: separação, envio, entrega e acompanhamento.",
      color: "#0891B2", icon: "package-check", board_type: "standard", auto_archive_days: 60
    )
    return @organization.pipeline_boards.find_by(name: AFTER_SALES) unless created

    board, stages = created

    create_fields(board, [
      { name: "Número do pedido", field_type: "text", required: true },
      { name: "Transportadora", field_type: "select", options: %w[Correios Jadlog Loggi] },
      { name: "Código de rastreio", field_type: "text", scope: "stage", stage: stages[2], required_to_leave_stage: true }
    ])

    create_stage_checklist(stages[1], [ [ "Conferir as peças", true ], [ "Embalar com a nota fiscal", true ] ])

    cards = create_cards(AFTER_SALES_CARDS, stages)
    board.triggers.create!(
      name: "Avisar o contato do envio", event_type: "card_moved", stage: stages[2], active: false,
      actions: [ { "type" => "send_whatsapp_message", "target" => "card_contact",
                   "connector_id" => @organization.connectors.where(_type: "Connector::WhatsappWeb").take&.id&.to_s,
                   "message" => "Seu pedido saiu para entrega! O código de rastreio é {{card.custom_field.codigo_de_rastreio}}." } ]
    )
    board.triggers.create!(
      name: "Avisar a transportadora", event_type: "card_moved", stage: stages[2], active: false,
      actions: [ { "type" => "fire_webhook", "url" => "https://api.exemplo.com.br/coletas", "method" => "POST",
                   "headers" => { "X-Chave" => "chave-da-transportadora" },
                   "body_template" => "{\"pedido\":\"{{card.title}}\",\"etapa\":\"{{stage.name}}\"}" } ]
    )
    cards.first&.watchers&.create!(account: person("camila.rocha@exemplo.com.br"))

    board
  end

  # ── Apoio ─────────────────────────────────────────────────────

  def create_fields(board, specs)
    specs.each { |spec| board.custom_fields.create!(spec) }
  end

  def create_stage_checklist(stage, items)
    items.each { |title, required| stage.checklist_items.create!(title: title, required: required) }
  end

  def chat_for(name)
    return nil if name.blank?

    Chat.where(organization_id: @organization.id.to_s, user_name: name).take
  end

  def create_cards(specs, stages)
    specs.map { |spec| create_card(spec, stages) }
  end

  def create_card(spec, stages)
    stage = stages.fetch(spec[:stage])
    entered_at = spec[:entered].days.ago
    created_at = entered_at - (spec[:stage] * 3).days - 1.day
    responsible = spec[:owner] && person(spec[:owner])

    # A pessoa do `Current` assina as atividades do card.
    Current.set(account: responsible) do
      card = stage.cards.new(card_attributes(spec, responsible, entered_at, created_at))
      card.suppress_broadcast = true
      card.suppress_trigger_evaluation = true
      card.save!

      backfill_path(card, stages, spec, entered_at, created_at)
      Array(spec[:labels]).each { |name| card.card_labels.create!(label: @labels.fetch(name)) }
      card.activities.where(action: "created").update_all(created_at: created_at)
      card.activities.where(action: "label_added").update_all(created_at: created_at + 5.minutes)
      create_checks(card, stage, spec)
      create_card_checklists(card, spec)
      create_comments(card, spec)
      card
    end
  end

  def card_attributes(spec, responsible, entered_at, created_at)
    {
      title: spec[:title],
      description: spec[:description],
      priority: spec[:priority],
      assigned_to: responsible,
      created_by: responsible,
      chat_id: chat_for(spec[:chat])&.id&.to_s,
      company_name: spec[:company],
      contact_email: spec[:email],
      contact_phone: spec[:phone],
      deal_value: spec[:value],
      deal_probability: spec[:probability],
      expected_close_date: spec[:close_in] && spec[:close_in].days.from_now.to_date,
      due_date: spec[:due_in] && spec[:due_in].days.from_now,
      custom_field_values: spec[:fields] || {},
      tags: Array(spec[:tags]),
      archived: spec[:archived] || false,
      won_at: spec[:won] && spec[:won].days.ago,
      lost_at: spec[:lost] && spec[:lost].days.ago,
      lost_reason: spec[:lost_reason],
      completed_at: (spec[:won] || spec[:lost]) && (spec[:won] || spec[:lost]).days.ago,
      stage_entered_at: entered_at,
      created_at: created_at,
      updated_at: entered_at
    }
  end

  # As passagens pelas etapas anteriores: é delas que sai o tempo médio por etapa nas métricas.
  def backfill_path(card, stages, spec, entered_at, created_at)
    (1..spec[:stage]).each do |index|
      moved_at = index == spec[:stage] ? entered_at : created_at + (index * 3).days
      card.activities.create!(
        action: "moved",
        created_at: moved_at,
        account_id: card.assigned_to_id,
        details: {
          from_stage_id: stages[index - 1].id, to_stage_id: stages[index].id,
          from_stage: stages[index - 1].name, to_stage: stages[index].name
        }
      )
    end

    if spec[:won]
      card.activities.create!(action: "deal_won", created_at: spec[:won].days.ago, account_id: card.assigned_to_id, details: { deal_value: card.deal_value })
    elsif spec[:lost]
      card.activities.create!(action: "deal_lost", created_at: spec[:lost].days.ago, account_id: card.assigned_to_id, details: { deal_value: card.deal_value, reason: spec[:lost_reason] })
    end
  end

  def create_checks(card, stage, spec)
    Array(spec[:checks]).each do |title|
      item = stage.checklist_items.find_by!(title: title)
      card.stage_checks.create!(checklist_item: item, completed: true, completed_at: 1.day.ago, completed_by: card.assigned_to)
    end
  end

  def create_card_checklists(card, spec)
    Array(spec[:checklists]).each do |config|
      checklist = card.checklists.create!(name: config[:name])
      config[:items].each { |title, completed| checklist.items.create!(title: title, completed: completed) }
    end
  end

  def create_comments(card, spec)
    Array(spec[:comments]).each do |config|
      at = config[:days_ago].days.ago.change(hour: 10, min: 15)
      comment = card.comments.create!(body: config[:body], author: person(config[:by]), pinned: config[:pinned] || false, created_at: at, updated_at: at)

      config[:reactions]&.each do |emoji, emails|
        emails.each { |email| comment.reactions.create!(user: person(email), emoji: emoji) }
      end

      Array(config[:replies]).each_with_index do |reply, index|
        card.comments.create!(body: reply[:body], author: person(reply[:by]), parent: comment, created_at: at + (index + 1).hours, updated_at: at + (index + 1).hours)
      end
    end
  end
end

pipelines_organization = VekooPipelinesSeeds.call

if pipelines_organization
  pipelines_boards = pipelines_organization.pipeline_boards
  pipelines_cards = Pipelines::Card.where(organization_id: pipelines_organization.id)

  puts <<~REPORT

    Pipelines.

      Pipelines   #{pipelines_boards.count} (#{pipelines_boards.pluck(:name).join(', ')})
      Etapas      #{Pipelines::Stage.where(board_id: pipelines_boards.select(:id)).count}
      Cards       #{pipelines_cards.count} (#{pipelines_cards.where(archived: true).count} arquivados, #{pipelines_cards.won.count} ganhos, #{pipelines_cards.lost.count} perdidos)
      Comentários #{Pipelines::Comment.where(card_id: pipelines_cards.unscope(:order).select(:id)).count}
      Gatilhos    #{Pipelines::Trigger.where(board_id: pipelines_boards.select(:id)).count}
      Metas       #{Pipelines::Goal.where(board_id: pipelines_boards.select(:id)).count}
      Etiquetas   #{pipelines_organization.pipeline_labels.count}
  REPORT
end
