require "rails_helper"

RSpec.describe "Pipelines: cards", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let!(:first_stage) { create(:pipeline_stage, board: board, name: "Novos") }
  let!(:second_stage) { create(:pipeline_stage, board: board, name: "Proposta") }
  let!(:third_stage) { create(:pipeline_stage, board: board, name: "Fechamento") }
  let(:cards_path) { board_path(board, "/cards") }

  def restricted_board
    role = create(:access_role, organization: organization)
    board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])
    board
  end

  describe "sessão, permissão e isolamento" do
    let(:card) { create(:pipeline_card, stage: first_stage) }

    it "exige sessão" do
      get cards_path

      expect(response).to have_http_status(:unauthorized)
    end

    it "exige a permissão de pipelines" do
      get cards_path, headers: auth_headers(member_with(chat: "all"))

      expect(response).to have_http_status(:forbidden)
    end

    it "responde 404 para quadro de outra organização" do
      other_card = create(:pipeline_card)

      get card_path(other_card), headers: headers
      expect(response).to have_http_status(:not_found)

      patch card_path(other_card), params: { card: { title: "Roubado" } }, headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
      expect(other_card.reload.title).not_to eq("Roubado")

      delete card_path(other_card), headers: headers
      expect(response).to have_http_status(:not_found)
      expect(Pipelines::Card.exists?(other_card.id)).to be(true)
    end

    it "responde 404 para card de outro quadro da mesma organização" do
      other_board = create(:pipeline_board, organization: organization)

      get board_path(other_board, "/cards/#{card.id}"), headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "GET cards" do
    it "lista com paginação" do
      create_list(:pipeline_card, 3, stage: first_stage)

      get cards_path, params: { perPage: 2 }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["cards"].size).to eq(2)
      expect(json["meta"]).to include("total" => 3, "hasMore" => true)
    end

    it "não lista os arquivados" do
      create(:pipeline_card, stage: first_stage, archived: true)

      get cards_path, headers: headers

      expect(json["cards"]).to be_empty
    end

    it "conta sem carregar, para a prévia do filtro" do
      create_list(:pipeline_card, 2, stage: first_stage, priority: "high")
      create(:pipeline_card, stage: first_stage, priority: "low")
      filter = { version: 1, all: [ { field: "priority", operator: "eq", value: "high" } ] }.to_json

      get cards_path, params: { filter: filter, countOnly: 1 }, headers: headers

      expect(json).to eq("count" => 2)
    end

    it "filtra por prioridade, responsável, título, etiqueta de texto e prazo" do
      mine = create(:pipeline_card, stage: first_stage, title: "Atacado de canecas", priority: "high", assigned_to: owner,
        tags: %w[vip], due_date: 2.days.from_now)
      create(:pipeline_card, stage: first_stage, title: "Outro", priority: "low", due_date: 30.days.from_now)
      expected = [ mine.id ]

      [
        { priority: "high" },
        { assignedToId: owner.id },
        { search: "caneca" },
        { tags: [ "vip" ] },
        { dueDateTo: 3.days.from_now.to_date.iso8601 }
      ].each do |filters|
        get cards_path, params: filters, headers: headers

        expect(json["cards"].map { |card| card["id"] }).to eq(expected), "falhou com #{filters}"
      end
    end

    describe "ordem" do
      let(:board_with_score) do
        board.tap { |item| item.update_column(:lead_score_field_key, "pontos") }
      end

      def titles
        json["cards"].map { |card| card["title"] }
      end

      it "ordena pela coluna pedida, nos dois sentidos, com vazio sempre no fim" do
        create(:pipeline_card, stage: first_stage, title: "Sem valor", deal_value: nil)
        create(:pipeline_card, stage: first_stage, title: "Barato", deal_value: 100)
        create(:pipeline_card, stage: second_stage, title: "Caro", deal_value: 900)

        get cards_path, params: { sort: "value", direction: "desc" }, headers: headers
        expect(titles).to eq(%w[Caro Barato] + [ "Sem valor" ])

        get cards_path, params: { sort: "value", direction: "asc" }, headers: headers
        expect(titles).to eq(%w[Barato Caro] + [ "Sem valor" ])
      end

      it "ordena a prioridade pela importância, e não pelo texto" do
        %w[low urgent medium high].each do |priority|
          create(:pipeline_card, stage: first_stage, title: priority, priority: priority)
        end

        get cards_path, params: { sort: "priority", direction: "desc" }, headers: headers

        expect(titles).to eq(%w[urgent high medium low])
      end

      it "ordena pela etapa, e dentro dela pela posição do quadro" do
        third = create(:pipeline_card, stage: third_stage, title: "Terceira")
        first = create(:pipeline_card, stage: first_stage, title: "Primeira A")
        second = create(:pipeline_card, stage: first_stage, title: "Primeira B")

        get cards_path, params: { sort: "stage" }, headers: headers
        expect(json["cards"].map { |card| card["id"] }).to eq([ first.id, second.id, third.id ])

        get cards_path, params: { sort: "stage", direction: "desc" }, headers: headers
        expect(json["cards"].map { |card| card["id"] }).to eq([ third.id, first.id, second.id ])
      end

      it "ordena pelo nome do responsável, com quem não tem por último" do
        ana = create(:account, organization: organization, name: "Ana")
        zeca = create(:account, organization: organization, name: "Zeca")
        create(:pipeline_card, stage: first_stage, title: "Do Zeca", assigned_to: zeca)
        create(:pipeline_card, stage: first_stage, title: "Sem ninguém", assigned_to: nil)
        create(:pipeline_card, stage: first_stage, title: "Da Ana", assigned_to: ana)

        get cards_path, params: { sort: "assignee" }, headers: headers

        expect(json["cards"].size).to eq(3)
        expect(titles).to eq([ "Da Ana", "Do Zeca", "Sem ninguém" ])
      end

      it "ordena pela pontuação como número, ignorando o que não é número" do
        board_with_score
        create(:pipeline_card, stage: first_stage, title: "Nove", custom_field_values: { "pontos" => 9 })
        create(:pipeline_card, stage: first_stage, title: "Texto", custom_field_values: { "pontos" => "muito" })
        create(:pipeline_card, stage: first_stage, title: "Oitenta", custom_field_values: { "pontos" => 80 })

        get cards_path, params: { sort: "leadScore", direction: "desc" }, headers: headers

        expect(titles).to eq(%w[Oitenta Nove Texto])
      end

      it "ignora a pontuação em quadro sem o campo, e a ordem que não conhece" do
        create_list(:pipeline_card, 2, stage: first_stage)

        [ "leadScore", "id; DROP TABLE pipeline_cards" ].each do |sort|
          get cards_path, params: { sort: sort }, headers: headers

          expect(response).to have_http_status(:ok)
          expect(json["cards"].size).to eq(2)
        end
      end

      it "vale junto com o filtro e com a paginação" do
        create(:pipeline_card, stage: first_stage, title: "A", deal_value: 100, priority: "high")
        create(:pipeline_card, stage: first_stage, title: "B", deal_value: 300, priority: "high")
        create(:pipeline_card, stage: first_stage, title: "C", deal_value: 200, priority: "low")
        filter = { version: 1, all: [ { field: "priority", operator: "eq", value: "high" } ] }.to_json

        get cards_path, params: { filter: filter, sort: "value", direction: "desc", perPage: 1 }, headers: headers

        expect(titles).to eq(%w[B])
        expect(json["meta"]).to include("total" => 2, "hasMore" => true)
      end
    end

    it "não confunde responsável inválido com card sem responsável" do
      create(:pipeline_card, stage: first_stage)

      get cards_path, params: { assignedToId: "abc" }, headers: headers

      expect(json["cards"]).to be_empty
    end

    it "ignora data de prazo inválida, sem 500" do
      create(:pipeline_card, stage: first_stage, due_date: 1.day.from_now)

      get cards_path, params: { dueDateFrom: "ontem" }, headers: headers

      expect(response).to have_http_status(:ok)
    end

    it "traz só os atrasados com overdue" do
      late = create(:pipeline_card, stage: first_stage, due_date: 1.day.ago)
      create(:pipeline_card, stage: first_stage, due_date: 1.day.from_now)

      get cards_path, params: { overdue: true }, headers: headers

      expect(json["cards"].map { |card| card["id"] }).to eq([ late.id ])
    end

    it "filtra por conversa e mostra o resumo dela" do
      chat = create(:chat, organization: organization, user_name: "Fernanda Lima")
      card = create(:pipeline_card, stage: first_stage, chat_id: chat.id.to_s)
      create(:pipeline_card, stage: first_stage)

      get cards_path, params: { chatId: chat.id.to_s }, headers: headers

      expect(json["cards"].map { |item| item["id"] }).to eq([ card.id ])
      expect(json["cards"].first["chatSummary"]).to include("id" => chat.id.to_s, "contactName" => "Fernanda Lima")
    end

    it "em quadro restrito, só os da pessoa" do
      restricted_board
      member = pipelines_member
      mine = create(:pipeline_card, stage: first_stage, assigned_to: member)
      create(:pipeline_card, stage: first_stage)

      get cards_path, headers: auth_headers(member)

      expect(json["cards"].map { |card| card["id"] }).to eq([ mine.id ])
    end
  end

  describe "GET cards/:id/activities" do
    it "filtra por uma ação ou por várias, separadas por vírgula" do
      card = create(:pipeline_card, stage: first_stage)
      %w[deal_won deal_lost moved].each { |action| card.log_activity(action) }

      get "#{card_path(card)}/activities", params: { type: "moved" }, headers: headers
      expect(json["activities"].map { |activity| activity["action"] }).to eq(%w[moved])

      get "#{card_path(card)}/activities", params: { type: "deal_won,deal_lost" }, headers: headers
      expect(json["activities"].map { |activity| activity["action"] }).to contain_exactly("deal_won", "deal_lost")

      get "#{card_path(card)}/activities", headers: headers
      expect(json["activities"].map { |activity| activity["action"] }).to include("created", "moved", "deal_won", "deal_lost")
    end
  end

  describe "GET cards/:id" do
    it "traz o card aberto: observadores, atividade, checklists e descrição rica" do
      card = create(:pipeline_card, stage: first_stage, description_json: { "type" => "doc", "content" => [] })
      card.watchers.create!(account: owner)
      checklist = create(:pipeline_checklist, card: card, name: "Entrega")
      create(:pipeline_checklist_item, checklist: checklist, title: "Conferir endereço")

      get card_path(card), headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["watchers"].first).to include("id" => owner.id)
      expect(json["activities"].first).to include("action" => "created")
      expect(json["checklists"].first).to include("name" => "Entrega")
      expect(json["checklists"].first["items"].first).to include("title" => "Conferir endereço", "completed" => false)
      expect(json["descriptionJson"]).to eq("type" => "doc", "content" => [])
      expect(json["checklistProgress"]).to eq("completed" => 0, "total" => 1)
      expect(json["attachments"]).to eq([])
    end

    it "mostra o resumo da conversa com o que o compositor precisa" do
      chat = create(:chat, :with_connector, organization: organization)
      card = create(:pipeline_card, stage: first_stage, chat_id: chat.id.to_s)

      get card_path(card), headers: headers

      expect(json["chatSummary"]).to include(
        "id" => chat.id.to_s, "connectorId" => chat.connector_id.to_s, "connectorType" => "Connector::WhatsappWeb", "activeSession" => false
      )
    end

    it "esconde o resumo da conversa que a pessoa não enxerga" do
      chat = create(:chat, organization: organization, assigned_account_id: owner.id.to_s)
      card = create(:pipeline_card, stage: first_stage, chat_id: chat.id.to_s)
      member = member_with(pipelines: "all", chat_list_to: "assigned")

      get card_path(card), headers: auth_headers(member)

      expect(response).to have_http_status(:ok)
      expect(json["chatId"]).to eq(chat.id.to_s)
      expect(json["chatSummary"]).to be_nil
    end

    it "em quadro restrito, card de outra pessoa é 404" do
      restricted_board
      card = create(:pipeline_card, stage: first_stage)

      get card_path(card), headers: auth_headers(pipelines_member)

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST cards" do
    it "cria na etapa pedida, assinado por quem pediu" do
      post cards_path, params: { card: { stageId: second_stage.id, title: "Novo negócio", priority: "high", dealValue: 2500,
                                         customFieldValues: { "cor_Preferida" => "Azul" }, tags: %w[vip] } },
        headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include(
        "title" => "Novo negócio", "stageId" => second_stage.id, "priority" => "high", "dealValue" => 2500.0,
        "createdById" => owner.id, "tags" => [ "vip" ], "hasChat" => false
      )
      # A chave do campo é dado: não vira snake_case na entrada.
      expect(json["customFieldValues"]).to eq("cor_Preferida" => "Azul")
      expect(json["createdBy"]).to include("id" => owner.id, "name" => owner.name)
    end

    it "cria na primeira etapa se nenhuma foi pedida" do
      post cards_path, params: { card: { title: "Sem etapa" } }, headers: headers, as: :json

      expect(json["stageId"]).to eq(first_stage.id)
    end

    it "entra no fim da etapa" do
      create(:pipeline_card, stage: first_stage)

      post cards_path, params: { card: { title: "Segundo" } }, headers: headers, as: :json

      expect(json["position"]).to eq(2)
    end

    it "responde 422 sem título, com o campo" do
      post cards_path, params: { card: { title: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("title")
    end

    it "responde 422 para prioridade desconhecida" do
      post cards_path, params: { card: { title: "X", priority: "altíssima" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("priority")
    end

    it "responde 422 para probabilidade fora de 0 a 100" do
      post cards_path, params: { card: { title: "X", dealProbability: 120 } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422, e não 500, para valor que não cabe na coluna" do
      post cards_path, params: { card: { title: "X", dealValue: 99_999_999_999_999 } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 para responsável de outra organização" do
      stranger = create(:account)

      post cards_path, params: { card: { title: "X", assignedToId: stranger.id } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("assignedToId")
    end

    it "responde 404 para etapa de outro quadro" do
      other = create(:pipeline_stage)

      post cards_path, params: { card: { stageId: other.id, title: "X" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "responde 422 para campos grandes demais" do
      post cards_path, params: { card: { title: "X", customFieldValues: { "a" => "x" * 70.kilobytes } } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "quem só vê os próprios cards não cria um card que some na hora" do
      restricted_board
      member = pipelines_member

      post cards_path, params: { card: { title: "Meu" } }, headers: auth_headers(member), as: :json

      expect(json["assignedToId"]).to eq(member.id)
    end

    context "a partir de uma conversa" do
      let(:chat) { create(:chat, organization: organization, user_name: "Fernanda Lima", external_id: "5531971810932@s.whatsapp.net") }

      it "o título e a descrição vêm da conversa" do
        post cards_path, params: { card: { chatId: chat.id.to_s, createFromChat: true, stageId: second_stage.id } },
          headers: headers, as: :json

        expect(response).to have_http_status(:created)
        expect(json).to include("title" => "Fernanda Lima", "chatId" => chat.id.to_s, "priority" => "medium", "stageId" => second_stage.id)
        expect(json["description"]).to include("Telefone: 5531971810932")
        expect(json["description"]).not_to include("@s.whatsapp.net")
        expect(json["chatSummary"]).to include("contactName" => "Fernanda Lima")
      end

      it "o que veio no pedido ganha do que vem da conversa" do
        post cards_path, params: { card: { chatId: chat.id.to_s, createFromChat: true, title: "Atacado", priority: "urgent" } },
          headers: headers, as: :json

        expect(json).to include("title" => "Atacado", "priority" => "urgent")
      end

      it "responde 404 para conversa de outra organização" do
        foreign = create(:chat)

        post cards_path, params: { card: { chatId: foreign.id.to_s, createFromChat: true } }, headers: headers, as: :json

        expect(response).to have_http_status(:not_found)
      end

      it "responde 404 para conversa que a pessoa não enxerga" do
        hidden = create(:chat, organization: organization, assigned_account_id: owner.id.to_s)
        member = member_with(pipelines: "all", chat_list_to: "assigned")

        post cards_path, params: { card: { chatId: hidden.id.to_s, createFromChat: true } }, headers: auth_headers(member), as: :json

        expect(response).to have_http_status(:not_found)
      end
    end
  end

  describe "PATCH cards/:id" do
    let(:card) { create(:pipeline_card, stage: first_stage) }

    it "altera os campos e devolve o card" do
      patch card_path(card), params: { card: { title: "Renomeado", companyName: "Doma", expectedCloseDate: "2026-12-20" } },
        headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("title" => "Renomeado", "companyName" => "Doma", "expectedCloseDate" => "2026-12-20")
    end

    it "aceita o prazo em milissegundos, como sai na resposta, e em ISO" do
      moment = Time.zone.parse("2026-12-20 15:00:00")

      patch card_path(card), params: { card: { dueDate: (moment.to_f * 1000).to_i } }, headers: headers, as: :json
      expect(json["dueDate"]).to eq((moment.to_f * 1000).to_i)

      patch card_path(card), params: { card: { dueDate: moment.iso8601 } }, headers: headers, as: :json
      expect(json["dueDate"]).to eq((moment.to_f * 1000).to_i)

      patch card_path(card), params: { card: { dueDate: nil } }, headers: headers, as: :json
      expect(json["dueDate"]).to be_nil
    end

    it "deriva o texto da descrição rica, e o `null` limpa" do
      doc = { "type" => "doc", "content" => [ { "type" => "paragraph", "content" => [ { "type" => "text", "text" => "Olá" } ] } ] }

      patch card_path(card), params: { card: { descriptionJson: doc } }, headers: headers, as: :json
      expect(json).to include("description" => "Olá", "descriptionJson" => doc)

      patch card_path(card), params: { card: { descriptionJson: nil } }, headers: headers, as: :json
      expect(json["descriptionJson"]).to be_nil
    end

    it "troca as etiquetas, só da organização, e registra na atividade" do
      label = create(:pipeline_label, organization: organization, name: "Quente")
      foreign = create(:pipeline_label)

      patch card_path(card), params: { card: { labelIds: [ label.id, foreign.id ] } }, headers: headers, as: :json

      expect(json["labels"].map { |item| item["id"] }).to eq([ label.id ])
      expect(card.activities.where(action: "label_added").pluck(:details).first).to include("label" => "Quente")

      patch card_path(card), params: { card: { labelIds: [] } }, headers: headers, as: :json

      expect(json["labels"]).to be_empty
      expect(card.activities.where(action: "label_removed").count).to eq(1)
    end

    it "não muda de etapa nem de posição por aqui" do
      patch card_path(card), params: { card: { stageId: second_stage.id, position: 7, title: "Y" } }, headers: headers, as: :json

      expect(json).to include("stageId" => first_stage.id, "title" => "Y")
      expect(json["position"]).not_to eq(7)
    end

    it "liga a uma conversa só se a pessoa a enxerga" do
      chat = create(:chat, organization: organization)

      patch card_path(card), params: { card: { chatId: chat.id.to_s } }, headers: headers, as: :json
      expect(json["chatId"]).to eq(chat.id.to_s)

      foreign = create(:chat)
      patch card_path(card), params: { card: { chatId: foreign.id.to_s } }, headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
    end

    it "registra o que mudou, com quem foi" do
      patch card_path(card), params: { card: { title: "Renomeado", priority: "high" } }, headers: headers, as: :json

      updates = card.activities.where(action: "updated").to_a
      expect(updates.map { |activity| activity.details["field"] }).to contain_exactly("title", "priority")
      expect(updates.map(&:account_id).uniq).to eq([ owner.id ])
    end

    it "não guarda uma descrição inteira na atividade" do
      patch card_path(card), params: { card: { description: "x" * 5_000 } }, headers: headers, as: :json

      activity = card.activities.find_by(action: "updated")
      expect(activity.details["new_value"].length).to be <= 500
    end
  end

  describe "DELETE cards/:id" do
    it "apaga, mesmo com execução de gatilho registrada" do
      card = create(:pipeline_card, stage: first_stage)
      trigger = create(:pipeline_trigger, board: board)
      Pipelines::TriggerExecution.create!(trigger: trigger, card: card)

      delete card_path(card), headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Pipelines::Card.exists?(card.id)).to be(false)
    end
  end

  describe "POST cards/:id/move" do
    let(:card) { create(:pipeline_card, stage: first_stage) }

    def move(target, position: nil)
      post card_path(card, "/move"), params: { stageId: target.id, position: position }.compact, headers: headers, as: :json
    end

    it "muda de etapa e registra a passagem" do
      freeze_time = 1.hour.ago
      card.update_columns(stage_entered_at: freeze_time)

      move(second_stage)

      expect(response).to have_http_status(:ok)
      expect(json).to include("stageId" => second_stage.id)
      expect(card.reload.stage_entered_at).to be > freeze_time

      activity = card.activities.find_by(action: "moved")
      expect(activity.details).to include("from_stage" => "Novos", "to_stage" => "Proposta", "to_stage_id" => second_stage.id)
    end

    it "põe na posição pedida, deslocando os vizinhos da etapa de destino" do
      others = create_list(:pipeline_card, 2, stage: second_stage)

      move(second_stage, position: 1)

      expect(json["position"]).to eq(1)
      expect(others.map { |other| other.reload.position }).to eq([ 2, 3 ])
    end

    it "fecha o buraco na etapa de origem" do
      card
      below = create(:pipeline_card, stage: first_stage)

      move(second_stage)

      expect(below.reload.position).to eq(1)
    end

    it "reordena dentro da mesma etapa" do
      card
      below = create(:pipeline_card, stage: first_stage)

      post card_path(below, "/move"), params: { stageId: first_stage.id, position: 1 }, headers: headers, as: :json

      expect(below.reload.position).to eq(1)
      expect(card.reload.position).to eq(2)
    end

    it "a posição é na lista que aparece: um arquivado no meio não tira o card do lugar" do
      archived = create(:pipeline_card, stage: second_stage, archived: true)
      first = create(:pipeline_card, stage: second_stage)
      second = create(:pipeline_card, stage: second_stage)

      move(second_stage, position: 2)

      expect(json["position"]).to eq(3)
      expect(second_stage.cards.active.reload.map(&:id)).to eq([ first.id, card.id, second.id ])
      expect(archived.reload.position).to eq(1)
    end

    it "não deixa buraco nem levanta com posição fora da lista" do
      move(second_stage, position: 99)
      expect(json["position"]).to eq(1)

      move(second_stage, position: 0)
      expect(response).to have_http_status(:ok)
      expect(json["position"]).to eq(1)
    end

    it "não mexe no `updated_at` dos vizinhos" do
      neighbor = create(:pipeline_card, stage: second_stage)
      neighbor.update_columns(updated_at: 10.days.ago)

      move(second_stage, position: 1)

      expect(neighbor.reload.position).to eq(2)
      expect(neighbor.updated_at).to be < 9.days.ago
    end

    it "responde 404 para etapa de outro quadro" do
      move(create(:pipeline_stage))

      expect(response).to have_http_status(:not_found)
      expect(card.reload.stage_id).to eq(first_stage.id)
    end

    it "em quadro restrito, a posição é na lista que a pessoa enxerga" do
      restricted_board
      member = pipelines_member
      mine = create(:pipeline_card, stage: first_stage, assigned_to: member)
      hidden = create(:pipeline_card, stage: second_stage)
      visible = create(:pipeline_card, stage: second_stage, assigned_to: member)

      post card_path(mine, "/move"), params: { stageId: second_stage.id, position: 1 }, headers: auth_headers(member), as: :json

      expect(response).to have_http_status(:ok)
      # O primeiro da lista dela é o `visible`, que está na posição 2 de verdade: o oculto fica no lugar.
      expect(mine.reload.position).to eq(2)
      expect(hidden.reload.position).to eq(1)
      expect(visible.reload.position).to eq(3)
    end

    describe "checklist da etapa" do
      let!(:required_item) { create(:pipeline_stage_checklist_item, stage: first_stage, title: "Confirmar CNPJ") }
      let!(:optional_item) { create(:pipeline_stage_checklist_item, stage: first_stage, title: "Anotar origem", required: false) }

      it "trava o avanço, dizendo o que falta" do
        move(second_stage)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("checklistIncomplete")
        expect(json.dig("error", "details", "pendingItems")).to eq([ "Confirmar CNPJ" ])
        expect(card.reload.stage_id).to eq(first_stage.id)
      end

      it "libera depois de marcar o obrigatório, sem precisar do opcional" do
        post card_path(card, "/stage-checks/#{required_item.id}/toggle"), headers: headers, as: :json
        expect(response).to have_http_status(:ok)

        move(second_stage)

        expect(response).to have_http_status(:ok)
      end

      it "não trava quem volta" do
        back = create(:pipeline_stage, board: board, name: "Depois")
        create(:pipeline_stage_checklist_item, stage: back, title: "Só para avançar")
        moving = create(:pipeline_card, stage: back)

        post card_path(moving, "/move"), params: { stageId: second_stage.id }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
      end

      it "não trava quem só muda de posição na mesma etapa" do
        move(first_stage, position: 1)

        expect(response).to have_http_status(:ok)
      end
    end

    describe "campo obrigatório para sair da etapa" do
      let!(:field) do
        create(:pipeline_custom_field, board: board, stage: first_stage, name: "Orçamento", field_type: "number",
          scope: "stage", required_to_leave_stage: true)
      end

      it "trava o avanço, dizendo o que falta" do
        move(second_stage)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("requiredFieldsIncomplete")
        expect(json.dig("error", "details", "pendingFields")).to eq([ "Orçamento" ])
      end

      it "aceita zero como resposta" do
        card.update!(custom_field_values: { field.key => 0 })

        move(second_stage)

        expect(response).to have_http_status(:ok)
      end
    end

    it "transmite e enfileira os gatilhos da etapa de destino, não os das outras" do
      to_second = create(:pipeline_trigger, board: board, stage: second_stage, event_type: "card_moved")
      create(:pipeline_trigger, board: board, stage: third_stage, event_type: "card_moved")
      card

      expect { move(second_stage) }.to have_enqueued_job(Pipelines::TriggerJob).with(to_second.id, card.id, anything).exactly(:once)
    end
  end

  describe "POST cards/reorder" do
    let!(:cards) { create_list(:pipeline_card, 3, stage: first_stage) }

    def reorder(ids, stage: first_stage, as_headers: headers)
      post cards_path + "/reorder", params: { stageId: stage.id, orderedIds: ids }, headers: as_headers, as: :json
    end

    it "grava a nova ordem" do
      reorder(cards.map(&:id).reverse)

      expect(response).to have_http_status(:no_content)
      expect(first_stage.cards.reload.map(&:id)).to eq(cards.map(&:id).reverse)
    end

    it "não dispara gatilho de card atualizado nem muda o `updated_at`" do
      create(:pipeline_trigger, board: board, event_type: "card_updated")
      cards.each { |card| card.update_columns(updated_at: 5.days.ago) }

      expect { reorder(cards.map(&:id).reverse) }.not_to have_enqueued_job(Pipelines::TriggerJob)

      expect(cards.first.reload.updated_at).to be < 4.days.ago
    end

    it "responde 404 para card de outra etapa: mudar de etapa é `move`, que confere as travas" do
      create(:pipeline_stage_checklist_item, stage: second_stage)
      other = create(:pipeline_card, stage: second_stage)

      reorder([ other.id ])

      expect(response).to have_http_status(:not_found)
      expect(other.reload.stage_id).to eq(second_stage.id)
    end

    it "responde 422 para lista gigante" do
      reorder(Array.new(Pipelines::Reorder::MAX_IDS + 1) { SecureRandom.uuid })

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("tooManyIds")
    end

    it "em quadro restrito, troca só as posições dos próprios cards" do
      restricted_board
      member = pipelines_member
      cards.first.update!(assigned_to: member)
      cards.last.update!(assigned_to: member)

      reorder([ cards.last.id, cards.first.id ], as_headers: auth_headers(member))

      expect(response).to have_http_status(:no_content)
      expect(first_stage.cards.reload.map(&:id)).to eq([ cards.last.id, cards.second.id, cards.first.id ])
    end

    it "em quadro restrito, card de outra pessoa é 404" do
      restricted_board
      member = pipelines_member

      reorder([ cards.first.id ], as_headers: auth_headers(member))

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST cards/:id/archive" do
    let(:card) { create(:pipeline_card, stage: first_stage) }

    it "arquiva e desfaz" do
      post card_path(card, "/archive"), headers: headers, as: :json
      expect(json).to include("archived" => true)
      expect(card.activities.where(action: "archived").count).to eq(1)

      post card_path(card, "/archive"), params: { undo: true }, headers: headers, as: :json
      expect(json).to include("archived" => false)
    end
  end

  describe "ganho, perdido e reabrir" do
    let(:chat) { create(:chat, organization: organization) }
    let(:card) { create(:pipeline_card, stage: first_stage, chat_id: chat.id.to_s, deal_value: 500) }

    def tag_names
      ChatTag.where(:_id.in => chat.reload.chat_tag_ids).pluck(:name)
    end

    it "marca ganho e etiqueta a conversa" do
      post card_path(card, "/mark-won"), headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("wonAt" => be_a(Integer), "lostAt" => nil, "completedAt" => be_a(Integer))
      expect(tag_names).to eq([ "ganho" ])
      expect(card.activities.where(action: "deal_won").count).to eq(1)
    end

    it "marca perdido com o motivo, trocando a etiqueta" do
      post card_path(card, "/mark-won"), headers: headers, as: :json
      post card_path(card, "/mark-lost"), params: { lostReason: "Preço" }, headers: headers, as: :json

      expect(json).to include("lostAt" => be_a(Integer), "wonAt" => nil, "lostReason" => "Preço")
      expect(tag_names).to eq([ "perdido" ])
    end

    it "reabre, tira a etiqueta e registra o evento, que na origem nunca acontecia" do
      board.update!(board_type: "crm")
      trigger = create(:pipeline_trigger, board: board, event_type: "deal_reopened")
      post card_path(card, "/mark-won"), headers: headers, as: :json

      expect { post card_path(card, "/reopen"), headers: headers, as: :json }
        .to have_enqueued_job(Pipelines::TriggerJob).with(trigger.id, card.id, anything)

      expect(json).to include("wonAt" => nil, "lostAt" => nil, "completedAt" => nil, "archived" => false)
      expect(tag_names).to be_empty
      expect(card.activities.where(action: "deal_reopened").count).to eq(1)
    end

    it "arquiva na hora se o quadro manda" do
      board.update!(deal_close_behavior: "immediate")

      post card_path(card, "/mark-won"), headers: headers, as: :json

      expect(json).to include("archived" => true)
    end

    context "com campos obrigatórios para fechar" do
      before do
        board.update!(require_fields_on_deal_won: true)
        create(:pipeline_custom_field, board: board, name: "Forma de pagamento", required: true)
      end

      it "trava com os campos e as chaves" do
        post card_path(card, "/mark-won"), headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("requiredFieldsIncomplete")
        expect(json.dig("error", "details")).to eq(
          "pendingFields" => [ "Forma de pagamento" ], "pendingFieldKeys" => [ "forma_de_pagamento" ]
        )
        expect(card.reload.won_at).to be_nil
      end

      it "só vale para o desfecho pedido" do
        post card_path(card, "/mark-lost"), headers: headers, as: :json

        expect(response).to have_http_status(:ok)
      end

      it "libera com o campo preenchido" do
        card.update!(custom_field_values: { "forma_de_pagamento" => "Pix" })

        post card_path(card, "/mark-won"), headers: headers, as: :json

        expect(response).to have_http_status(:ok)
      end
    end
  end

  describe "POST cards/bulk-update" do
    let!(:cards) { create_list(:pipeline_card, 2, stage: first_stage) }

    it "altera todos" do
      post cards_path + "/bulk-update", params: { cardIds: cards.map(&:id), priority: "urgent", assignedToId: owner.id },
        headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(cards.map { |card| card.reload.priority }).to all(eq("urgent"))
      expect(cards.map(&:assigned_to_id)).to all(eq(owner.id))
    end

    it "ignora o card de outro quadro" do
      other = create(:pipeline_card)

      post cards_path + "/bulk-update", params: { cardIds: [ other.id ], priority: "urgent" }, headers: headers, as: :json

      expect(other.reload.priority).to be_nil
    end

    it "é tudo ou nada" do
      post cards_path + "/bulk-update", params: { cardIds: cards.map(&:id), priority: "inventada" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(cards.map { |card| card.reload.priority }).to all(be_nil)
    end

    it "tem teto" do
      ids = Array.new(Pipelines::CardsController::MAX_BULK_IDS + 1) { SecureRandom.uuid }

      post cards_path + "/bulk-update", params: { cardIds: ids, priority: "high" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("tooManyIds")
    end
  end

  describe "seguir o card" do
    let(:card) { create(:pipeline_card, stage: first_stage) }

    it "segue e deixa de seguir, sem duplicar" do
      2.times { post card_path(card, "/watch"), headers: headers, as: :json }
      expect(json).to eq("watching" => true)
      expect(card.watchers.count).to eq(1)

      delete card_path(card, "/watch"), headers: headers
      expect(json).to eq("watching" => false)
      expect(card.watchers.count).to eq(0)
    end
  end

  describe "pessoa apagada" do
    it "deixa o card de pé, sem responsável" do
      member = pipelines_member
      card = create(:pipeline_card, stage: first_stage, assigned_to: member, created_by: member)
      card.watchers.create!(account: member)
      create(:pipeline_comment, card: card, author: member)

      member.destroy!

      card.reload
      expect(card.assigned_to_id).to be_nil
      expect(card.created_by_id).to be_nil
      expect(card.watchers.count).to eq(0)
      expect(card.comments.take.account_id).to be_nil

      get card_path(card), headers: headers
      expect(response).to have_http_status(:ok)
    end
  end
end
