require "rails_helper"

RSpec.describe "Pipelines: etapas", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stages_path) { board_path(board, "/stages") }

  it "exige sessão e permissão" do
    post stages_path, params: { stage: { name: "X" } }, as: :json
    expect(response).to have_http_status(:unauthorized)

    post stages_path, params: { stage: { name: "X" } }, headers: auth_headers(member_with(chat: "all")), as: :json
    expect(response).to have_http_status(:forbidden)
  end

  it "responde 404 para quadro de outra organização" do
    other = create(:pipeline_board)

    post board_path(other, "/stages"), params: { stage: { name: "X" } }, headers: headers, as: :json

    expect(response).to have_http_status(:not_found)
  end

  describe "POST" do
    it "cria no fim do quadro" do
      create(:pipeline_stage, board: board)

      post stages_path, params: { stage: { name: "Negociação", color: "#FFAB91", wipLimit: 5, slaHours: 48 } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("name" => "Negociação", "position" => 2, "color" => "#FFAB91", "wipLimit" => 5, "slaHours" => 48)
    end

    it "responde 422 sem nome" do
      post stages_path, params: { stage: { name: " " } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 para SLA negativo" do
      post stages_path, params: { stage: { name: "X", slaHours: -2 } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422, e não 500, para posição que não cabe na coluna" do
      post stages_path, params: { stage: { name: "X", position: 99_999_999_999 } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  describe "PATCH" do
    let(:stage) { create(:pipeline_stage, board: board, name: "Antes") }

    it "altera" do
      patch "#{stages_path}/#{stage.id}", params: { stage: { name: "Depois", slaHours: nil } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("name" => "Depois", "slaHours" => nil)
    end

    it "responde 404 para etapa de outro quadro" do
      other = create(:pipeline_stage)

      patch "#{stages_path}/#{other.id}", params: { stage: { name: "X" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE" do
    let(:stage) { create(:pipeline_stage, board: board) }

    it "apaga com os cards e com o gatilho da etapa, que na origem viraria erro de chave estrangeira" do
      card = create(:pipeline_card, stage: stage)
      trigger = create(:pipeline_trigger, board: board, stage: stage)

      delete "#{stages_path}/#{stage.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Pipelines::Card.exists?(card.id)).to be(false)
      expect(Pipelines::Trigger.exists?(trigger.id)).to be(false)
    end

    it "quem está restrito não apaga cards que não enxerga" do
      role = create(:access_role, organization: organization)
      board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])

      delete "#{stages_path}/#{stage.id}", headers: auth_headers(pipelines_member)

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "POST reorder" do
    let!(:stages) { create_list(:pipeline_stage, 3, board: board) }

    it "grava a nova ordem" do
      post "#{stages_path}/reorder", params: { orderedIds: stages.map(&:id).reverse }, headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(board.stages.reload.map(&:id)).to eq(stages.map(&:id).reverse)
      expect(board.stages.map(&:position)).to eq([ 1, 2, 3 ])
    end

    it "com lista parcial, os citados vão para o começo e o resto mantém a ordem" do
      post "#{stages_path}/reorder", params: { orderedIds: [ stages.last.id ] }, headers: headers, as: :json

      expect(board.stages.reload.map(&:id)).to eq([ stages.last.id, stages.first.id, stages.second.id ])
    end

    it "responde 404 para etapa de outro quadro, sem mexer em nada" do
      other = create(:pipeline_stage)

      post "#{stages_path}/reorder", params: { orderedIds: [ other.id, stages.first.id ] }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(board.stages.reload.map(&:id)).to eq(stages.map(&:id))
    end

    it "transmite a ordem" do
      stream = ApplicationCable::Channel.organization_stream(organization.id, PipelineBoardChannel.board_stream(board.id))

      expect { post "#{stages_path}/reorder", params: { orderedIds: stages.map(&:id).reverse }, headers: headers, as: :json }
        .to have_broadcasted_to(stream).with(event: "stages_reordered", data: { orderedIds: stages.map(&:id).reverse })
    end
  end

  describe "checklist da etapa" do
    let(:stage) { create(:pipeline_stage, board: board) }
    let(:items_path) { "#{stages_path}/#{stage.id}/checklist-items" }

    it "exige sessão e permissão" do
      get items_path
      expect(response).to have_http_status(:unauthorized)

      get items_path, headers: auth_headers(member_with(chat: "all"))
      expect(response).to have_http_status(:forbidden)
    end

    it "responde 404 para etapa de outro quadro" do
      other = create(:pipeline_stage)

      get "#{stages_path}/#{other.id}/checklist-items", headers: headers

      expect(response).to have_http_status(:not_found)
    end

    it "cria, lista, altera e apaga" do
      post items_path, params: { item: { title: "Confirmar CNPJ" } }, headers: headers, as: :json
      expect(response).to have_http_status(:created)
      expect(json).to include("title" => "Confirmar CNPJ", "required" => true, "position" => 1)
      id = json["id"]

      get items_path, headers: headers
      expect(json["items"].map { |item| item["id"] }).to eq([ id ])

      patch "#{items_path}/#{id}", params: { item: { required: false } }, headers: headers, as: :json
      expect(json).to include("required" => false)

      delete "#{items_path}/#{id}", headers: headers
      expect(response).to have_http_status(:no_content)
    end

    it "responde 422 sem título" do
      post items_path, params: { item: { title: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "reordena" do
      items = create_list(:pipeline_stage_checklist_item, 2, stage: stage)

      post "#{items_path}/reorder", params: { orderedIds: items.map(&:id).reverse }, headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(stage.checklist_items.reload.map(&:id)).to eq(items.map(&:id).reverse)
    end
  end
end
