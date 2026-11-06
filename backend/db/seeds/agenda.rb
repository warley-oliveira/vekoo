# Semente do domínio "agenda": o Estúdio Doma, o ateliê da Doma Store (a mesma loja do catálogo e
# dos canais), na organização da conta de demonstração. Provas e ajustes com hora marcada, e oficinas
# em turma. É obra do usuário fictício, não interface: fica em pt-BR mesmo quando a API responde em
# inglês.
#
# Os agendamentos falam com as conversas da semente de conectores, que roda depois desta na ordem
# alfabética: por isso ela é carregada aqui quando ainda não rodou.
#
# Os horários são relativos à semana em que a semente roda, para o calendário não nascer vazio.
#
# Idempotente: cada registro é achado pela chave natural (nome, ou `external_id` no agendamento). O
# que já existe fica como está, então rodar de novo não duplica nem desfaz o que a pessoa fez.

Object.send(:remove_const, :VekooAgendaSeeds) if defined?(VekooAgendaSeeds)

module VekooAgendaSeeds
  DEMO_EMAIL = "marina.duarte@exemplo.com.br"
  ZONE = "America/Sao_Paulo"

  REMINDERS = [
    {
      "interval" => 1, "period" => "days",
      "message" => "Oi, {{nome}}! Passando para lembrar: amanhã, às {{hora}}, é o seu horário de {{servico}} aqui no Estúdio Doma. Se precisar remarcar, é só responder esta mensagem."
    },
    {
      "interval" => 2, "period" => "hours",
      "message" => "{{nome}}, te esperamos daqui a pouco, às {{hora}}, para {{servico}} com {{profissional}}. Estamos na Rua Pernambuco, 1.000, na Savassi."
    }
  ].freeze

  PROFESSIONAL_REMINDERS = [
    { "time_before" => 1, "period" => "hours", "message" => "Daqui a pouco: {{servico}} com {{nome}}, às {{hora}}.", "push" => true, "whatsapp" => false }
  ].freeze

  SEQUENCES = [
    {
      "id" => "seed-faltou", "name" => "Recuperar quem faltou", "trigger" => "no_show", "enabled" => true,
      "auto_enroll" => false, "stop_on_reply" => true, "ignore_automation_paused" => false, "reactivate_automation" => false,
      "auto_enroll_anchors" => [ "attendance_mark" ], "auto_enroll_minutes_after_end" => 120,
      "steps" => [
        { "id" => "seed-faltou-1", "name" => "Mesmo dia", "message" => "Oi, {{nome}}! Sentimos sua falta hoje. Quer marcar outro horário?", "run_after" => 2, "run_after_unit" => "hours", "time_from" => 9, "time_at" => 19, "all_day" => false },
        { "id" => "seed-faltou-2", "name" => "Dois dias depois", "message" => "{{nome}}, ainda temos horários nesta semana. Posso reservar um para você?", "run_after" => 2, "run_after_unit" => "days", "time_from" => 9, "time_at" => 19, "all_day" => false }
      ]
    },
    {
      "id" => "seed-veio", "name" => "Agradecer quem veio", "trigger" => "show", "enabled" => true,
      "auto_enroll" => false, "stop_on_reply" => false, "ignore_automation_paused" => false, "reactivate_automation" => false,
      "auto_enroll_anchors" => [ "attendance_mark" ], "auto_enroll_minutes_after_end" => 60,
      "steps" => [
        { "id" => "seed-veio-1", "name" => "Pós-atendimento", "message" => "Obrigada pela visita, {{nome}}! Como ficou a peça?", "run_after" => 1, "run_after_unit" => "days", "time_from" => 10, "time_at" => 18, "all_day" => false }
      ]
    }
  ].freeze

  PROFESSIONALS = [
    { key: :camila, email: "camila.rocha@exemplo.com.br", color: "#b06046", days: [ 1, 2, 3, 4, 5 ], windows: [ %w[09:00 12:00], %w[13:00 18:00] ] },
    { key: :thiago, email: "thiago.almeida@exemplo.com.br", color: "#2c3e60", days: [ 2, 3, 4, 5, 6 ], windows: [ %w[10:00 13:00], %w[14:00 19:00] ] },
    { key: :renata, name: "Renata Vieira", phone: "(31) 99812-3344", color: "#059669", days: [ 1, 3, 5, 6 ], windows: [ %w[09:00 16:00] ] }
  ].freeze

  SERVICES = [
    {
      key: :prova, name: "Prova com hora marcada", duration: 45, buffer_after: 15, increment: 30,
      description: "Uma hora só sua no provador, com as peças separadas.",
      success: "Avise que as peças ficam separadas até o fim do horário.",
      distribution: { camila: 60, thiago: 40 }
    },
    {
      key: :ajuste, name: "Ajuste de roupa", duration: 30, increment: 30,
      description: "Barra, cintura e manga, com a costureira.",
      distribution: { renata: 100 }
    },
    {
      key: :consultoria, name: "Consultoria de estilo", duration: 90, buffer_before: 15, buffer_after: 15, increment: 60,
      description: "Conversa sobre o seu guarda-roupa, com sugestão de peças.",
      distribution: { camila: 50, thiago: 50 }
    }
  ].freeze

  # [semana (0 = esta), dia da semana, hora, profissional, serviço, contato, comparecimento, situação]
  BOOKINGS = [
    [ -3, 2, "10:00", :camila, :prova, "Fernanda Lima", "show" ],
    [ -3, 4, "15:00", :renata, :ajuste, "Daniela Souza", "show" ],
    [ -2, 1, "11:00", :camila, :consultoria, "Carlos Eduardo Santos", "show" ],
    [ -2, 3, "14:00", :thiago, :prova, "Márcia Regina Costa", "no_show" ],
    [ -2, 5, "10:00", :renata, :ajuste, "Roberto Nascimento", "show" ],
    [ -1, 2, "16:00", :thiago, :consultoria, "Patrícia Gomes", "show" ],
    [ -1, 3, "09:30", :renata, :ajuste, "Lucas Oliveira", "no_show" ],
    [ -1, 4, "10:00", :camila, :prova, "Camila Ferraz", nil, "canceled" ],
    [ -1, 5, "13:30", :camila, :prova, "Ana Beatriz Moura", "show" ],
    [ 0, 1, "09:00", :camila, :prova, "João Pedro Almeida", "show" ],
    [ 0, 3, "11:00", :renata, :ajuste, "Fernanda Lima", nil ],
    [ 1, 1, "10:00", :camila, :prova, "Ana Beatriz Moura", nil ],
    [ 1, 2, "15:00", :thiago, :consultoria, "Márcia Regina Costa", nil ],
    [ 1, 3, "09:00", :renata, :ajuste, "João Pedro Almeida", nil ],
    [ 1, 5, "16:00", :camila, :consultoria, "Lucas Oliveira", nil ],
    [ 1, 6, "11:00", :thiago, :prova, "Daniela Souza", nil ],
    [ 2, 2, "14:00", :camila, :prova, "Patrícia Gomes", nil ],
    [ 2, 4, "10:30", :thiago, :prova, "Carlos Eduardo Santos", nil ]
  ].freeze

  CLASS_GROUPS = [
    {
      name: "Oficina de costura criativa", color: "#7c3aed", max_students: 8, min_students: 3, duration: 120, category: "Costura",
      room: "Sala do ateliê", location: "Estúdio Doma, Savassi", instructor: "Renata Vieira", price_cents: 18_000, tags: [ "iniciantes" ],
      description: "Do molde à peça pronta, em turmas pequenas.",
      schedule: { 2 => [ %w[19:00 21:00] ], 4 => [ %w[19:00 21:00] ] },
      students: { "Ana Beatriz Moura" => [ 2, "19:00" ], "Fernanda Lima" => [ 2, "19:00" ], "Daniela Souza" => [ 4, "19:00" ], "Márcia Regina Costa" => nil }
    },
    {
      name: "Clube do tecido", color: "#0891b2", max_students: 12, min_students: 4, duration: 90, category: "Encontro",
      room: "Loja", location: "Estúdio Doma, Savassi", instructor: "Camila Rocha", recurrence: "biweekly", price_cents: 4_500,
      description: "A cada quinzena, um tecido novo em mãos e o que fazer com ele.",
      schedule: { 6 => [ %w[10:00 11:30] ] },
      students: { "Carlos Eduardo Santos" => nil, "Patrícia Gomes" => nil, "Camila Ferraz" => nil }
    }
  ].freeze

  module_function

  def call
    owner = Account.find_by(email: DEMO_EMAIL)
    return nil unless owner

    organization = owner.organization
    load Rails.root.join("db/seeds/connectors.rb") unless organization.chats.exists?

    calendar = seed_calendar(organization, "Estúdio Doma", "professional", "#b06046", "Provas, ajustes e consultorias com hora marcada.")
    professionals = seed_professionals(organization, calendar)
    services = seed_services(organization, calendar, professionals)
    seed_bookings(organization, calendar, professionals, services)

    classes = seed_calendar(organization, "Oficinas Doma", "class_group", "#7c3aed", "Turmas de costura e encontros.")
    CLASS_GROUPS.each { |spec| seed_class_group(organization, classes, spec) }

    [ organization, calendar, classes ]
  end

  def seed_calendar(organization, name, type, color, description)
    Agenda::Calendar.where(organization_id: organization.id.to_s, name: name).first_or_create! do |calendar|
      calendar.calendar_type = type
      calendar.time_zone = ZONE
      calendar.color = color
      calendar.description = description

      next unless type == "professional"

      calendar.scheduling_notification_enabled = true
      calendar.scheduling_notification_config = REMINDERS
      calendar.professional_notifications_settings = PROFESSIONAL_REMINDERS
      calendar.attendance_sequences = SEQUENCES
    end
  end

  def seed_professionals(organization, calendar)
    PROFESSIONALS.to_h do |spec|
      account = spec[:email] && Account.find_by(email: spec[:email], organization_id: organization.id)
      name = account&.name || spec[:name]

      professional = Agenda::Professional.where(calendar_id: calendar.id, name: name).first_or_create! do |record|
        record.organization_id = organization.id.to_s
        record.account_id = account&.id
        record.phone = spec[:phone]
        record.color = spec[:color]
      end
      professional.rule || Agenda::Rule.create!(professional: professional, days: weekly(spec[:days], spec[:windows]))

      [ spec[:key], professional ]
    end
  end

  def weekly(days, windows)
    (0..6).map do |day|
      {
        "day_of_week" => day,
        "enabled" => days.include?(day),
        "windows" => days.include?(day) ? windows.map { |start_at, finish| { "start" => start_at, "end" => finish } } : []
      }
    end
  end

  def seed_services(organization, calendar, professionals)
    SERVICES.to_h do |spec|
      service = Agenda::Offering.where(calendar_id: calendar.id, name: spec[:name]).first_or_create! do |record|
        record.organization_id = organization.id.to_s
        record.duration = spec[:duration]
        record.buffer_before = spec[:buffer_before].to_i
        record.buffer_after = spec[:buffer_after].to_i
        record.time_increment_interval = spec[:increment]
        record.description = spec[:description]
        record.success_message = spec[:success]
        record.distribution = spec[:distribution].to_h { |key, share| [ professionals.fetch(key).id.to_s, share ] }
      end

      [ spec[:key], service ]
    end
  end

  def seed_bookings(organization, calendar, professionals, services)
    monday = calendar.zone.now.beginning_of_week(:monday)

    BOOKINGS.each_with_index do |(week, weekday, time, professional_key, service_key, contact, attendance, status), index|
      key = "seed-agenda-#{index}"
      next if Agenda::Booking.where(organization_id: organization.id.to_s, external_id: key).exists?

      service = services.fetch(service_key)
      start_at = at(monday, week, weekday, time)
      booking = Agenda::Booking.new(
        calendar: calendar,
        organization_id: organization.id.to_s,
        external_id: key,
        professional: professionals.fetch(professional_key),
        service: service,
        chat: Chat.where(organization_id: organization.id.to_s, user_name: contact).take,
        start: start_at,
        end: start_at + service.duration.minutes,
        event_user_name: "Marina Duarte",
        skip_professional_notifications: true,
        skip_attendance_auto_enroll: true
      )
      booking.save!
      settle(booking, attendance, status)
    end
  end

  # O que já aconteceu entra pelos mesmos caminhos da tela, para o histórico e as etiquetas ficarem
  # de verdade. O que está por vir agenda os lembretes de verdade, que a tela do chat lista.
  def settle(booking, attendance, status)
    booking.update!(attendance_status: attendance) if attendance
    booking.update!(status: status) if status
    booking.schedule_contact_reminders if booking.start.future? && booking.active?
  end

  def at(monday, week, weekday, time)
    hours, minutes = time.split(":").map(&:to_i)

    (monday + week.weeks + (weekday - 1).days).change(hour: hours, min: minutes)
  end

  def seed_class_group(organization, calendar, spec)
    group = Agenda::ClassGroup.where(calendar_id: calendar.id, name: spec[:name]).first_or_create! do |record|
      record.organization_id = organization.id.to_s
      record.color = spec[:color]
      record.description = spec[:description]
      record.max_students = spec[:max_students]
      record.min_students = spec[:min_students]
      record.default_duration_minutes = spec[:duration]
      record.category = spec[:category]
      record.room = spec[:room]
      record.location = spec[:location]
      record.instructor_name = spec[:instructor]
      record.price_cents = spec[:price_cents]
      record.tags = spec[:tags].to_a
      record.recurrence_type = spec[:recurrence] || "weekly"
      record.recurrence_end_type = "never"
      record.start_date = calendar.zone.today - 28
      record.schedule = (0..6).map do |day|
        windows = spec[:schedule][day].to_a
        { "day_of_week" => day, "enabled" => windows.any?, "windows" => windows.map { |start_at, finish| { "start" => start_at, "end" => finish } } }
      end
    end

    spec[:students].each { |contact, slot| seed_enrollment(organization, group, contact, slot) }
    seed_past_class(group)
    seed_canceled_class(group)
  end

  def seed_enrollment(organization, group, contact, slot)
    chat = Chat.where(organization_id: organization.id.to_s, user_name: contact).take
    return unless chat

    group.class_enrollments.where(chat_id: chat.id).first_or_create! do |enrollment|
      enrollment.organization_id = organization.id.to_s
      enrollment.chat = chat
      enrollment.enrolled_at = group.start_date.in_time_zone(group.zone)
      enrollment.schedule_day_of_week = slot&.first
      enrollment.schedule_window_start = slot&.last
    end
  end

  # A última aula que já aconteceu, com a presença marcada.
  def seed_past_class(group)
    return if group.class_sessions.where(notes: "Presença marcada pela semente").exists?

    event = occurrences(group, group.zone.today - 21, group.zone.today - 1).last
    return unless event

    slot = Agenda::SessionSlot.resolve(group.organization_id, event[:id], class_group: group)
    return unless slot

    session = slot.materialize!
    session.update!(notes: "Presença marcada pela semente")

    slot.enrollments.each_with_index do |enrollment, index|
      session.class_attendances.where(class_enrollment_id: enrollment.id, chat_id: enrollment.chat_id).first_or_create! do |attendance|
        attendance.attendance_status = index.zero? ? "no_show" : "show"
        attendance.checked_at = session.end
        attendance.checked_by = "Marina Duarte"
      end
    end
  end

  # A próxima aula de duas semanas para a frente, cancelada: é o que uma exceção mostra na grade.
  def seed_canceled_class(group)
    return if group.class_sessions.where(status: "canceled").exists?

    event = occurrences(group, group.zone.today + 14, group.zone.today + 28).first
    return unless event

    slot = Agenda::SessionSlot.resolve(group.organization_id, event[:id], class_group: group)
    return unless slot

    slot.materialize!.update!(status: "canceled", notes: "Feriado: sem aula nesta semana.")
  end

  def occurrences(group, from, to)
    Agenda::SessionGeneratorService.new(group, from, to).call.select { |event| event[:virtual] }
  end
end

agenda_result = VekooAgendaSeeds.call

if agenda_result
  agenda_organization, agenda_calendar, agenda_classes = agenda_result

  puts <<~REPORT

    Agenda.

      Calendários   #{agenda_organization.agenda_calendars.count} (#{agenda_calendar.name}, #{agenda_classes.name})
      Profissionais #{agenda_organization.agenda_professionals.count}
      Serviços      #{agenda_organization.agenda_services.count}
      Agendamentos  #{agenda_organization.agenda_bookings.count}
      Turmas        #{agenda_organization.agenda_class_groups.count}
      Lembretes     #{ScheduledAction.pending.where(organization_id: agenda_organization.id.to_s).count} na fila
  REPORT
end
