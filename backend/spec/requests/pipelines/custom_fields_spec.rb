require "rails_helper"

RSpec.describe "Pipelines: campos personalizados", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:fields_path) { board_path(board, "/custom-fields") }

  it "exige sessão e permissão" do
    get fields_path
    expect(response).to have_http_status(:unauthorized)

    get fields_path, headers: auth_headers(member_with(chat: "all"))
    expect(response).to have_http_status(:forbidden)
  end

  it "responde 404 para quadro de outra organização" do
    get board_path(create(:pipeline_board), "/custom-fields"), headers: headers

    expect(response).to have_http_status(:not_found)
  end

  describe "POST" do
    it "cria, com a chave saindo do nome" do
      post fields_path, params: { customField: { name: "Forma de Pagamento", fieldType: "select", options: %w[Pix Boleto] } },
        headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include(
        "key" => "forma_de_pagamento", "fieldType" => "select", "options" => %w[Pix Boleto], "scope" => "board", "position" => 1
      )
    end

    it "cria um campo da etapa" do
      stage = create(:pipeline_stage, board: board)

      post fields_path, params: { customField: { name: "Orçamento", fieldType: "number", scope: "stage", stageId: stage.id, requiredToLeaveStage: true } },
        headers: headers, as: :json

      expect(json).to include("scope" => "stage", "stageId" => stage.id, "requiredToLeaveStage" => true)
    end

    it "responde 422 para campo de etapa sem etapa, e para etapa de outro quadro" do
      post fields_path, params: { customField: { name: "X", fieldType: "text", scope: "stage" } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      post fields_path, params: { customField: { name: "X", fieldType: "text", scope: "stage", stageId: create(:pipeline_stage).id } },
        headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 para escopo e tipo desconhecidos" do
      post fields_path, params: { customField: { name: "X", fieldType: "text", scope: "column" } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      post fields_path, params: { customField: { name: "X", fieldType: "foto" } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 para seleção sem opções" do
      post fields_path, params: { customField: { name: "X", fieldType: "select" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 para dois campos com a mesma chave no quadro" do
      create(:pipeline_custom_field, board: board, name: "Origem")

      post fields_path, params: { customField: { name: "ORIGEM", fieldType: "text" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("key")
    end

    it "dá uma chave mesmo a um nome sem letra latina" do
      post fields_path, params: { customField: { name: "日本語", fieldType: "text" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["key"]).to match(/\Acampo_[0-9a-f]+\z/)
    end
  end

  describe "PATCH" do
    it "renomear não muda a chave: os valores dos cards continuam achando o campo" do
      field = create(:pipeline_custom_field, board: board, name: "Origem")
      stage = create(:pipeline_stage, board: board)
      card = create(:pipeline_card, stage: stage, custom_field_values: { "origem" => "Instagram" })

      patch "#{fields_path}/#{field.id}", params: { customField: { name: "Canal de origem" } }, headers: headers, as: :json

      expect(json).to include("name" => "Canal de origem", "key" => "origem")
      expect(card.reload.custom_field_value(json["key"])).to eq("Instagram")
    end

    it "responde 404 para campo de outro quadro" do
      other = create(:pipeline_custom_field)

      patch "#{fields_path}/#{other.id}", params: { customField: { name: "X" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  it "apaga" do
    field = create(:pipeline_custom_field, board: board)

    delete "#{fields_path}/#{field.id}", headers: headers

    expect(response).to have_http_status(:no_content)
  end

  it "lista primeiro os do quadro" do
    stage = create(:pipeline_stage, board: board)
    create(:pipeline_custom_field, board: board, stage: stage, scope: "stage", name: "Da etapa")
    create(:pipeline_custom_field, board: board, name: "Do quadro")

    get fields_path, headers: headers

    expect(json["customFields"].map { |field| field["name"] }).to eq([ "Do quadro", "Da etapa" ])
  end

  it "reordena" do
    fields = create_list(:pipeline_custom_field, 2, board: board)

    post "#{fields_path}/reorder", params: { orderedIds: fields.map(&:id).reverse }, headers: headers, as: :json

    expect(response).to have_http_status(:no_content)
    expect(board.custom_fields.reload.map(&:id)).to eq(fields.map(&:id).reverse)
  end

  it "avisa o quadro quando os campos mudam" do
    stream = ApplicationCable::Channel.organization_stream(organization.id, PipelineBoardChannel.board_stream(board.id))
    path = fields_path

    expect { post path, params: { customField: { name: "Novo", fieldType: "text" } }, headers: headers, as: :json }
      .to have_broadcasted_to(stream).with(event: "custom_fields_changed", data: { boardId: board.id })
  end
end
