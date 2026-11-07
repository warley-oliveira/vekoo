require "rails_helper"

# `chat_list_to` vale em tudo que acessa uma conversa em nome de uma pessoa (ver CONVENTIONS). Estas rotas
# conferiam só a organização: quem vê apenas as próprias conversas alcançava as dos colegas sabendo o id.
RSpec.describe "chat_list_to nas rotas que recebem uma conversa", type: :request do
  let(:organization) { create(:organization) }
  let(:colleague) { create(:account, organization: organization, role: "member") }
  let(:assigned_role) do
    create(:access_role, organization: organization, name: "Só as minhas",
      permissions: AccessRole::BLANK_PERMISSIONS.merge("chat" => "all", "calendar" => "all", "chat_list_to" => "assigned"))
  end
  let(:person) { create(:account, organization: organization, role: "member", access_role: assigned_role) }
  let(:headers) { auth_headers(person) }

  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let!(:hidden_chat) { create(:chat, organization_id: organization.id.to_s, connector: connector, assigned_account_id: colleague.id.to_s, external_id: "5531900000001") }
  let!(:own_chat) { create(:chat, organization_id: organization.id.to_s, connector: connector, assigned_account_id: person.id.to_s, external_id: "5531900000002") }

  describe "ações agendadas da conversa" do
    let!(:action) { create(:scheduled_action, chat: hidden_chat) }

    it "não lista as de uma conversa que a pessoa não vê" do
      get "/chats/#{hidden_chat.id}/scheduled-actions", headers: headers

      expect(response).to have_http_status(:not_found)
    end

    it "não cancela" do
      delete "/chats/#{hidden_chat.id}/scheduled-actions/#{action.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(action.reload).to be_pending
    end

    it "continua valendo na própria conversa" do
      mine = create(:scheduled_action, chat: own_chat)

      get "/chats/#{own_chat.id}/scheduled-actions", headers: headers
      expect(response).to have_http_status(:ok)

      delete "/chats/#{own_chat.id}/scheduled-actions/#{mine.id}", headers: headers
      expect(response).to have_http_status(:no_content)
    end
  end

  describe "turmas" do
    let(:calendar) { create(:agenda_calendar, :class_group, organization: organization) }
    let(:class_group) { create(:agenda_class_group, calendar: calendar, organization_id: organization.id.to_s) }
    let(:session) { create(:agenda_class_session, class_group: class_group, organization_id: organization.id.to_s) }

    # A resposta traz nome e telefone do contato: era um jeito de ler a ficha de quem a pessoa não vê.
    it "não inscreve uma conversa que a pessoa não vê" do
      post "/calendars/#{calendar.id}/class-groups/#{class_group.id}/enrollments", params: { chatId: hidden_chat.id.to_s }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(class_group.class_enrollments.count).to eq(0)
    end

    it "não põe na lista de presença" do
      post "/class-sessions/#{session.id}/attendances", params: { chatId: hidden_chat.id.to_s }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "continua valendo com a própria conversa" do
      post "/calendars/#{calendar.id}/class-groups/#{class_group.id}/enrollments", params: { chatId: own_chat.id.to_s }, headers: headers, as: :json
      expect(response).to have_http_status(:created)

      post "/class-sessions/#{session.id}/attendances", params: { chatId: own_chat.id.to_s }, headers: headers, as: :json
      expect(response).to have_http_status(:created)
    end
  end

  describe "agendamentos" do
    let(:calendar) { create(:agenda_calendar, organization: organization) }
    let(:times) { { start: 2.days.from_now.iso8601, end: (2.days.from_now + 1.hour).iso8601 } }

    def event_params(chat)
      { event: { calendarId: calendar.id.to_s, chatId: chat.id.to_s, **times } }
    end

    it "não cria com uma conversa que a pessoa não vê" do
      post "/calendar-events", params: event_params(hidden_chat), headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("chatId")
      expect(Agenda::Booking.where(chat_id: hidden_chat.id).count).to eq(0)
    end

    it "não troca a conversa de um agendamento por uma que a pessoa não vê" do
      booking = create(:agenda_booking, calendar: calendar, organization_id: organization.id.to_s, chat: own_chat)

      patch "/calendar-events/#{booking.id}", params: { event: { chatId: hidden_chat.id.to_s } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(booking.reload.chat_id).to eq(own_chat.id)
    end

    it "edita o agendamento que já estava ligado a uma conversa que a pessoa não vê, sem tocar nela" do
      booking = create(:agenda_booking, calendar: calendar, organization_id: organization.id.to_s, chat: hidden_chat)

      patch "/calendar-events/#{booking.id}", params: { event: { chatId: hidden_chat.id.to_s, title: "Outro título" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(booking.reload.title).to eq("Outro título")
    end

    it "continua valendo com a própria conversa" do
      post "/calendar-events", params: event_params(own_chat), headers: headers, as: :json

      expect(response).to have_http_status(:created)
    end
  end
end
