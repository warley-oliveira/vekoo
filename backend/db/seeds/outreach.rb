# Semente do domínio "outreach": campanhas em cada estado e buscas de estabelecimentos, na
# organização da conta de demonstração, com a Doma Store. É obra do usuário fictício, não interface:
# fica em pt-BR mesmo quando a API responde em inglês.
#
# Não dispara nada e não fala com ninguém: nenhum job é enfileirado e os canais da semente estão
# desconectados. A campanha "em andamento" tem o lote marcado para daqui a um mês, para a recuperação
# não mexer nela e a tela ter o que mostrar. Pausar e cancelar funcionam; retomar responde
# `noActiveConnectors`, porque nenhum canal da semente está conectado.
#
# Idempotente: cada campanha e busca é achada pelo nome. A que já existe fica como está, então rodar de
# novo não duplica e não desfaz o que a pessoa fez.
#
#   bin/rails runner 'load "db/seeds/outreach.rb"'

Object.send(:remove_const, :VekooOutreachSeeds) if defined?(VekooOutreachSeeds)

module VekooOutreachSeeds
  DEMO_EMAIL = "marina.duarte@exemplo.com.br".freeze

  FIRST_NAMES = %w[
    Ana Beatriz Camila Daniela Eduarda Fernanda Gabriela Helena Isabela Juliana Larissa Mariana Natália Patrícia Renata
    Sofia Tatiana Vanessa Bruno Carlos Diego Eduardo Felipe Gustavo Henrique João Lucas Marcelo Pedro Rafael Thiago Vinícius
  ].freeze
  LAST_NAMES = %w[
    Almeida Barbosa Cardoso Costa Dias Ferreira Gomes Lima Martins Melo Moura Nascimento Oliveira Pereira Ribeiro Rocha
    Santos Silva Souza Teixeira
  ].freeze
  # DDD com a cidade que faz sentido para uma loja de Curitiba que vende para o Brasil inteiro.
  AREA_CODES = %w[41 41 41 11 21 31 43 44 47 48 51 61 71 81].freeze

  FAILURES = [
    [ "numberNotFound", nil ],
    [ "whatsappError", nil ],
    [ "whatsappError", "Mensagem não entregue: o contato não aceita mensagens de empresas." ]
  ].freeze

  PLACES = [
    [ "Padaria Pão Quente", "(41) 3322-1040", "Rua XV de Novembro, 870", "Centro", "Padaria", 4.7, 312 ],
    [ "Panificadora Araucária", "(41) 3254-7788", "Av. Sete de Setembro, 3100", "Rebouças", "Padaria", 4.5, 187 ],
    [ "Doce Sabor Confeitaria", "(41) 3029-1515", "Rua Comendador Araújo, 215", "Batel", "Confeitaria", 4.8, 540 ],
    [ "Pão & Prosa", "(41) 3343-9021", "Rua Mateus Leme, 1422", "São Francisco", "Padaria", 4.6, 96 ],
    [ "Padaria do Bairro", "(41) 3276-4410", "Rua Padre Anchieta, 2050", "Bigorrilho", "Padaria", 4.3, 221 ],
    [ "Massa Madre Curitiba", "(41) 99912-3344", "Alameda Prudente de Moraes, 680", "Mercês", "Padaria artesanal", 4.9, 415 ],
    [ "Trigo Dourado", "(41) 3362-8080", "Rua Itupava, 1300", "Alto da XV", "Padaria", 4.4, 143 ],
    [ "Vó Nair Pães e Doces", "(41) 3247-6655", "Av. República Argentina, 2800", "Água Verde", "Padaria", 4.6, 278 ]
  ].freeze

  module_function

  def call
    account = Account.find_by(email: DEMO_EMAIL)
    return nil unless account

    organization = account.organization
    web = organization.connectors.where(_type: "Connector::WhatsappWeb").take
    cloud = organization.connectors.where(_type: "Connector::WhatsappCloud").take
    return nil unless web

    random = Random.new(2026)
    tags = organization.chat_tags.pluck(:_id).map(&:to_s).first(2)

    campaigns(web, tags).each { |spec| seed_campaign(organization, account, spec, random) }
    seed_template_campaign(organization, account, cloud, random) if cloud
    keep_running_campaign_quiet(organization)
    seed_extractions(organization, account, random)

    organization
  end

  def text_settings(web, tags)
    {
      message_type_cd: "text",
      campaign_mode_cd: "text",
      connector_ids: [ web.id.to_s ],
      chat_tag_ids: tags,
      send_start_hour: 9,
      send_end_hour: 18,
      send_days: [ 1, 2, 3, 4, 5 ],
      buffer_min_seconds: 60,
      buffer_max_seconds: 180,
      daily_limit_per_connector: 300,
      timezone: "America/Sao_Paulo"
    }
  end

  # `mix`: quantos destinatários em cada situação.
  def campaigns(web, tags)
    settings = text_settings(web, tags)

    [
      {
        **settings,
        name: "Recompra de verão",
        messages: [
          "Oi, {{nome}}! Aqui é da Doma Store. As peças de linho da coleção de verão voltaram ao estoque. Quer ver as novidades?",
          "{{nome}}, tudo bem? O vestido midi que você gostou voltou nas cores terracota e areia. Separo um para você?"
        ],
        status_cd: "completed",
        started_days_ago: 21, completed_days_ago: 20,
        mix: { read: 34, delivered: 18, sent: 6, failed: 4 },
        log: %w[created launched completed]
      },
      {
        **settings,
        name: "Lançamento da coleção de inverno",
        messages: [
          "{{nome}}, a coleção de inverno da Doma Store acabou de chegar: tricô, alfaiataria e 10% na primeira compra. Posso te mandar o catálogo?"
        ],
        status_cd: "running",
        started_days_ago: 0,
        mix: { read: 12, delivered: 16, sent: 8, failed: 2, pending: 52 },
        log: %w[created launched]
      },
      {
        **settings,
        name: "Black Friday antecipada",
        messages: [ "{{nome}}, sua Black Friday começa antes: até 40% em peças selecionadas, só até domingo. Quer o link?" ],
        status_cd: "paused",
        started_days_ago: 2,
        mix: { read: 9, delivered: 11, sent: 3, pending: 37 },
        log: %w[created launched paused]
      },
      {
        **settings,
        name: "Aviso de troca de endereço",
        messages: [ "{{nome}}, nossa loja física mudou para a Rua Comendador Araújo, 215, no Batel. Passa lá para tomar um café!" ],
        status_cd: "paused",
        pause_reason: Outreach::Settlement::NO_ACTIVE_CONNECTORS,
        started_days_ago: 3,
        mix: { read: 4, delivered: 5, sent: 1, pending: 18 },
        log: %w[created launched paused_without_channels]
      },
      {
        **settings,
        name: "Natal na Doma Store",
        messages: [ "{{nome}}, já pensou no presente de Natal? Separamos uma curadoria com embalagem presente grátis." ],
        status_cd: "scheduled",
        scheduled_in_days: 21,
        mix: { pending: 45 },
        log: %w[created scheduled]
      },
      {
        **settings,
        name: "Pesquisa de satisfação",
        messages: [ "Oi, {{nome}}! Como foi sua última compra na Doma Store? De 0 a 10, quanto você nos recomendaria?" ],
        status_cd: "draft",
        mix: { pending: 24 },
        log: %w[created]
      },
      {
        **settings,
        name: "Reativação de clientes inativos",
        messages: [ "{{nome}}, sentimos sua falta! Volte com 15% de desconto usando o cupom VOLTEI." ],
        status_cd: "cancelled",
        started_days_ago: 9, completed_days_ago: 9,
        mix: { read: 3, delivered: 4, sent: 2, skipped: 31 },
        log: %w[created launched cancelled]
      }
    ]
  end

  def seed_campaign(organization, account, spec, random)
    return if organization.campaigns.where(name: spec[:name]).exists?

    now = Time.current
    started_at = spec[:started_days_ago] && now - spec[:started_days_ago].days - 2.hours
    completed_at = spec[:completed_days_ago] && now - spec[:completed_days_ago].days
    mix = spec.fetch(:mix)

    campaign = organization.campaigns.create!(
      spec.except(:started_days_ago, :completed_days_ago, :scheduled_in_days, :mix, :log).merge(
        created_by_account_id: account.id,
        run_token: SecureRandom.hex(12),
        started_at: started_at,
        planned_at: started_at,
        completed_at: completed_at,
        scheduled_at: spec[:scheduled_in_days] && (now + spec[:scheduled_in_days].days).change(hour: 9),
        estimated_completion_at: estimated_completion(spec, now, mix),
        created_at: (started_at || now) - 1.hour,
        **counters_for(mix)
      )
    )

    insert_recipients(campaign, mix, started_at, random)
    insert_batches(campaign, spec) if spec[:status_cd] == "running"
    record_activity(campaign, account, spec, started_at, completed_at)
    campaign
  end

  def estimated_completion(spec, now, mix)
    return nil if spec[:started_days_ago].nil? || mix[:pending].to_i.zero?

    now + (mix[:pending] * 2).minutes
  end

  def counters_for(mix)
    read = mix[:read].to_i
    delivered = read + mix[:delivered].to_i

    {
      recipients_count: mix.values.sum,
      read_count: read,
      delivered_count: delivered,
      sent_count: delivered + mix[:sent].to_i,
      failed_count: mix[:failed].to_i
    }
  end

  def insert_recipients(campaign, mix, started_at, random)
    used = Set.new
    docs = mix.flat_map do |status, amount|
      Array.new(amount) { recipient_doc(campaign, status.to_s, started_at, random, used) }
    end

    Outreach::Recipient.collection.insert_many(docs) if docs.any?
  end

  def recipient_doc(campaign, status, started_at, random, used)
    now = Time.current
    phone = unique_phone(random, used)
    sent_at = started_at && started_at + random.rand(1..120).minutes
    failure = FAILURES[random.rand(FAILURES.size)] if status == "failed"
    delivered_at = sent_at + random.rand(1..30).seconds if %w[delivered read].include?(status)

    {
      _id: BSON::ObjectId.new,
      campaign_id: campaign.id,
      phone: phone,
      phone_key: Outreach::Recipient.key_for(phone),
      name: "#{FIRST_NAMES[random.rand(FIRST_NAMES.size)]} #{LAST_NAMES[random.rand(LAST_NAMES.size)]}",
      custom_variables: {},
      status_cd: status,
      connector_id: %w[pending skipped].include?(status) ? nil : campaign.connector_ids.first,
      whatsapp_message_id: %w[sent delivered read].include?(status) ? "SEED-#{phone}" : nil,
      sent_at: %w[pending skipped].include?(status) ? nil : sent_at,
      delivered_at: delivered_at,
      read_at: status == "read" ? delivered_at + random.rand(5..600).minutes : nil,
      error_code: failure&.first,
      error_message: failure&.last,
      created_at: campaign.created_at,
      updated_at: now
    }
  end

  def unique_phone(random, used)
    loop do
      phone = "55#{AREA_CODES[random.rand(AREA_CODES.size)]}9#{format('%08d', random.rand(100_000_000))}"
      return phone if used.add?(phone)
    end
  end

  # Só na campanha em andamento. O lote está marcado para daqui a um mês: a recuperação vê que não está
  # atrasado e não mexe, e nenhum job existe para ele.
  def insert_batches(campaign, spec)
    ids = campaign.recipients.status_pending.order_by(_id: 1).pluck(:_id)
    connector_id = spec[:connector_ids].first

    ids.each_slice(campaign.batch_size).with_index do |slice, sequence|
      head = sequence.zero?

      Outreach::Batch.create!(
        campaign: campaign,
        connector_id: connector_id,
        channel_key: "#{connector_id}:",
        sequence: sequence,
        position_offset: sequence * campaign.batch_size,
        recipient_ids: slice,
        status_cd: head ? "processing" : "scheduled",
        scheduled_at: head ? Time.current : nil,
        next_send_at: head ? 30.days.from_now : nil
      )
    end
  end

  def record_activity(campaign, account, spec, started_at, completed_at)
    base = campaign.created_at

    spec.fetch(:log).each_with_index do |action, index|
      attributes = activity_for(action, campaign, account)
      at = activity_time(action, base, started_at, completed_at, index)

      Outreach::ActivityLog.create!(campaign: campaign, created_at: at, updated_at: at, **attributes)
    end
  end

  def activity_for(action, campaign, account)
    case action
    when "scheduled"
      {
        action: "scheduled",
        account_id: account.id,
        metadata: { "scheduled_at" => Outreach::CampaignSerializer.epoch_ms(campaign.scheduled_at), "timezone" => campaign.timezone }
      }
    when "paused_without_channels"
      { action: "paused", metadata: { "reason" => Outreach::Settlement::NO_ACTIVE_CONNECTORS } }
    when "completed"
      { action: "completed" }
    else
      { action: action, account_id: account.id }
    end
  end

  def activity_time(action, base, started_at, completed_at, index)
    case action
    when "created", "scheduled" then base + index.minutes
    when "launched" then started_at || base
    when "completed", "cancelled" then completed_at || base
    else (started_at || base) + 3.hours
    end
  end

  def seed_template_campaign(organization, account, cloud, random)
    name = "Aviso de entrega de novembro"
    return if organization.campaigns.where(name: name).exists?

    template = cloud.whatsapp_templates.where(name: "pedido_saiu_para_entrega").take
    return unless template

    mix = { read: 22, delivered: 9, sent: 4, failed: 1 }
    started_at = 6.days.ago
    phone_number_id = cloud.phone_number_id.to_s

    campaign = organization.campaigns.create!(
      name: name,
      messages: [],
      message_type_cd: "text",
      campaign_mode_cd: "template",
      waba_connector_id: cloud.id.to_s,
      phone_number_ids: [ phone_number_id ],
      template_ids: [ template.id.to_s ],
      template_params: { template.id.to_s => { "1" => "{{nome}}", "2" => "48213" } },
      status_cd: "completed",
      send_days: [ 1, 2, 3, 4, 5 ],
      send_start_hour: 8,
      send_end_hour: 20,
      buffer_min_seconds: 30,
      buffer_max_seconds: 60,
      daily_limit_per_connector: 1000,
      created_by_account_id: account.id,
      run_token: SecureRandom.hex(12),
      started_at: started_at,
      planned_at: started_at,
      completed_at: started_at + 40.minutes,
      created_at: started_at - 1.hour,
      **counters_for(mix)
    )

    insert_recipients(campaign, mix, started_at, random)
    record_activity(campaign, account, { log: %w[created launched completed] }, started_at, campaign.completed_at)
  end

  # Rodar de novo empurra o lote: a campanha continua parada e a recuperação continua sem o que fazer.
  def keep_running_campaign_quiet(organization)
    organization.campaigns.where(name: "Lançamento da coleção de inverno", status_cd: "running").each do |campaign|
      campaign.batches.where(status_cd: "processing").update_all(next_send_at: 30.days.from_now)
    end
  end

  def seed_extractions(organization, account, random)
    {
      "padaria" => { location: "Curitiba, PR", places: PLACES, days_ago: 4 },
      "padaria artesanal" => { location: "Batel, Curitiba", places: PLACES.select { |place| place[5] >= 4.6 }, days_ago: 1 }
    }.each do |query, spec|
      next if organization.place_extractions.where(search_query: query).exists?

      finished_at = spec[:days_ago].days.ago

      organization.place_extractions.create!(
        created_by_account_id: account.id,
        search_query: query,
        location: spec[:location],
        max_places: 100,
        status: "completed",
        results: spec[:places].map { |place| place_result(place, random) },
        results_count: spec[:places].size,
        started_at: finished_at - 2.minutes,
        completed_at: finished_at,
        created_at: finished_at - 2.minutes
      )
    end

    return if organization.place_extractions.where(search_query: "clínica de estética").exists?

    organization.place_extractions.create!(
      created_by_account_id: account.id,
      search_query: "clínica de estética",
      location: "Belo Horizonte, MG",
      status: "failed",
      error_code: "apifyQuotaExceeded",
      started_at: 2.days.ago,
      completed_at: 2.days.ago + 8.seconds
    )
  end

  def place_result(place, random)
    title, phone, address, neighborhood, category, score, reviews = place
    slug = title.parameterize

    {
      "title" => title,
      "phone" => phone,
      "phone_unformatted" => "55#{phone.gsub(/\D/, '')}",
      "address" => "#{address} - #{neighborhood}, Curitiba - PR",
      "street" => address,
      "city" => "Curitiba",
      "state" => "PR",
      "postal_code" => format("80%03d-%03d", random.rand(1000), random.rand(1000)),
      "country_code" => "BR",
      "neighborhood" => neighborhood,
      "website" => "https://#{slug}.exemplo.com.br",
      "category_name" => category,
      "categories" => [ category, "Lanchonete" ],
      "total_score" => score,
      "reviews_count" => reviews,
      "image_url" => "https://picsum.photos/seed/#{slug}/400/300",
      "url" => "https://www.google.com/maps/search/#{slug}",
      "place_id" => "seed-#{slug}",
      "latitude" => -25.43 + random.rand(-0.03..0.03).round(4),
      "longitude" => -49.27 + random.rand(-0.03..0.03).round(4),
      "instagram" => "https://instagram.com/#{slug.delete('-')}",
      "facebook" => "",
      "opening_hours" => [
        { "day" => "segunda-feira", "hours" => "07:00 às 19:00" },
        { "day" => "sábado", "hours" => "07:00 às 13:00" }
      ]
    }
  end
end

outreach_organization = VekooOutreachSeeds.call

if outreach_organization
  campaigns = outreach_organization.campaigns

  puts <<~REPORT

    Campanhas.

      Campanhas      #{campaigns.count} (#{Outreach::Campaign.statuses.map { |status| "#{campaigns.where(status_cd: status).count} #{status}" }.join(', ')})
      Destinatários  #{campaigns.sum(:recipients_count)}
      Buscas         #{outreach_organization.place_extractions.count}
  REPORT
end
