require "rails_helper"

RSpec.describe "Pipelines: checklists do card", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stage) { create(:pipeline_stage, board: board) }
  let(:card) { create(:pipeline_card, stage: stage) }
  let(:checklists_path) { card_path(card, "/checklists") }

  it "exige sessão e permissão" do
    get checklists_path
    expect(response).to have_http_status(:unauthorized)

    get checklists_path, headers: auth_headers(member_with(chat: "all"))
    expect(response).to have_http_status(:forbidden)
  end

  it "responde 404 para card de outra organização" do
    post card_path(create(:pipeline_card), "/checklists"), params: { checklist: { name: "X" } }, headers: headers, as: :json

    expect(response).to have_http_status(:not_found)
  end

  it "cria, lista, renomeia e apaga" do
    post checklists_path, params: { checklist: { name: "Entrega" } }, headers: headers, as: :json
    expect(response).to have_http_status(:created)
    expect(json).to include("name" => "Entrega", "position" => 1, "items" => [])
    id = json["id"]

    get checklists_path, headers: headers
    expect(json["checklists"].map { |checklist| checklist["id"] }).to eq([ id ])
    expect(json["meta"]).to eq("total" => 1)

    patch "#{checklists_path}/#{id}", params: { checklist: { name: "Envio" } }, headers: headers, as: :json
    expect(json).to include("name" => "Envio")

    delete "#{checklists_path}/#{id}", headers: headers
    expect(response).to have_http_status(:no_content)
  end

  it "responde 422 sem nome" do
    post checklists_path, params: { checklist: { name: "" } }, headers: headers, as: :json

    expect(response).to have_http_status(:unprocessable_content)
  end

  it "responde 404 para checklist de outro card" do
    other = create(:pipeline_checklist)

    patch "#{checklists_path}/#{other.id}", params: { checklist: { name: "X" } }, headers: headers, as: :json

    expect(response).to have_http_status(:not_found)
  end

  describe "itens" do
    let(:checklist) { create(:pipeline_checklist, card: card) }
    let(:items_path) { "#{checklists_path}/#{checklist.id}/items" }

    it "cria, marca, altera e apaga" do
      post items_path, params: { item: { title: "Conferir endereço" } }, headers: headers, as: :json
      expect(response).to have_http_status(:created)
      expect(json).to include("title" => "Conferir endereço", "completed" => false, "position" => 1)
      id = json["id"]

      post "#{items_path}/#{id}/toggle", headers: headers, as: :json
      expect(json).to include("completed" => true)

      post "#{items_path}/#{id}/toggle", headers: headers, as: :json
      expect(json).to include("completed" => false)

      patch "#{items_path}/#{id}", params: { item: { title: "Conferir CEP", assignedToId: owner.id } }, headers: headers, as: :json
      expect(json).to include("title" => "Conferir CEP", "assignedToId" => owner.id)

      delete "#{items_path}/#{id}", headers: headers
      expect(response).to have_http_status(:no_content)
    end

    it "responde 422 sem título" do
      post items_path, params: { item: { title: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 para responsável de outra organização" do
      item = create(:pipeline_checklist_item, checklist: checklist)

      patch "#{items_path}/#{item.id}", params: { item: { assignedToId: create(:account).id } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 404 para item de outro checklist" do
      other = create(:pipeline_checklist_item)

      post "#{items_path}/#{other.id}/toggle", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(other.reload.completed).to be(false)
    end

    it "avisa o quadro do novo progresso do card" do
      item = create(:pipeline_checklist_item, checklist: checklist)
      stream = ApplicationCable::Channel.organization_stream(organization.id, PipelineBoardChannel.full_card_stream(board))
      path = "#{items_path}/#{item.id}/toggle"

      expect { post path, headers: headers, as: :json }
        .to have_broadcasted_to(stream).with { |payload|
          expect(payload["event"]).to eq("card_updated")
          expect(payload.dig("data", "checklistProgress")).to eq("completed" => 1, "total" => 1)
        }
    end
  end

  describe "checklist da etapa, visto do card" do
    let!(:item) { create(:pipeline_stage_checklist_item, stage: stage, title: "Confirmar CNPJ") }
    let(:checks_path) { card_path(card, "/stage-checks") }

    it "lista o que falta" do
      get checks_path, headers: headers

      expect(json["checks"]).to eq([ {
        "id" => item.id, "title" => "Confirmar CNPJ", "position" => 1, "required" => true,
        "completed" => false, "completedAt" => nil, "completedById" => nil
      } ])
    end

    it "marca e desmarca, com quem foi" do
      post "#{checks_path}/#{item.id}/toggle", headers: headers, as: :json
      expect(json).to include("checklistItemId" => item.id, "completed" => true, "completedById" => owner.id)

      post "#{checks_path}/#{item.id}/toggle", headers: headers, as: :json
      expect(json).to include("completed" => false, "completedById" => nil)
    end

    it "mostra o progresso no card" do
      post "#{checks_path}/#{item.id}/toggle", headers: headers, as: :json

      get card_path(card), headers: headers

      expect(json["stageChecksProgress"]).to eq("completed" => 1, "total" => 1)
    end

    it "responde 404 para item de outra organização, que a origem marcava sem conferir" do
      foreign = create(:pipeline_stage_checklist_item)

      post "#{checks_path}/#{foreign.id}/toggle", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(Pipelines::CardStageCheck.count).to eq(0)
    end

    it "exige sessão e permissão" do
      get checks_path
      expect(response).to have_http_status(:unauthorized)

      get checks_path, headers: auth_headers(member_with(chat: "all"))
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "anexos do card" do
    let(:attachments_path) { card_path(card, "/attachments") }

    def upload(name = "contrato.pdf")
      Rack::Test::UploadedFile.new(StringIO.new("%PDF-1.4 contrato"), "application/pdf", original_filename: name)
    end

    it "exige sessão e permissão" do
      get attachments_path
      expect(response).to have_http_status(:unauthorized)

      get attachments_path, headers: auth_headers(member_with(chat: "all"))
      expect(response).to have_http_status(:forbidden)
    end

    it "envia, lista e apaga" do
      post attachments_path, params: { file: upload }, headers: headers

      expect(response).to have_http_status(:created)
      expect(json).to include("fileName" => "contrato.pdf", "contentType" => "application/pdf")
      expect(json["uploadedBy"]).to include("id" => owner.id)
      expect(json["url"]).to start_with("/rails/active_storage")
      id = json["id"]

      get attachments_path, headers: headers
      expect(json["attachments"].map { |attachment| attachment["id"] }).to eq([ id ])

      get card_path(card), headers: headers
      expect(json["attachments"].map { |attachment| attachment["id"] }).to eq([ id ])

      delete "#{attachments_path}/#{id}", headers: headers
      expect(response).to have_http_status(:no_content)
    end

    it "responde 422 sem arquivo, mesmo com um texto no lugar" do
      post attachments_path, params: { file: "nao-sou-arquivo" }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("file")
    end

    it "responde 422 acima do limite" do
      stub_const("Pipelines::MAX_UPLOAD_BYTES", 3)

      post attachments_path, params: { file: upload }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 404 para anexo de outro card" do
      other_card = create(:pipeline_card, stage: stage)
      other = other_card.attachments.create!(uploaded_by: owner, file: upload)

      delete "#{attachments_path}/#{other.id}", headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "atividade do card" do
    let(:activities_path) { card_path(card, "/activities") }

    it "exige sessão e permissão" do
      get activities_path
      expect(response).to have_http_status(:unauthorized)

      get activities_path, headers: auth_headers(member_with(chat: "all"))
      expect(response).to have_http_status(:forbidden)
    end

    it "pagina da mais recente para a mais antiga, em camelCase" do
      card
      other_stage = create(:pipeline_stage, board: board, name: "Proposta")
      post card_path(card, "/move"), params: { stageId: other_stage.id }, headers: headers, as: :json

      get activities_path, params: { limit: 1 }, headers: headers

      expect(response).to have_http_status(:ok)
      first = json["activities"].first
      expect(first).to include("action" => "moved")
      expect(first["details"]).to include("toStage" => "Proposta", "toStageId" => other_stage.id)
      expect(first["user"]).to include("id" => owner.id)
      expect(json).to include("hasMore" => true, "totalCount" => 2)

      get activities_path, params: { cursor: json["nextCursor"] }, headers: headers

      expect(json["activities"].map { |activity| activity["action"] }).to eq([ "created" ])
      expect(json["hasMore"]).to be(false)
    end

    it "filtra pelo tipo, o que na origem nunca devolvia nada" do
      card
      post card_path(card, "/archive"), headers: headers, as: :json

      get activities_path, params: { type: "archived" }, headers: headers

      expect(json["activities"].map { |activity| activity["action"] }).to eq([ "archived" ])
    end

    it "responde 404 para card de outra organização" do
      get card_path(create(:pipeline_card), "/activities"), headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end
end
