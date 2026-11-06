require "rails_helper"

# A lista unificada: avisos do produto (Postgres, da organização) + avisos da pessoa
# (Mongo). O contrato antigo tem spec própria em notifications_and_credits_spec.rb.
RSpec.describe "Avisos unificados", type: :request do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization, role: "member") }
  let(:colleague) { create(:account, organization: organization, role: "member") }
  let(:stranger) { create(:account, organization: create(:organization)) }
  let(:headers) { auth_headers(account) }

  def notice(**attributes)
    create(:account_notice, account: account, **attributes)
  end

  def product(**attributes)
    create(:notification, organization: organization, **attributes)
  end

  it "exige sessão em todas as rotas" do
    id = SecureRandom.uuid

    get "/notifications"
    expect(response).to have_http_status(:unauthorized)

    get "/notifications/unread-count"
    expect(response).to have_http_status(:unauthorized)

    get "/notifications/#{id}"
    expect(response).to have_http_status(:unauthorized)

    post "/notifications/#{id}/read"
    expect(response).to have_http_status(:unauthorized)

    post "/notifications/read-all"
    expect(response).to have_http_status(:unauthorized)

    delete "/notifications/#{id}"
    expect(response).to have_http_status(:unauthorized)
  end

  describe "GET /notifications" do
    it "junta as duas fontes, do mais recente ao mais antigo" do
      product(key: "welcome", notified_at: 3.days.ago)
      recent = notice(title: "Agora mesmo", created_at: 1.minute.ago)
      product(key: "templates", notified_at: 1.day.ago)
      older = notice(title: "Faz uma semana", created_at: 7.days.ago)

      get "/notifications", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["notifications"].map { |n| n["key"] || n["id"] })
        .to eq([ recent.id.to_s, "templates", "welcome", older.id.to_s ])
    end

    it "mantém o aviso do produto exatamente como era e acrescenta os campos no da pessoa" do
      product(key: "welcome", notified_at: 1.day.ago)
      created = notice(
        title: "Conversa atribuída a você",
        description: "Ana Beatriz está esperando resposta.",
        url: "/chat/123",
        category: "chat",
        actions: [ { action: "open_chat", title: "Abrir conversa", urlPath: "/chat/123" } ],
        created_at: 1.minute.ago
      )

      get "/notifications", headers: headers

      item, old_item = json["notifications"]
      expect(old_item.keys).to contain_exactly("id", "key", "at", "read")
      expect(item).to eq(
        "id" => created.id.to_s,
        "key" => nil,
        "at" => (created.reload.created_at.to_f * 1000).round,
        "read" => false,
        "title" => "Conversa atribuída a você",
        "description" => "Ana Beatriz está esperando resposta.",
        "url" => "/chat/123",
        "category" => "chat",
        "actions" => [ { "action" => "open_chat", "title" => "Abrir conversa", "urlPath" => "/chat/123" } ],
        "readAt" => nil,
        "archivedAt" => nil
      )
    end

    it "conta os não lidos das duas fontes em `unread`" do
      product(read: false)
      product(read: true)
      notice
      notice(read_at: 1.minute.ago)
      notice(archived_at: 1.minute.ago)

      get "/notifications", headers: headers

      expect(json["unread"]).to eq(2)
    end

    it "pagina a lista unificada sem repetir nem pular ninguém" do
      expected = []
      6.times do |n|
        at = (n + 1).hours.ago
        expected << (n.even? ? notice(created_at: at).id.to_s : product(notified_at: at).id)
      end

      get "/notifications", params: { page: 1, perPage: 4 }, headers: headers
      first_page = json

      get "/notifications", params: { page: 2, perPage: 4 }, headers: headers
      second_page = json

      expect((first_page["notifications"] + second_page["notifications"]).map { |n| n["id"] }).to eq(expected)
      expect(first_page["meta"]).to eq("page" => 1, "perPage" => 4, "total" => 6, "totalPages" => 2, "hasMore" => true)
      expect(second_page["meta"]).to include("page" => 2, "hasMore" => false)
    end

    it "limita o tamanho da página em 50, como na origem" do
      get "/notifications", params: { perPage: 500 }, headers: headers

      expect(json["meta"]["perPage"]).to eq(50)
    end

    describe "filtros" do
      let!(:product_unread) { product(read: false, notified_at: 1.hour.ago) }
      let!(:product_read) { product(read: true, notified_at: 2.hours.ago) }
      let!(:notice_unread) { notice(category: "chat", created_at: 3.hours.ago) }
      let!(:notice_read) { notice(category: "calendar", read_at: 1.minute.ago, created_at: 4.hours.ago) }
      let!(:notice_archived) { notice(category: "chat", archived_at: 1.minute.ago, created_at: 5.hours.ago) }

      it "não traz arquivados por padrão" do
        get "/notifications", headers: headers

        expect(json["notifications"].map { |n| n["id"] }).not_to include(notice_archived.id.to_s)
        expect(json["meta"]["total"]).to eq(4)
      end

      it "unread" do
        get "/notifications", params: { unread: "true" }, headers: headers

        expect(json["notifications"].map { |n| n["id"] }).to eq([ product_unread.id, notice_unread.id.to_s ])
      end

      it "read" do
        get "/notifications", params: { read: "true" }, headers: headers

        expect(json["notifications"].map { |n| n["id"] }).to eq([ product_read.id, notice_read.id.to_s ])
      end

      it "archived: só os arquivados da pessoa" do
        foreign = create(:account_notice, account: colleague, archived_at: 1.minute.ago)

        get "/notifications", params: { archived: "true" }, headers: headers

        ids = json["notifications"].map { |n| n["id"] }
        expect(ids).to eq([ notice_archived.id.to_s ])
        expect(ids).not_to include(foreign.id.to_s)
        expect(json["notifications"].first["archivedAt"]).to be_a(Integer)
      end

      it "category só traz os avisos da pessoa daquela categoria" do
        get "/notifications", params: { category: "calendar" }, headers: headers

        expect(json["notifications"].map { |n| n["id"] }).to eq([ notice_read.id.to_s ])
      end

      it "category=system inclui os avisos do produto" do
        system_notice = notice(category: "system", created_at: 6.hours.ago)

        get "/notifications", params: { category: "system" }, headers: headers

        expect(json["notifications"].map { |n| n["id"] })
          .to eq([ product_unread.id, product_read.id, system_notice.id.to_s ])
      end
    end

    it "não mostra aviso de colega nem de outra organização" do
      mine = notice
      create(:account_notice, account: colleague)
      create(:account_notice, account: stranger)
      create(:notification, organization: stranger.organization)

      get "/notifications", headers: headers

      expect(json["notifications"].map { |n| n["id"] }).to eq([ mine.id.to_s ])
      expect(json["unread"]).to eq(1)
    end

    it "mostra os avisos do produto da organização a todas as pessoas dela" do
      shared = product

      get "/notifications", headers: auth_headers(colleague)

      expect(json["notifications"].map { |n| n["id"] }).to eq([ shared.id ])
    end
  end

  describe "GET /notifications/unread-count" do
    it "soma as duas fontes, sem contar lidos nem arquivados" do
      product(read: false)
      product(read: true)
      notice
      notice
      notice(read_at: 1.minute.ago)
      notice(archived_at: 1.minute.ago)
      create(:account_notice, account: colleague)

      get "/notifications/unread-count", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to eq("unreadCount" => 3)
    end
  end

  describe "GET /notifications/:id" do
    it "mostra um aviso da pessoa" do
      created = notice(title: "Novo agendamento")

      get "/notifications/#{created.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to include("id" => created.id.to_s, "title" => "Novo agendamento")
    end

    it "mostra um aviso do produto" do
      created = product(key: "folders")

      get "/notifications/#{created.id}", headers: headers

      expect(json).to include("id" => created.id, "key" => "folders")
    end

    it "responde 404 para aviso de colega, de outra organização e id inválido" do
      foreign_product = create(:notification, organization: stranger.organization)
      foreign_notice = create(:account_notice, account: colleague)

      [ foreign_notice.id, foreign_product.id, SecureRandom.uuid, BSON::ObjectId.new, "nao-existe" ].each do |id|
        get "/notifications/#{id}", headers: headers

        expect(response).to have_http_status(:not_found)
        expect(json.dig("error", "code")).to eq("notFound")
      end
    end
  end

  describe "POST /notifications/:id/read" do
    it "marca um aviso da pessoa e guarda quando foi" do
      created = notice

      post "/notifications/#{created.id}/read", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to include("id" => created.id.to_s, "read" => true)
      expect(json["readAt"]).to be_a(Integer)
      expect(created.reload).to be_read
    end

    it "marca um aviso do produto, para a organização inteira" do
      created = product(read: false)

      post "/notifications/#{created.id}/read", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json.keys).to contain_exactly("id", "key", "at", "read")
      expect(json["read"]).to be(true)

      get "/notifications/unread-count", headers: auth_headers(colleague)
      expect(json["unreadCount"]).to eq(0)
    end

    it "não muda a data de quem já foi lido" do
      created = notice(read_at: 2.days.ago)
      original = created.read_at

      post "/notifications/#{created.id}/read", headers: headers

      expect(created.reload.read_at).to be_within(1.second).of(original)
    end

    it "avisa as outras abas do novo total" do
      created = notice
      notice
      headers

      expect {
        post "/notifications/#{created.id}/read", headers: headers
      }.to have_broadcasted_to(NotificationsChannel.account_stream(organization.id, account.id))
        .with(unreadCount: 1)
    end

    it "responde 404 para aviso de colega e não marca" do
      foreign = create(:account_notice, account: colleague)

      post "/notifications/#{foreign.id}/read", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(foreign.reload).not_to be_read
    end

    it "responde 404 para aviso do produto de outra organização e não marca" do
      foreign = create(:notification, organization: stranger.organization)

      post "/notifications/#{foreign.id}/read", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(foreign.reload.read).to be(false)
    end
  end

  describe "POST /notifications/read-all" do
    it "cobre as duas fontes, e devolve o contrato de antes" do
      product(read: false)
      created = notice

      post "/notifications/read-all", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["unread"]).to eq(0)
      expect(json["notifications"].map { |n| n["read"] }).to eq([ true, true ])
      expect(organization.notifications.unread).to be_empty
      expect(created.reload).to be_read
    end

    it "não mexe nos avisos de colega, nem nos da outra organização" do
      colleague_notice = create(:account_notice, account: colleague)
      foreign_product = create(:notification, organization: stranger.organization)

      post "/notifications/read-all", headers: headers

      expect(colleague_notice.reload).not_to be_read
      expect(foreign_product.reload.read).to be(false)
    end

    it "avisa as outras abas que zerou" do
      notice
      headers

      expect {
        post "/notifications/read-all", headers: headers
      }.to have_broadcasted_to(NotificationsChannel.account_stream(organization.id, account.id))
        .with(unreadCount: 0)
    end
  end

  describe "DELETE /notifications/:id" do
    it "arquiva o aviso da pessoa: sai da lista, fica na aba de arquivados" do
      created = notice

      delete "/notifications/#{created.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(created.reload).to be_archived

      get "/notifications", headers: headers
      expect(json["notifications"]).to be_empty
      expect(json["unread"]).to eq(0)

      get "/notifications", params: { archived: "true" }, headers: headers
      expect(json["notifications"].map { |n| n["id"] }).to eq([ created.id.to_s ])
    end

    it "apaga o aviso do produto, que é da organização inteira" do
      created = product

      delete "/notifications/#{created.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Notification.exists?(created.id)).to be(false)
    end

    it "avisa as outras abas do novo total" do
      created = notice
      headers

      expect {
        delete "/notifications/#{created.id}", headers: headers
      }.to have_broadcasted_to(NotificationsChannel.account_stream(organization.id, account.id))
        .with(unreadCount: 0)
    end

    it "responde 404 para aviso de colega e de outra organização" do
      colleague_notice = create(:account_notice, account: colleague)
      foreign_product = create(:notification, organization: stranger.organization)

      delete "/notifications/#{colleague_notice.id}", headers: headers
      expect(response).to have_http_status(:not_found)
      expect(colleague_notice.reload).not_to be_archived

      delete "/notifications/#{foreign_product.id}", headers: headers
      expect(response).to have_http_status(:not_found)
      expect(Notification.exists?(foreign_product.id)).to be(true)
    end
  end
end
