# Semente do domínio "insights": 90 dias de números para o dashboard não nascer vazio, dois funis com
# as conversas da Doma Store distribuídas nas etapas, e um dashboard personalizado de exemplo, na
# organização da conta de demonstração. É obra do usuário fictício, não interface: fica em pt-BR mesmo
# quando a API responde em inglês.
#
# Os números de `daily_chat_stats` são escritos aqui, e não calculados das mensagens: a semente de
# conectores só tem alguns dias de conversa. O job de hora em hora recalcula o dia corrente a partir
# das mensagens de verdade, então o dia de hoje pode cair depois que ele rodar. É o esperado.
#
# Idempotente: dia, funil e dashboard que já existem ficam como estão, e a posição das conversas só é
# distribuída quando o funil nasce: rodar de novo não desfaz o que a pessoa moveu. Os números são
# sempre os mesmos para o mesmo dia.
#
#   bin/rails runner 'load "db/seeds/insights.rb"'

Object.send(:remove_const, :VekooInsightsSeeds) if defined?(VekooInsightsSeeds)

module VekooInsightsSeeds
  DEMO_EMAIL = "marina.duarte@exemplo.com.br"
  HISTORY_DAYS = 90

  # Quanto cada canal pesa nas conversas novas.
  CHANNELS = { "whatsapp_api" => 0.66, "instagram" => 0.21, "web" => 0.09, "facebook" => 0.04 }.freeze
  # Segunda a sábado de loja: domingo quase parado, e o movimento sobe até sexta.
  WEEKDAY_WEIGHT = { 0 => 0.25, 1 => 0.9, 2 => 1.0, 3 => 1.05, 4 => 1.1, 5 => 1.25, 6 => 0.8 }.freeze
  # Picos no meio da manhã e no fim da tarde.
  HOUR_WEIGHT = {
    7 => 1, 8 => 3, 9 => 7, 10 => 10, 11 => 9, 12 => 6, 13 => 6, 14 => 8, 15 => 9, 16 => 10, 17 => 9, 18 => 7, 19 => 5, 20 => 4, 21 => 3, 22 => 1
  }.freeze

  FUNNELS = [
    {
      name: "Vendas da loja",
      description: "Do primeiro contato até o pedido fechado.",
      stages: [ "Novo contato", "Em atendimento", "Proposta enviada", "Pedido fechado" ],
      # Fora quem fica "Sem etapa": uma conversa em cada cinco.
      weights: [ 8, 6, 4, 2 ]
    },
    {
      name: "Pós-venda",
      description: "Depois da entrega: troca, ajuste e retorno.",
      stages: [ "Entrega feita", "Pediu troca", "Resolvido" ],
      weights: [ 5, 2, 3 ]
    }
  ].freeze

  DASHBOARD_NAME = "Atendimento da semana".freeze
  DASHBOARD_WIDGETS = [
    {
      widget_type: "section_divider", title: "Visão geral", position: 0,
      layout: { "x" => 0, "y" => 0, "w" => 12, "h" => 1 }
    },
    {
      widget_type: "kpi", title: "Conversas novas", data_source: "conversations", position: 1,
      query: { "dataSource" => "conversations", "metrics" => [ { "aggregation" => "count", "label" => "Conversas" } ] },
      visual_config: { "format" => "number" },
      layout: { "x" => 0, "y" => 1, "w" => 3, "h" => 3 }
    },
    {
      widget_type: "kpi", title: "Comparecimento", data_source: "agenda_bookings", position: 2,
      query: {
        "dataSource" => "agenda_bookings",
        "metrics" => [ { "aggregation" => "count", "label" => "Compareceram", "filters" => [ { "field" => "attendance_status", "operator" => "eq", "value" => "show" } ] } ]
      },
      visual_config: { "format" => "number" },
      layout: { "x" => 3, "y" => 1, "w" => 3, "h" => 3 }
    },
    {
      widget_type: "line_chart", title: "Conversas novas por dia", data_source: "conversations", position: 3,
      query: {
        "dataSource" => "conversations",
        "metrics" => [ { "aggregation" => "count", "label" => "Conversas" } ],
        "dimensions" => [ { "field" => "created_at", "granularity" => "day" } ]
      },
      visual_config: { "curved" => true, "showGrid" => true },
      layout: { "x" => 6, "y" => 1, "w" => 6, "h" => 5 }
    },
    {
      widget_type: "donut_chart", title: "De onde vêm as conversas", data_source: "conversations", position: 4,
      query: {
        "dataSource" => "conversations",
        "metrics" => [ { "aggregation" => "count", "label" => "Conversas" } ],
        "dimensions" => [ { "field" => "audience_type" } ]
      },
      visual_config: { "showLegend" => true },
      layout: { "x" => 0, "y" => 4, "w" => 6, "h" => 5 }
    },
    {
      widget_type: "bar_chart", title: "Mensagens por dia, nos números do dashboard", data_source: "daily_stats", position: 5,
      query: {
        "dataSource" => "daily_stats",
        "metrics" => [
          { "field" => "messages_inbound", "aggregation" => "sum", "label" => "Recebidas" },
          { "field" => "messages_sent_by_human", "aggregation" => "sum", "label" => "Enviadas pela equipe" }
        ],
        "dimensions" => [ { "field" => "day", "granularity" => "week" } ]
      },
      visual_config: { "stacked" => true, "showLegend" => true },
      layout: { "x" => 6, "y" => 6, "w" => 6, "h" => 5 }
    },
    {
      widget_type: "table", title: "Conversas por atendente", data_source: "conversations", position: 6,
      query: {
        "dataSource" => "conversations",
        "metrics" => [
          { "aggregation" => "count", "label" => "Conversas" },
          { "aggregation" => "count", "label" => "Abertas", "filters" => [ { "field" => "status", "operator" => "eq", "value" => "open" } ] },
          { "field" => "unread_messages", "aggregation" => "sum", "label" => "Não lidas" }
        ],
        "dimensions" => [ { "field" => "assigned_account_id" } ],
        "sort" => { "field" => "Conversas", "direction" => "desc" }
      },
      visual_config: { "showTotals" => true },
      layout: { "x" => 0, "y" => 9, "w" => 6, "h" => 5 }
    },
    {
      widget_type: "rich_text", title: "Como ler este dashboard", position: 7,
      visual_config: { "content" => "Os números de hoje entram de hora em hora. Para olhar outro período, mude as datas no alto da página." },
      layout: { "x" => 6, "y" => 11, "w" => 6, "h" => 3 }
    }
  ].freeze

  module_function

  def call
    owner = Account.find_by(email: DEMO_EMAIL)
    return nil unless owner

    organization = owner.organization
    # Vem depois de conectores na ordem alfabética, mas pode ser carregada sozinha.
    load Rails.root.join("db/seeds/connectors.rb") unless organization.chats.exists?

    {
      stats: seed_daily_stats(organization),
      funnels: FUNNELS.map { |spec| seed_funnel(organization, spec) },
      dashboard: seed_dashboard(organization, owner)
    }
  end

  # O que já existe fica: `insert_all` pula o dia que já tem linha, e o que o job gravou continua lá.
  def seed_daily_stats(organization)
    today = organization.reporting_zone.today
    people = organization.accounts.active.where(setup_only: false).order(:name).pluck(:id)
    days = ((today - (HISTORY_DAYS - 1).days)..today).to_a

    rows = days.each_with_index.map do |day, index|
      metrics, hourly = day_numbers(day, index, people)

      { organization_id: organization.id, day: day, metrics: metrics, hourly_breakdown: { message_count: hourly } }
    end

    DailyChatStat.insert_all(rows, unique_by: %i[organization_id day])

    DailyChatStat.where(organization_id: organization.id).count
  end

  # O sorteio nasce do próprio dia: a mesma data dá sempre os mesmos números.
  def day_numbers(day, index, people)
    random = Random.new(day.jd)
    # Cresce devagar ao longo dos 90 dias.
    growth = 1.0 + (index.to_f / HISTORY_DAYS) * 0.4
    pace = WEEKDAY_WEIGHT.fetch(day.wday) * growth * random.rand(0.85..1.15)

    started = (22 * pace).round
    active = (started * random.rand(1.9..2.5)).round
    inbound = (active * random.rand(3.6..4.6)).round
    automation = (inbound * random.rand(0.45..0.6)).round
    human = (inbound * random.rand(0.32..0.45)).round
    # Uma campanha a cada duas semanas, mais ou menos.
    campaign = (index % 14 == 6 ? random.rand(180..320) : 0)

    automation_count = (started * random.rand(0.5..0.68)).round
    human_count = (started * random.rand(0.2..0.32)).round
    human_touch = (started * random.rand(0.38..0.5)).round

    metrics = {
      chats_started: started,
      chats_by_channel: split(started, CHANNELS),
      active_chats: active,
      automation_chats: (active * random.rand(0.55..0.7)).round,
      messages_inbound: inbound,
      messages_sent_by_automation: automation,
      messages_sent_by_campaign: campaign,
      messages_sent_by_human: human,
      messages_by_account: split(human, ranking_weights(people, day)),
      out_of_hours_messages: (automation * random.rand(0.2..0.34)).round,
      hours_saved: Insights::Efficiency.hours_saved(automation),
      messages_avoided: Insights::Efficiency.messages_avoided(automation, human),
      automation_bookings: random.rand(0..3),
      first_response_automation_seconds_sum: (automation_count * random.rand(14.0..38.0)).round(2),
      first_response_automation_count: automation_count,
      first_response_human_seconds_sum: (human_count * random.rand(240.0..780.0)).round(2),
      first_response_human_count: human_count,
      chats_with_human_touch: human_touch,
      chats_handled_by_automation: [ (started * random.rand(0.32..0.46)).round, started - human_touch ].min
    }

    [ metrics, split(inbound + automation + human, HOUR_WEIGHT.transform_keys(&:to_s)) ]
  end

  # A primeira pessoa da lista atende mais, e a ordem muda um pouco de semana para semana.
  def ranking_weights(people, day)
    people.rotate(day.cweek % [ people.size, 1 ].max).each_with_index.to_h { |id, index| [ id, 1.0 / (index + 1) ] }
  end

  # Reparte o total pelos pesos, sem perder nem inventar nada no arredondamento.
  def split(total, weights)
    return {} if weights.empty? || total.zero?

    whole = weights.values.sum.to_f
    shares = weights.transform_values { |weight| (total * weight / whole).floor }
    remainder = total - shares.values.sum
    first_key = weights.keys.first
    shares[first_key] += remainder

    shares.reject { |_, value| value.zero? }
  end

  def seed_funnel(organization, spec)
    existing = organization.funnels.find_by(name: spec[:name])
    return existing if existing

    funnel = Funnels::Save.new(
      organization.funnels.new,
      { name: spec[:name], description: spec[:description] },
      stages: spec[:stages].map { |name| { name: name } }
    ).call

    place_chats(organization, funnel, spec[:weights])
    funnel
  end

  # Espalha as conversas pelas etapas, sem transmitir: não há ninguém olhando uma semente. Quem sobra
  # fica em "Sem etapa", que é coluna de verdade no quadro.
  def place_chats(organization, funnel, weights)
    slots = weights.each_with_index.flat_map { |weight, index| [ funnel.stages[index] ] * weight }
    slots += [ nil ] * (slots.size / 4)

    organization.chats.valid_records.order_by(last_message_at: :desc, _id: :asc).each_with_index do |chat, index|
      stage = slots[index % slots.size]
      chat.place_in_funnel!(funnel.id, stage.id) if stage
    end
  end

  def seed_dashboard(organization, owner)
    existing = organization.custom_dashboards.where(name: DASHBOARD_NAME).take
    return existing if existing

    dashboard = CustomDashboard.new(
      organization_id: organization.id.to_s,
      created_by_account_id: owner.id.to_s,
      name: DASHBOARD_NAME,
      description: "Conversas, agenda e equipe, num lugar só.",
      icon: "chart",
      is_favorite: true
    )

    CustomDashboards::Save.new(dashboard, {}, widgets: DASHBOARD_WIDGETS.map(&:dup)).call
  end
end

result = VekooInsightsSeeds.call

if result
  puts "  Insights    #{result[:stats]} dias no dashboard · #{result[:funnels].size} funis · dashboard \"#{result[:dashboard].name}\" com #{result[:dashboard].widgets.size} cards"
end
