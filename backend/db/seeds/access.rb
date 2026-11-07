# Semente do domínio "access": grupos, departamentos, pessoas, avisos e alertas na
# organização da conta de demonstração. É obra do usuário fictício, não interface: fica em
# pt-BR mesmo quando a API responde em inglês.
#
# Idempotente: cada registro é achado pela sua chave natural (nome, e-mail, título, origem).
# Rodar de novo atualiza o que a semente controla, sem duplicar.

Object.send(:remove_const, :VekooAccessSeeds) if defined?(VekooAccessSeeds)

module VekooAccessSeeds
  DEMO_EMAIL = "marina.duarte@exemplo.com.br"
  PASSWORD = "carrossel123"

  TEAMS = [
    { name: "Atendimento" },
    { name: "Comercial" },
    { name: "Pós-venda" }
  ].freeze

  # Além dos dois padrões, um grupo feito pela organização: quem atende só enxerga as
  # conversas do próprio departamento.
  CUSTOM_ROLES = {
    "Atendimento por departamento" => {
      "chat" => "all",
      "chat_list_to" => "team",
      "contacts" => "all",
      "calendar" => "all",
      "catalog" => "all"
    }
  }.freeze

  # A segunda organização da Marina: ela cuida das redes de uma clínica, onde entra como gerente.
  # É o que deixa a demonstração exercitar a escolha de organização e duas abas ao mesmo tempo.
  SECOND_ORGANIZATION = {
    name: "Clínica Bem Viver",
    owner: { name: "Patrícia Gomes", email: "patricia.gomes@exemplo.com.br", phone: "5511932109876" },
    quick_replies: [
      [ "Horários", "Atendemos de segunda a sexta, das 8h às 19h, e aos sábados até o meio-dia." ],
      [ "Endereço", "Rua Pamplona, 1200, conjunto 42 — Jardim Paulista, São Paulo." ],
      [ "Convênios", "Atendemos particular e emitimos recibo para reembolso do seu plano." ]
    ]
  }.freeze

  # O suporte do Vekoo da demonstração: entra em qualquer organização. Nunca em produção, nem com
  # SEED_DEMO_DATA: é uma senha conhecida que daria acesso a tudo.
  SUPPORT = { name: "Suporte Vekoo", email: "suporte@vekoo.com.br", password: "suporte-vekoo-123" }.freeze

  PEOPLE = [
    { name: "Rafael Nunes", email: "rafael.nunes@exemplo.com.br", phone: "5511987654321",
      group: "Gerente", teams: %w[Comercial] },
    { name: "Camila Rocha", email: "camila.rocha@exemplo.com.br", phone: "5511976543210",
      group: "Atendimento por departamento", teams: %w[Atendimento] },
    { name: "Thiago Almeida", email: "thiago.almeida@exemplo.com.br", phone: "5521965432109",
      group: "Usuário", teams: %w[Atendimento Pós-venda] },
    { name: "Juliana Ferreira", email: "juliana.ferreira@exemplo.com.br", phone: "5531954321098",
      group: "Usuário", teams: %w[Comercial] },
    # Administra o sistema, mas não atende: fica fora das listas de atribuição.
    { name: "Beatriz Lima", email: "beatriz.lima@exemplo.com.br", phone: "5541943210987",
      group: "Gerente", teams: [], setup_only: true }
  ].freeze

  NOTICES = [
    { title: "Novo agendamento confirmado",
      description: "Ana Beatriz marcou Limpeza de pele para quinta-feira, às 14h.",
      category: "calendar", url: "/calendar", hours_ago: 1,
      actions: [ { action: "open_calendar", title: "Abrir agenda", urlPath: "/calendar" },
                 { action: "dismiss", title: "Dispensar" } ] },
    { title: "Conversa atribuída a você",
      description: "Paulo Mendes está esperando resposta sobre o orçamento da reforma.",
      category: "chat", url: "/chat", hours_ago: 3,
      actions: [ { action: "open_chat", title: "Abrir conversa", urlPath: "/chat" } ] },
    { title: "Agendamento cancelado",
      description: "Fernanda Souza cancelou a sessão de sexta-feira, às 10h.",
      category: "calendar", url: "/calendar", hours_ago: 26, read: true },
    { title: "Sua exportação de contatos ficou pronta",
      description: "O arquivo com 1.248 contatos está disponível para baixar por 7 dias.",
      category: "system", url: "/contacts", hours_ago: 50, read: true },
    { title: "Bem-vinda à equipe de atendimento",
      description: "Rafael adicionou você ao departamento Comercial.",
      category: "general", hours_ago: 120, archived: true }
  ].freeze

  # O texto dos dois primeiros sai do código, no idioma de quem pergunta. O terceiro traz o
  # recado do provedor, que é como esse caso chega na vida real.
  ALERTS = [
    { category: "connectors", origin_type: "Connector", origin_id: "seed-whatsapp-loja", origin_name: "WhatsApp da loja",
      code: "connector_disconnected", severity: "error", metadata: { "connector_type" => "Connector::WhatsappWeb" } },
    { category: "connectors", origin_type: "Connector", origin_id: "seed-whatsapp-oficial", origin_name: "WhatsApp oficial",
      code: "template_rejected", severity: "warning", message: "A Meta rejeitou o modelo \"confirmacao_agendamento\".",
      metadata: { "template" => "confirmacao_agendamento" } }
  ].freeze

  module_function

  def call
    owner = Account.for_email(DEMO_EMAIL, role: "owner")
    return unless owner

    organization = owner.organization
    AccessRole.seed_defaults_for(organization)
    seed_custom_roles(organization)
    seed_teams(organization)
    PEOPLE.each { |person| seed_person(organization, person) }
    seed_settings(organization)
    seed_notices(owner)
    seed_alerts(organization)
    seed_second_organization(owner)
    seed_support unless Rails.env.production?

    organization
  end

  def seed_custom_roles(organization)
    CUSTOM_ROLES.each do |name, permissions|
      role = organization.access_roles.find_or_initialize_by(name: name)
      role.update!(permissions: AccessRole::BLANK_PERMISSIONS.merge(permissions))
    end
  end

  def seed_teams(organization)
    TEAMS.each { |team| organization.teams.find_or_create_by!(name: team[:name]) }
  end

  # A pessoa é achada pelo e-mail; a senha só na primeira vez: rodar de novo não desfaz uma senha
  # trocada em /profile.
  def user!(name:, email:, phone: nil, password: PASSWORD)
    user = User.find_or_initialize_by(email: email)
    user.assign_attributes(name: name, phone: phone)
    user.password = password if user.new_record?
    user.save!
    user
  end

  def seed_person(organization, person)
    user = user!(name: person[:name], email: person[:email], phone: person[:phone])
    account = organization.accounts.find_or_initialize_by(user: user)
    account.assign_attributes(
      role: "member",
      setup_only: person.fetch(:setup_only, false),
      access_role: organization.access_roles.find_by!(name: person[:group]),
      teams: organization.teams.where(name: person[:teams])
    )
    account.save!
  end

  def seed_second_organization(marina)
    spec = SECOND_ORGANIZATION
    organization = Organization.find_or_create_by!(name: spec[:name]) { |created| created.created_at = 20.days.ago }
    AccessRole.seed_defaults_for(organization)

    owner = user!(**spec[:owner])
    organization.accounts.find_or_initialize_by(user: owner).update!(role: "owner")
    organization.accounts.find_or_initialize_by(user: marina.user).update!(
      role: "member", access_role: organization.access_roles.find_by!(name: "Gerente")
    )

    spec[:quick_replies].each do |name, content|
      QuickReply.find_or_create_by!(organization_id: organization.id, trigger: name.parameterize) do |reply|
        reply.assign_attributes(name: name, content: content)
      end
    end
    organization
  end

  def seed_support
    user = user!(name: SUPPORT[:name], email: SUPPORT[:email], password: SUPPORT[:password])
    user.update!(master: true)
  end

  def seed_settings(organization)
    organization.update_with_settings!(
      company_info: { business_name: "Marina Duarte Conteúdo Digital Ltda", cnpj: "11222333000181" }
    )
  end

  def seed_notices(owner)
    NOTICES.each do |notice|
      next if AccountNotice.for_account(owner).where(title: notice[:title]).exists?

      at = notice[:hours_ago].hours.ago
      AccountNotice.create!(
        account_id: owner.id,
        organization_id: owner.organization_id,
        title: notice[:title],
        description: notice[:description],
        category: notice[:category],
        url: notice[:url],
        actions: notice.fetch(:actions, []),
        created_at: at,
        read_at: notice[:read] ? at + 10.minutes : nil,
        archived_at: notice[:archived] ? at + 1.day : nil
      )
    end
  end

  def seed_alerts(organization)
    ALERTS.each { |alert| OrganizationAlert.raise_alert!(organization, **alert) }
  end
end

access_organization = VekooAccessSeeds.call

if access_organization
  puts <<~REPORT

    Pessoas e avisos.

      Pessoas       #{access_organization.accounts.count} (senha #{VekooAccessSeeds::PASSWORD})
      Grupos        #{access_organization.access_roles.count}
      Departamentos #{access_organization.teams.count}
      Avisos        #{AccountNotice.where(organization_id: access_organization.id).count}
      Alertas       #{access_organization.organization_alerts.active.count} ativos
  REPORT
end
