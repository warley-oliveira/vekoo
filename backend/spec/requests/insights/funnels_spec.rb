require "rails_helper"

RSpec.describe "Funis", type: :request do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }
  let(:funnel) { create(:funnel, organization: organization, name: "Vendas") }
  let(:stages) { funnel.stages.to_a }

  def chat_for(**attributes)
    create(:chat, organization: organization, **attributes)
  end

  def place(chat, stage, target = funnel)
    chat.place_in_funnel!(target.id, stage.id)
    chat
  end

  describe "sessão e permissão" do
    let(:forbidden) { member_with(organization, chat: "all") }

    it "responde 401 sem sessão" do
      [ -> { get "/funnels" }, -> { get "/funnels/#{funnel.id}/board" }, -> { post "/funnels", params: {}, as: :json } ].each do |request|
        request.call

        expect(response).to have_http_status(:unauthorized)
      end
    end

    it "responde 403 sem a permissão funnel, em todas as rotas" do
      chat = chat_for
      forbidden_headers = auth_headers(forbidden)

      get "/funnels", headers: forbidden_headers
      expect(response).to have_http_status(:forbidden)

      get "/funnels/#{funnel.id}", headers: forbidden_headers
      expect(response).to have_http_status(:forbidden)

      get "/funnels/#{funnel.id}/board", headers: forbidden_headers
      expect(response).to have_http_status(:forbidden)

      post "/funnels", params: { funnel: { name: "X", stages: [ { name: "A" } ] } }, headers: forbidden_headers, as: :json
      expect(response).to have_http_status(:forbidden)

      patch "/funnels/#{funnel.id}", params: { funnel: { name: "X" } }, headers: forbidden_headers, as: :json
      expect(response).to have_http_status(:forbidden)

      delete "/funnels/#{funnel.id}", headers: forbidden_headers
      expect(response).to have_http_status(:forbidden)

      put "/funnels/#{funnel.id}/chats/#{chat.id}", params: { stageId: stages.first.id }, headers: forbidden_headers, as: :json
      expect(response).to have_http_status(:forbidden)
      expect(json.dig("error", "code")).to eq("forbidden")
    end

    it "libera quem tem a permissão, sem precisar ser dono" do
      get "/funnels", headers: auth_headers(member_with(organization, funnel: "all"))

      expect(response).to have_http_status(:ok)
    end
  end

  describe "isolamento entre organizações" do
    let(:other_organization) { create(:organization) }
    let(:other_funnel) { create(:funnel, organization: other_organization) }

    it "não lista funil de outra organização" do
      other_funnel
      funnel

      get "/funnels", headers: headers

      expect(json["funnels"].map { |item| item["id"] }).to eq([ funnel.id ])
    end

    it "responde 404 para funil de outra organização, em todas as rotas" do
      chat = chat_for

      get "/funnels/#{other_funnel.id}", headers: headers
      expect(response).to have_http_status(:not_found)

      get "/funnels/#{other_funnel.id}/board", headers: headers
      expect(response).to have_http_status(:not_found)

      patch "/funnels/#{other_funnel.id}", params: { funnel: { name: "Meu" } }, headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      delete "/funnels/#{other_funnel.id}", headers: headers
      expect(response).to have_http_status(:not_found)
      expect(Funnel.exists?(other_funnel.id)).to be(true)

      put "/funnels/#{other_funnel.id}/chats/#{chat.id}", params: { stageId: other_funnel.stages.first.id }, headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
    end

    it "responde 404 ao mover conversa de outra organização" do
      foreign = create(:chat, organization: other_organization)

      put "/funnels/#{funnel.id}/chats/#{foreign.id}", params: { stageId: stages.first.id }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(Chat.scoped(other_organization.id, foreign.id).funnel_stages).to eq({})
    end

    it "não mostra no quadro conversa de outra organização" do
      foreign = create(:chat, organization: other_organization)
      place(foreign, stages.first)

      get "/funnels/#{funnel.id}/board", headers: headers

      expect(json["metrics"]["total"]).to eq(0)
    end
  end

  describe "GET /funnels" do
    it "lista em ordem alfabética, com as etapas na ordem" do
      create(:funnel, organization: organization, name: "Suporte", stage_names: %w[Aberto Resolvido])
      funnel

      get "/funnels", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["funnels"].map { |item| item["name"] }).to eq(%w[Suporte Vendas])
      expect(json["funnels"].first["stages"].map { |stage| stage["name"] }).to eq(%w[Aberto Resolvido])
      expect(json["funnels"].first["createdAt"]).to be_a(Integer)
      expect(json["meta"]).to include("page" => 1, "total" => 2, "hasMore" => false)
    end
  end

  describe "POST /funnels" do
    it "cria o funil com as etapas na ordem em que vieram" do
      post "/funnels", params: { funnel: { name: " Vendas  da loja ", description: "Da loja física", stages: [ { name: "Novo" }, { name: "Fechado" } ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["funnel"]).to include("name" => "Vendas da loja", "description" => "Da loja física")
      expect(json["funnel"]["stages"].map { |stage| [ stage["name"], stage["position"] ] }).to eq([ [ "Novo", 0 ], [ "Fechado", 1 ] ])
    end

    it "responde 400 sem o envelope" do
      post "/funnels", params: { name: "Vendas" }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
    end

    it "responde 422 sem nome" do
      post "/funnels", params: { funnel: { name: "", stages: [ { name: "Novo" } ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
    end

    it "responde 422 com nome repetido, mesmo escrito de outro jeito" do
      funnel

      post "/funnels", params: { funnel: { name: "VENDAS", stages: [ { name: "Novo" } ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
    end

    it "responde 422 sem etapas" do
      post "/funnels", params: { funnel: { name: "Vendas" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("stagesRequired")
      expect(json.dig("error", "field")).to eq("stages")
    end

    it "responde 422 com etapa sem nome, e não grava o funil" do
      expect {
        post "/funnels", params: { funnel: { name: "Vendas", stages: [ { name: "" } ] } }, headers: headers, as: :json
      }.not_to change(Funnel, :count)

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 com duas etapas de mesmo nome" do
      post "/funnels", params: { funnel: { name: "Vendas", stages: [ { name: "Novo" }, { name: " novo" } ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("duplicateStageName")
    end

    it "responde 422 acima do teto de etapas" do
      list = Array.new(Funnel::MAX_STAGES + 1) { |index| { name: "Etapa #{index}" } }

      post "/funnels", params: { funnel: { name: "Vendas", stages: list } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("tooManyStages")
    end

    it "responde 422 acima do teto de funis" do
      stub_const("Funnel::MAX_PER_ORGANIZATION", 1)
      funnel

      post "/funnels", params: { funnel: { name: "Outro", stages: [ { name: "Novo" } ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "PATCH /funnels/:id" do
    it "renomeia e reordena sem trocar o id das etapas" do
      novo, atendimento, proposta, fechado = stages

      patch "/funnels/#{funnel.id}", params: {
        funnel: { name: "Vendas 2026", stages: [ { id: atendimento.id, name: "Em atendimento" }, { id: novo.id, name: "Novo" }, { id: proposta.id, name: "Proposta" }, { id: fechado.id, name: "Fechado" } ] }
      }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["funnel"]["name"]).to eq("Vendas 2026")
      expect(json["funnel"]["stages"].map { |stage| [ stage["id"], stage["name"] ] }.first(2)).to eq([ [ atendimento.id, "Em atendimento" ], [ novo.id, "Novo" ] ])
    end

    it "sem a lista, deixa as etapas como estão" do
      ids = stages.map(&:id)

      patch "/funnels/#{funnel.id}", params: { funnel: { description: "Nova descrição" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["funnel"]["stages"].map { |stage| stage["id"] }).to eq(ids)
    end

    it "apaga a etapa que não veio, e a conversa dela cai em Sem etapa" do
      chat = place(chat_for, stages.last)

      expect {
        patch "/funnels/#{funnel.id}", params: { funnel: { stages: stages.first(3).map { |stage| { id: stage.id, name: stage.name } } } }, headers: headers, as: :json
      }.to have_enqueued_job(Funnels::CleanupChatsJob).with(organization.id, funnel.id, [ stages.last.id ])

      expect(response).to have_http_status(:ok)
      get "/funnels/#{funnel.id}/board", headers: headers
      expect(json["metrics"]["noStage"]).to eq(1)
      expect(json["columns"].first["chats"].map { |item| item["id"] }).to eq([ chat.id.to_s ])
    end

    it "responde 422 com id de etapa de outro funil, sem mudar nada" do
      other = create(:funnel, organization: organization)
      names = stages.map(&:name)

      patch "/funnels/#{funnel.id}", params: { funnel: { name: "Mudou", stages: [ { id: other.stages.first.id, name: "Roubada" } ] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("invalidStage")
      expect(funnel.reload.name).to eq("Vendas")
      expect(funnel.stages.reload.map(&:name)).to eq(names)
    end

    it "responde 422 com a lista vazia" do
      patch "/funnels/#{funnel.id}", params: { funnel: { stages: [] } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("stagesRequired")
    end
  end

  describe "DELETE /funnels/:id" do
    it "apaga o funil e as etapas, e limpa as conversas num job" do
      funnel_id = funnel.id
      stages

      expect {
        delete "/funnels/#{funnel_id}", headers: headers
      }.to have_enqueued_job(Funnels::CleanupChatsJob).with(organization.id, funnel_id)

      expect(response).to have_http_status(:no_content)
      expect(Funnel.exists?(funnel_id)).to be(false)
      expect(FunnelStage.where(funnel_id: funnel_id)).to be_empty
    end
  end

  describe "GET /funnels/:id/board" do
    it "traz uma coluna por etapa, com Sem etapa primeiro" do
      place(chat_for(user_name: "Ana"), stages[0])
      place(chat_for(user_name: "Bia"), stages[1])
      place(chat_for(user_name: "Caio"), stages[1])
      chat_for(user_name: "Duda")

      get "/funnels/#{funnel.id}/board", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["columns"].map { |column| [ column["stageName"], column["count"] ] }).to eq(
        [ [ "Sem etapa", 1 ], [ "Novo", 1 ], [ "Atendimento", 2 ], [ "Proposta", 0 ], [ "Fechado", 0 ] ]
      )
      expect(json["columns"].first["stageId"]).to be_nil
      expect(json["columns"][1]["stageId"]).to eq(stages[0].id)
      expect(json["columns"][2]["chats"].map { |chat| chat["userName"] }).to contain_exactly("Bia", "Caio")
      expect(json["filters"]).to eq("dateField" => "last_message_at", "days" => 30, "perColumn" => 20)
    end

    it "calcula o funil acumulado, sem contar quem está sem etapa" do
      place(chat_for, stages[0])
      place(chat_for, stages[1])
      place(chat_for, stages[1])
      place(chat_for, stages[3])
      chat_for

      get "/funnels/#{funnel.id}/board", headers: headers

      expect(json["metrics"]).to eq(
        "total" => 5,
        "noStage" => 1,
        "perStageCounts" => [ 1, 2, 0, 1 ],
        "reachedCounts" => [ 4, 3, 1, 1 ],
        "conversionRates" => [ 100.0, 75.0, 25.0, 25.0 ]
      )
    end

    it "traz no card o que a tela mostra, com o nome de quem atende e as etiquetas" do
      person = create(:account, organization: organization, name: "Camila Rocha")
      tag = create(:chat_tag, organization_id: organization.id, name: "vip", color: "#7c3aed")
      chat = place(chat_for(user_name: "Ana", assigned_account_id: person.id, chat_tag_ids: [ tag.id ], custom_attributes: { "cidade" => "Londrina" }), stages[0])

      get "/funnels/#{funnel.id}/board", headers: headers

      card = json["columns"][1]["chats"].first
      expect(card).to include(
        "id" => chat.id.to_s,
        "userName" => "Ana",
        "assignedAccountId" => person.id,
        "assignedAccountName" => "Camila Rocha",
        "stageId" => stages[0].id,
        "chatTags" => [ { "id" => tag.id.to_s, "name" => "vip", "color" => "#7c3aed" } ]
      )
      expect(card["lastMessageAt"]).to be_a(Integer)
      expect(card).not_to have_key("customAttributes")
    end

    it "pagina cada coluna por conta própria" do
      older = place(chat_for(user_name: "Antiga", last_message_at: 3.days.ago), stages[0])
      newer = place(chat_for(user_name: "Nova", last_message_at: 1.day.ago), stages[0])
      other = place(chat_for(user_name: "Outra"), stages[1])

      get "/funnels/#{funnel.id}/board", params: { perColumn: 1, page: { stages[0].id => 2 } }, headers: headers

      columns = json["columns"]
      expect(columns[1]).to include("page" => 2, "count" => 2, "hasMore" => false)
      expect(columns[1]["chats"].map { |chat| chat["id"] }).to eq([ older.id.to_s ])
      expect(columns[2]).to include("page" => 1, "hasMore" => false)
      expect(columns[2]["chats"].map { |chat| chat["id"] }).to eq([ other.id.to_s ])

      get "/funnels/#{funnel.id}/board", params: { perColumn: 1 }, headers: headers

      expect(json["columns"][1]).to include("page" => 1, "hasMore" => true)
      expect(json["columns"][1]["chats"].map { |chat| chat["id"] }).to eq([ newer.id.to_s ])
    end

    it "pagina a coluna Sem etapa" do
      chat_for(last_message_at: 2.days.ago)
      newest = chat_for(last_message_at: 1.day.ago)

      get "/funnels/#{funnel.id}/board", params: { perColumn: 1, page: { none: 1 } }, headers: headers

      expect(json["columns"].first["chats"].map { |chat| chat["id"] }).to eq([ newest.id.to_s ])
      expect(json["columns"].first["hasMore"]).to be(true)
    end

    it "filtra pelo período e pelo campo de data escolhidos" do
      place(chat_for(user_name: "Recente", last_message_at: 2.days.ago, created_at: 40.days.ago), stages[0])
      place(chat_for(user_name: "Parada", last_message_at: 20.days.ago, created_at: 20.days.ago), stages[0])

      get "/funnels/#{funnel.id}/board", params: { days: 7 }, headers: headers
      expect(json["columns"][1]["chats"].map { |chat| chat["userName"] }).to eq([ "Recente" ])

      get "/funnels/#{funnel.id}/board", params: { days: 30, dateField: "created_at" }, headers: headers
      expect(json["columns"][1]["chats"].map { |chat| chat["userName"] }).to eq([ "Parada" ])
    end

    it "filtra pelo responsável, com os mesmos valores de GET /chats" do
      person = create(:account, organization: organization)
      mine = place(chat_for(user_name: "Minha", assigned_account_id: account.id), stages[0])
      theirs = place(chat_for(user_name: "Dela", assigned_account_id: person.id), stages[1])
      free = place(chat_for(user_name: "Livre", assigned_account_id: nil), stages[0])

      get "/funnels/#{funnel.id}/board", params: { assignedUser: "me" }, headers: headers
      expect(json["columns"].flat_map { |column| column["chats"] }.map { |chat| chat["id"] }).to eq([ mine.id.to_s ])
      expect(json["metrics"]).to include("total" => 1, "perStageCounts" => [ 1, 0, 0, 0 ])
      expect(json["filters"]).to include("assignedUser" => "me")

      get "/funnels/#{funnel.id}/board", params: { assignedUser: "unassigned" }, headers: headers
      expect(json["columns"].flat_map { |column| column["chats"] }.map { |chat| chat["id"] }).to eq([ free.id.to_s ])

      get "/funnels/#{funnel.id}/board", params: { assignedUser: person.id }, headers: headers
      expect(json["columns"].flat_map { |column| column["chats"] }.map { |chat| chat["id"] }).to eq([ theirs.id.to_s ])
    end

    it "filtra por etiqueta, com qualquer uma das escolhidas, inclusive nas contagens" do
      vip = create(:chat_tag, organization_id: organization.id.to_s, name: "vip")
      retorno = create(:chat_tag, organization_id: organization.id.to_s, name: "retorno")
      place(chat_for(user_name: "Com vip", chat_tag_ids: [ vip.id ]), stages[0])
      place(chat_for(user_name: "Com retorno", chat_tag_ids: [ retorno.id ]), stages[1])
      place(chat_for(user_name: "Sem etiqueta"), stages[1])

      get "/funnels/#{funnel.id}/board", params: { tagIds: [ vip.id.to_s ] }, headers: headers
      expect(json["columns"].flat_map { |column| column["chats"] }.map { |chat| chat["userName"] }).to eq([ "Com vip" ])
      expect(json["metrics"]).to include("total" => 1, "perStageCounts" => [ 1, 0, 0, 0 ])
      expect(json["filters"]).to include("tagIds" => [ vip.id.to_s ])

      get "/funnels/#{funnel.id}/board", params: { tagIds: [ vip.id.to_s, retorno.id.to_s ] }, headers: headers
      expect(json["metrics"]["total"]).to eq(2)
    end

    it "busca por nome e telefone, como o q de GET /chats, inclusive nas contagens" do
      place(chat_for(user_name: "Fernanda Lima", external_id: "5531971810932"), stages[0])
      place(chat_for(user_name: "João Pedro", external_id: "5541988887766"), stages[1])

      get "/funnels/#{funnel.id}/board", params: { q: "fernanda" }, headers: headers
      expect(json["columns"].flat_map { |column| column["chats"] }.map { |chat| chat["userName"] }).to eq([ "Fernanda Lima" ])
      expect(json["metrics"]).to include("total" => 1, "perStageCounts" => [ 1, 0, 0, 0 ])
      expect(json["filters"]).to include("q" => "fernanda")

      get "/funnels/#{funnel.id}/board", params: { q: "(41) 98888-7766" }, headers: headers
      expect(json["columns"].flat_map { |column| column["chats"] }.map { |chat| chat["userName"] }).to eq([ "João Pedro" ])
    end

    it "não deixa o filtro alcançar conversa que a pessoa não pode ver" do
      person = member_with(organization, funnel: "all", chat_list_to: "assigned")
      place(chat_for(assigned_account_id: account.id), stages[0])

      get "/funnels/#{funnel.id}/board", params: { assignedUser: account.id }, headers: auth_headers(person)

      expect(json["metrics"]["total"]).to eq(0)
    end

    it "ignora filtro de etiqueta que não é lista de textos e operador disfarçado" do
      place(chat_for, stages[0])

      get "/funnels/#{funnel.id}/board", params: { tagIds: { "$ne" => "x" } }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json["metrics"]["total"]).to eq(1)

      get "/funnels/#{funnel.id}/board", params: { assignedUser: { "$ne" => "x" } }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json["metrics"]["total"]).to eq(0)
    end

    it "ignora campo de data fora da lista e segura os limites" do
      get "/funnels/#{funnel.id}/board", params: { dateField: "$where", days: 100_000, perColumn: 100_000 }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["filters"]).to eq("dateField" => "last_message_at", "days" => 365, "perColumn" => 50)
    end

    it "deixa de fora a conversa de teste" do
      place(chat_for(external_id: Chat::TEST_EXTERNAL_ID), stages[0])

      get "/funnels/#{funnel.id}/board", headers: headers

      expect(json["metrics"]["total"]).to eq(0)
    end

    it "fala no idioma da requisição" do
      get "/funnels/#{funnel.id}/board", params: { locale: "en" }, headers: headers

      expect(json["columns"].first["stageName"]).to eq("No stage")
    end

    it "responde sem erro quando o Mongo corta por tempo" do
      collection = instance_double(Mongo::Collection)
      allow(collection).to receive(:aggregate).and_raise(Mongo::Error::OperationFailure.new("operation exceeded time limit", nil, code: 50, code_name: "MaxTimeMSExpired"))
      allow(Chat).to receive(:collection).and_return(collection)

      get "/funnels/#{funnel.id}/board", headers: headers

      expect(response).to have_http_status(:service_unavailable)
      expect(json.dig("error", "code")).to eq("queryTimeout")
    end

    describe "quem vê o quê" do
      let(:team) { create(:team, organization: organization) }
      let(:person) { member_with(organization, funnel: "all", chat_list_to: "assigned") }

      it "só traz o que a pessoa pode ver, inclusive nas contagens" do
        mine = place(chat_for(assigned_account_id: person.id), stages[0])
        place(chat_for(assigned_account_id: account.id), stages[0])
        place(chat_for(assigned_account_id: account.id), stages[1])

        get "/funnels/#{funnel.id}/board", headers: auth_headers(person)

        expect(json["metrics"]).to include("total" => 1, "perStageCounts" => [ 1, 0, 0, 0 ])
        expect(json["columns"][1]["chats"].map { |chat| chat["id"] }).to eq([ mine.id.to_s ])
      end

      it "respeita o nível por departamento" do
        team_person = member_of_team(team, funnel: "all", chat_list_to: "team")
        visible = place(chat_for(team_id: team.id), stages[0])
        place(chat_for(team_id: create(:team, organization: organization).id), stages[0])

        get "/funnels/#{funnel.id}/board", headers: auth_headers(team_person)

        expect(json["columns"][1]["chats"].map { |chat| chat["id"] }).to eq([ visible.id.to_s ])
      end
    end
  end

  describe "PUT /funnels/:funnel_id/chats/:id" do
    let(:chat) { chat_for }

    it "move a conversa para a etapa" do
      put "/funnels/#{funnel.id}/chats/#{chat.id}", params: { stageId: stages[1].id }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("stageId" => stages[1].id, "moved" => true)
      expect(json["chat"]["funnelStages"]).to eq(funnel.id => stages[1].id)
      expect(Chat.scoped(organization.id, chat.id).funnel_stage_id(funnel.id)).to eq(stages[1].id)
    end

    it "tira do funil com stageId nulo" do
      place(chat, stages[0])

      put "/funnels/#{funnel.id}/chats/#{chat.id}", params: { stageId: nil }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("stageId" => nil, "moved" => true)
      expect(Chat.scoped(organization.id, chat.id).funnel_stages).to eq({})
    end

    it "responde 400 sem o campo: corpo errado não tira a conversa do funil" do
      place(chat, stages[0])

      put "/funnels/#{funnel.id}/chats/#{chat.id}", params: { other: 1 }, headers: headers, as: :json

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "field")).to eq("stageId")
      expect(Chat.scoped(organization.id, chat.id).funnel_stage_id(funnel.id)).to eq(stages[0].id)
    end

    it "responde 422 com etapa de outro funil" do
      other = create(:funnel, organization: organization)

      put "/funnels/#{funnel.id}/chats/#{chat.id}", params: { stageId: other.stages.first.id }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("invalidStage")
      expect(Chat.scoped(organization.id, chat.id).funnel_stages).to eq({})
    end

    it "responde 422 com etapa que não existe" do
      put "/funnels/#{funnel.id}/chats/#{chat.id}", params: { stageId: "qualquer-coisa" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("invalidStage")
    end

    it "responde 404 para conversa que a pessoa não pode ver" do
      person = member_with(organization, funnel: "all", chat_list_to: "assigned")
      hidden = chat_for(assigned_account_id: account.id)

      put "/funnels/#{funnel.id}/chats/#{hidden.id}", params: { stageId: stages[0].id }, headers: auth_headers(person), as: :json

      expect(response).to have_http_status(:not_found)
      expect(Chat.scoped(organization.id, hidden.id).funnel_stages).to eq({})
    end

    it "responde 404 para conversa que não existe" do
      put "/funnels/#{funnel.id}/chats/#{BSON::ObjectId.new}", params: { stageId: stages[0].id }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /funnels/:funnel_id/chats/:id" do
    it "tira a conversa só deste funil" do
      other = create(:funnel, organization: organization)
      chat = place(place(chat_for, stages[0]), other.stages.first, other)

      delete "/funnels/#{funnel.id}/chats/#{chat.id}", headers: headers

      expect(response).to have_http_status(:ok)
      expect(Chat.scoped(organization.id, chat.id).funnel_stages).to eq(other.id => other.stages.first.id)
    end
  end
end
