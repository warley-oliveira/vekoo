# frozen_string_literal: true

require "rails_helper"

RSpec.describe Copilot::ToolExecutor, "agenda e funil" do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, name: "Marina Duarte") }
  let(:events) { [] }
  let(:notify) { ->(action, data) { events << [ action, data ] } }
  let(:answer) { { qualification_score: 8, qualification: "alto", reason: "Perguntou o preço", is_test: false, key_signals: [ "preço" ], recommended_action: "Responder" }.to_json }
  let(:llm) { scripted_chat(complete: answer) }
  let(:executor) { described_class.new(account: account, notify: notify, chat: llm) }
  let(:calendar) { create(:agenda_calendar, organization: organization, name: "Estúdio") }
  let(:professional) { create(:agenda_professional, calendar: calendar, name: "Camila") }
  let(:service) { create(:agenda_offering, calendar: calendar, name: "Prova", professionals: [ professional ]) }

  def booking_for(**attributes)
    create(:agenda_booking, calendar: calendar, **attributes)
  end

  def chat_for(**attributes)
    create(:chat, organization: organization, **attributes)
  end

  def tool(name, base = {}, on: executor, **input)
    on.execute(name, base.merge(input).deep_stringify_keys)
  end

  describe "permissão" do
    let(:chat_only) { described_class.new(account: member_with(organization, chat: "all"), notify: notify, chat: llm) }

    %w[list_appointments get_appointment_details cancel_appointment reschedule_appointment qualify_appointments get_appointment_stats].each do |name|
      it "#{name} exige ver o calendário" do
        expect(tool(name, { appointment_id: "1", new_start: "2026-12-01 10:00" }, on: chat_only)).to eq(error: "Sua permissão não alcança esses dados.")
      end
    end

    it "quem não vê o calendário não cancela, mesmo sabendo o id" do
      booking = booking_for

      tool("cancel_appointment", { appointment_id: booking.id.to_s }, on: chat_only)

      expect(Agenda::Booking.scoped(organization.id, booking.id)).to be_active
    end

    it "get_chat_funnel exige ver os funis" do
      expect(tool("get_chat_funnel", {}, on: chat_only)).to eq(error: "Sua permissão não alcança esses dados.")
    end

    it "libera com a permissão, sem precisar ser dono" do
      person = member_with(organization, chat: "all", calendar: "all", funnel: "all")
      on = described_class.new(account: person, notify: notify, chat: llm)

      expect(tool("list_appointments", {}, on: on)).to include(total: 0)
      expect(tool("get_chat_funnel", {}, on: on)).to include(funnels: [])
    end
  end

  describe "list_appointments" do
    it "lista do mais recente para o mais antigo, com quem, quando e com quem" do
      chat = chat_for(user_name: "Ana Beatriz")
      older = booking_for(start: 3.days.from_now, chat: chat, professional: professional, service: service)
      newer = booking_for(start: 5.days.from_now)

      result = tool("list_appointments")

      expect(result).to include(total: 2, returned: 2)
      expect(result[:appointments].map { |entry| entry[:id] }).to eq([ newer.id.to_s, older.id.to_s ])
      expect(result[:appointments].last).to include(user_name: "Ana Beatriz", chat_id: chat.id.to_s, professional: "Camila", service: "Prova", status: "active")
      expect(result[:appointments].last[:start]).to include("-03:00")
    end

    it "filtra pela conversa" do
      chat = chat_for
      mine = booking_for(chat: chat)
      booking_for(chat: chat_for)

      expect(tool("list_appointments", chat_id: chat.id.to_s)[:appointments].map { |entry| entry[:id] }).to eq([ mine.id.to_s ])
    end

    # Na origem o filtro sumia, e a resposta trazia todos os agendamentos.
    it "conversa que a pessoa não vê responde erro, sem listar todos" do
      person = member_with(organization, chat: "all", calendar: "all", chat_list_to: "assigned")
      hidden = chat_for(assigned_account_id: account.id)
      booking_for(chat: hidden)

      result = tool("list_appointments", { chat_id: hidden.id.to_s }, on: described_class.new(account: person, notify: notify, chat: llm))

      expect(result).to have_key(:error)
    end

    it "filtra por situação e por período, no fuso da organização" do
      zone = organization.reporting_zone
      inside = booking_for(start: zone.local(2026, 12, 10, 23), end: zone.local(2026, 12, 10, 23, 30))
      booking_for(start: zone.local(2026, 12, 11, 1), end: zone.local(2026, 12, 11, 2))
      booking_for(start: zone.local(2026, 12, 10, 10), end: zone.local(2026, 12, 10, 11), status: "canceled")

      result = tool("list_appointments", date_from: "2026-12-10", date_to: "2026-12-10", status: "active")

      expect(result[:appointments].map { |entry| entry[:id] }).to eq([ inside.id.to_s ])
    end

    it "não traz arquivado, nem de outra organização" do
      booking_for(status: "archived")
      create(:agenda_booking, calendar: create(:agenda_calendar))

      expect(tool("list_appointments")[:total]).to eq(0)
    end

    it "respeita o teto de resultados, e o total continua certo" do
      3.times { booking_for }

      result = tool("list_appointments", limit: 2)

      expect(result).to include(total: 3, returned: 2)
    end
  end

  describe "get_appointment_details" do
    it "traz os detalhes e o histórico recente" do
      chat = chat_for(user_name: "Ana")
      booking = booking_for(chat: chat, professional: professional, service: service, description: "Trazer a peça")

      result = tool("get_appointment_details", appointment_id: booking.id.to_s)

      expect(result).to include(id: booking.id.to_s, description: "Trazer a peça", professional: "Camila", service: "Prova", calendar: "Estúdio", user_name: "Ana", chat_id: chat.id.to_s)
      expect(result[:event_history].first["event_name"]).to eq("create")
    end

    it "responde erro para id que não existe, arquivado, ou de outra organização" do
      foreign = create(:agenda_booking, calendar: create(:agenda_calendar))
      archived = booking_for(status: "archived")

      [ foreign.id.to_s, archived.id.to_s, "nao-e-id" ].each do |id|
        expect(tool("get_appointment_details", appointment_id: id)).to eq(error: "Agendamento não encontrado.")
      end
    end
  end

  describe "cancel_appointment" do
    let(:booking) { booking_for }

    it "cancela pelo caminho de sempre: histórico com o nome de quem pediu, e registra a mudança" do
      result = tool("cancel_appointment", appointment_id: booking.id.to_s, reason: "Pediu para cancelar")

      expect(result).to eq(success: true, appointment_id: booking.id.to_s, status: "canceled")
      saved = Agenda::Booking.scoped(organization.id, booking.id)
      expect(saved).to be_canceled
      expect(saved.event_history.last).to include("event_name" => "canceled", "user_name" => "Marina Duarte")
      expect(executor.changes_applied).to eq([ { action: "cancel_appointment", appointmentId: booking.id.to_s, reason: "Pediu para cancelar" } ])
    end

    it "cancela os lembretes que estavam na fila" do
      calendar.update!(scheduling_notification_enabled: true, scheduling_notification_config: [ { "interval" => 1, "period" => "hours", "message" => "Oi" } ])
      scheduled = booking_for(chat: chat_for, start: 2.days.from_now)
      expect(ScheduledAction.pending.where(booking_id: scheduled.id.to_s).count).to eq(1)

      tool("cancel_appointment", appointment_id: scheduled.id.to_s)

      expect(ScheduledAction.pending.where(booking_id: scheduled.id.to_s).count).to eq(0)
    end

    it "cancelar o que já está cancelado não mexe em nada" do
      booking.update!(status: "canceled")

      expect(tool("cancel_appointment", appointment_id: booking.id.to_s)).to include(already_canceled: true)
      expect(executor.changes_applied).to be_empty
    end

    it "não alcança outra organização" do
      foreign = create(:agenda_booking, calendar: create(:agenda_calendar))

      expect(tool("cancel_appointment", appointment_id: foreign.id.to_s)).to have_key(:error)
      expect(Agenda::Booking.scoped(foreign.organization_id, foreign.id)).to be_active
    end
  end

  describe "reschedule_appointment" do
    let(:zone) { calendar.zone }
    let(:booking) { booking_for(start: zone.local(2026, 12, 10, 10), end: zone.local(2026, 12, 10, 11)) }

    it "remarca mantendo a duração, em hora de parede" do
      result = tool("reschedule_appointment", appointment_id: booking.id.to_s, new_start: "2026-12-15 14:30")

      expect(result).to include(success: true, new_start: "2026-12-15T14:30:00-03:00", new_end: "2026-12-15T15:30:00-03:00")
      saved = Agenda::Booking.scoped(organization.id, booking.id)
      expect(saved.start).to eq(zone.local(2026, 12, 15, 14, 30))
      expect(saved.end).to eq(zone.local(2026, 12, 15, 15, 30))
      expect(saved.event_history.last).to include("event_name" => "time_update", "user_name" => "Marina Duarte")
      expect(executor.changes_applied.first).to include(action: "reschedule_appointment", appointmentId: booking.id.to_s)
    end

    it "ignora o deslocamento que o modelo mandar: 10:00 é 10:00 no negócio" do
      result = tool("reschedule_appointment", appointment_id: booking.id.to_s, new_start: "2026-12-15T10:00:00Z")

      expect(result[:new_start]).to eq("2026-12-15T10:00:00-03:00")
    end

    it "aceita o fim" do
      expect(tool("reschedule_appointment", appointment_id: booking.id.to_s, new_start: "2026-12-15 10:00", new_end: "2026-12-15 12:00")[:new_end]).to eq("2026-12-15T12:00:00-03:00")
    end

    it "recusa data que não é data, sem mexer" do
      expect(tool("reschedule_appointment", appointment_id: booking.id.to_s, new_start: "amanhã cedo")).to eq(error: "Essa data ou hora não é válida.")
      expect(tool("reschedule_appointment", appointment_id: booking.id.to_s, new_start: "2026-12-15 10:00", new_end: "qualquer")).to eq(error: "Essa data ou hora não é válida.")
      expect(Agenda::Booking.scoped(organization.id, booking.id).start).to eq(zone.local(2026, 12, 10, 10))
    end

    it "recusa fim antes do início" do
      result = tool("reschedule_appointment", appointment_id: booking.id.to_s, new_start: "2026-12-15 10:00", new_end: "2026-12-15 09:00")

      expect(result).to have_key(:error)
      expect(executor.changes_applied).to be_empty
    end

    it "recusa agendamento cancelado" do
      booking.update!(status: "canceled")

      expect(tool("reschedule_appointment", appointment_id: booking.id.to_s, new_start: "2026-12-15 10:00")).to eq(error: "Só dá para remarcar um agendamento ativo.")
    end
  end

  describe "qualify_appointments" do
    def chat_with_message(**attributes)
      chat_for(**attributes).tap { |chat| create(:chat_text_message, chat: chat, role: "user", content: "Quanto custa?") }
    end

    it "analisa a conversa ligada a cada agendamento, com o contexto de agendamento" do
      chat = chat_with_message(user_name: "Ana")
      booking = booking_for(chat: chat)

      result = tool("qualify_appointments", user_question: "quem vai fechar?")

      expect(result).to include(total_appointments: 1, qualified_count: 1, disqualified_count: 0)
      expect(result[:qualified_appointments].first).to include(id: booking.id.to_s, user_name: "Ana", qualification_level: "alto", qualification_score: 8, qualification_reason: "Perguntou o preço")
      expect(llm).to have_received(:complete).with(hash_including(prompt: a_string_including("oportunidades reais de venda", "quem vai fechar?")))
      expect(executor.tool_activities.map { |activity| activity[:toolName] }).to include("analyze_chat")
    end

    it "separa o que parece teste" do
      allow(llm).to receive(:complete).and_return({ qualification_score: 1, qualification: "nao_qualificado", reason: "Teste", is_test: true, key_signals: [], recommended_action: "" }.to_json)
      booking_for(chat: chat_with_message)

      result = tool("qualify_appointments")

      expect(result).to include(qualified_count: 0, disqualified_count: 1)
      expect(result[:disqualified_appointments].first).to include(qualification_reason: "Teste", is_test: true)
    end

    it "agendamento sem conversa fica sem análise, e não como desqualificado" do
      booking_for

      entry = tool("qualify_appointments")[:qualified_appointments].first

      expect(entry).to include(qualification_level: "sem_analise", qualification_reason: "Sem conversa disponível para analisar.")
    end

    it "não lê conversa que a pessoa não pode ver" do
      person = member_with(organization, chat: "all", calendar: "all", chat_list_to: "assigned")
      booking_for(chat: chat_with_message(assigned_account_id: account.id))

      result = tool("qualify_appointments", {}, on: described_class.new(account: person, notify: notify, chat: llm))

      expect(llm).not_to have_received(:complete)
      expect(result[:qualified_appointments].first).to include(qualification_level: "sem_analise")
    end

    it "por padrão só os ativos, e nunca mais que o lote do analisador" do
      booking_for(chat: chat_with_message, status: "canceled")
      expect(tool("qualify_appointments")).to eq(appointments: [], summary: "Nenhum agendamento encontrado.")

      stub_const("Copilot::ConversationAnalyzer::MAX_BATCH_SIZE", 1)
      2.times { booking_for(chat: chat_with_message) }
      expect(tool("qualify_appointments", limit: 25)[:total_appointments]).to eq(1)
    end
  end

  describe "get_appointment_stats" do
    it "soma tudo sem carregar um por um" do
      other_service = create(:agenda_offering, calendar: calendar, name: "Ajuste", professionals: [ professional ])
      past = 2.days.ago

      booking_for(start: past, service: service, professional: professional, attendance_status: "show")
      booking_for(start: past, service: service, professional: professional, attendance_status: "no_show")
      booking_for(start: past, service: other_service, professional: professional)
      booking_for(start: past, service: service, status: "canceled")
      booking_for(start: past)
      booking_for(start: 1.day.from_now, service: service)
      booking_for(start: past, status: "archived")

      result = tool("get_appointment_stats", date_to: 3.days.from_now.to_date.iso8601)

      expect(result).to include(total: 6, active: 5, canceled: 1, cancellation_rate: 16.7)
      expect(result[:attendance]).to eq(show: 1, no_show: 1, pending: 2, no_show_rate: 50.0)
      expect(result[:by_service]).to contain_exactly(
        { service: "Prova", total: 4, active: 3, canceled: 1, show: 1, no_show: 1, no_show_rate: 50.0 },
        { service: "Ajuste", total: 1, active: 1, canceled: 0, show: 0, no_show: 0, no_show_rate: 0 },
        { service: "Sem serviço", total: 1, active: 1, canceled: 0, show: 0, no_show: 0, no_show_rate: 0 }
      )
      expect(result[:by_professional]).to contain_exactly(
        { professional: "Camila", appointments: 3, show: 1, no_show: 1 },
        { professional: "Sem profissional", appointments: 2, show: 0, no_show: 0 }
      )
    end

    it "sem nada, responde zerado, sem dividir por zero" do
      expect(tool("get_appointment_stats")).to include(total: 0, cancellation_rate: 0, attendance: { show: 0, no_show: 0, pending: 0, no_show_rate: 0 })
    end

    it "não conta outra organização" do
      create(:agenda_booking, calendar: create(:agenda_calendar), start: 2.days.ago)

      expect(tool("get_appointment_stats")[:total]).to eq(0)
    end
  end

  describe "get_chat_funnel" do
    let(:funnel) { create(:funnel, organization: organization, name: "Vendas") }

    def chat_in(stage, **attributes)
      chat_for(**attributes).tap { |chat| chat.place_in_funnel!(funnel.id, stage.id) }
    end

    it "traz cada funil com as etapas, a conversão e onde se perde" do
      2.times { chat_in(funnel.stages[0]) }
      chat_in(funnel.stages[1])
      chat_in(funnel.stages[3])

      entry = tool("get_chat_funnel")[:funnels].first

      expect(entry).to include(funnel_id: funnel.id, name: "Vendas", total: 4)
      expect(entry[:steps].first).to eq(step: "Novo", currently_in_step: 2, reached_step: 4, rate_from_first_step: 100.0, rate_from_previous_step: 100.0, drop_off_from_previous_step: 0)
      expect(entry[:steps].second).to include(step: "Atendimento", reached_step: 2, rate_from_first_step: 50.0, drop_off_from_previous_step: 2)
    end

    it "só conta as conversas que a pessoa pode ver" do
      person = member_with(organization, chat: "all", funnel: "all", chat_list_to: "assigned")
      chat_in(funnel.stages[0], assigned_account_id: person.id)
      chat_in(funnel.stages[0], assigned_account_id: account.id)

      result = tool("get_chat_funnel", {}, on: described_class.new(account: person, notify: notify, chat: llm))

      expect(result[:funnels].first[:total]).to eq(1)
    end

    it "conta pela última mensagem no período" do
      chat_in(funnel.stages[0], created_at: 200.days.ago, last_message_at: 1.day.ago)
      chat_in(funnel.stages[0], created_at: 200.days.ago, last_message_at: 100.days.ago)

      expect(tool("get_chat_funnel")[:funnels].first[:total]).to eq(1)
    end

    it "não traz funil de outra organização" do
      create(:funnel)

      expect(tool("get_chat_funnel")[:funnels]).to eq([])
    end
  end

  describe "conversão no ranking da equipe" do
    let!(:attendant) { create(:account, organization: organization, role: "member", name: "Camila", email: "camila@exemplo.com.br") }

    def attended_chat(**attributes)
      chat_for(assigned_account_id: attendant.id, status: "closed", last_message_at: 1.minute.ago, **attributes).tap do |chat|
        question = create(:chat_text_message, chat: chat, role: "user", created_at: 10.minutes.ago)
        ChatMessage::Text.create!(chat: chat, role: "assistant", content: "Oi", account_id: attendant.id, created_at: question.created_at + 2.minutes)
      end
    end

    it "conta os agendamentos criados nas conversas que a pessoa atendeu" do
      chat = attended_chat
      attended_chat
      booking_for(chat: chat)
      booking_for(chat: chat_for)

      agent = tool("get_agent_performance", user_email: attendant.email)[:agents].first

      expect(agent).to include(chats_handled: 2, appointments_created: 1, conversion_rate: 50.0)
    end

    # Na origem dividia agendamentos por conversas, e quem remarcava passava de 100%.
    it "a conversão é de conversas com agendamento: dois na mesma conversa não passam de 100%" do
      chat = attended_chat
      2.times { booking_for(chat: chat) }

      agent = tool("get_agent_performance", user_email: attendant.email)[:agents].first

      expect(agent).to include(chats_handled: 1, appointments_created: 2, conversion_rate: 100.0)
    end

    it "não conta agendamento cancelado de outro período, nem arquivado" do
      chat = attended_chat
      booking_for(chat: chat, created_at: 60.days.ago)
      booking_for(chat: chat, status: "archived")

      expect(tool("get_agent_performance", user_email: attendant.email)[:agents].first[:appointments_created]).to eq(0)
    end

    it "com agenda, a conversão pesa 30 pontos na nota, sobre 100" do
      chat = attended_chat
      booking_for(chat: chat)

      entry = tool("get_team_ranking")[:ranking].first

      # 30 do tempo de resposta + 30 da conversão (100% vezes 1,5, com teto) + 0,5 do volume + 1 de fechada.
      expect(entry).to include(name: "Camila", conversion_rate: 100.0, performance_score: 61.5)
    end

    it "sem agenda, os outros critérios valem proporcionalmente" do
      attended_chat

      entry = tool("get_team_ranking")[:ranking].first

      expect(entry).to include(conversion_rate: 0.0, performance_score: 45.0)
    end

    it "ordena por conversão quando pedido" do
      other = create(:account, organization: organization, role: "member", name: "Thiago")
      converted = chat_for(assigned_account_id: other.id, last_message_at: 1.minute.ago)
      create(:chat_text_message, chat: converted, role: "assistant", content: "Oi", account_id: other.id, created_at: 2.minutes.ago)
      booking_for(chat: converted)
      attended_chat
      attended_chat

      ranking = tool("get_team_ranking", sort_by: "conversion_rate")[:ranking]

      expect(ranking.map { |entry| entry[:name] }).to eq(%w[Thiago Camila])
    end
  end

  it "atividade de agenda sai com ícone e texto" do
    tool("list_appointments")

    expect(events.last.last).to include(toolName: "list_appointments", activityType: "reading", icon: "calendar", description: "Listando agendamentos...")
  end
end
