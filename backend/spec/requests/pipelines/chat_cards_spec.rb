require "rails_helper"

RSpec.describe "Pipelines: cards da conversa", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:chat) { create(:chat, organization: organization) }
  let(:board) { create(:pipeline_board, organization: organization, name: "Vendas") }
  let(:stage) { create(:pipeline_stage, board: board, name: "Proposta") }

  def cards_of(target, as: headers)
    get "/pipelines/cards", params: { chatId: target.id.to_s }, headers: as
  end

  it "exige sessão" do
    cards_of(chat, as: {})

    expect(response).to have_http_status(:unauthorized)
  end

  it "exige a permissão de pipelines" do
    cards_of(chat, as: auth_headers(member_with(chat: "all", chat_list_to: "all")))

    expect(response).to have_http_status(:forbidden)
  end

  it "pede a conversa" do
    get "/pipelines/cards", headers: headers

    expect(response).to have_http_status(:bad_request)
    expect(json.dig("error", "code")).to eq("parameterMissing")
  end

  it "responde 404 para conversa de outra organização" do
    cards_of(create(:chat, organization: create(:organization)))

    expect(response).to have_http_status(:not_found)
  end

  it "responde 404 para conversa que a pessoa não enxerga" do
    other = create(:account, organization: organization)
    hidden = create(:chat, organization: organization, assigned_account_id: other.id)
    create(:pipeline_card, stage: stage, chat_id: hidden.id.to_s)

    cards_of(hidden, as: auth_headers(member_with(pipelines: "all", chat_list_to: "assigned")))

    expect(response).to have_http_status(:not_found)
  end

  it "junta os cards de todos os quadros, com o nome do quadro e da etapa" do
    other_board = create(:pipeline_board, organization: organization, name: "Pós-venda")
    other_stage = create(:pipeline_stage, board: other_board, name: "Entregue")
    first = create(:pipeline_card, stage: stage, chat_id: chat.id.to_s, title: "Enxoval", deal_value: 1200)
    second = create(:pipeline_card, stage: other_stage, chat_id: chat.id.to_s, title: "Troca")
    create(:pipeline_card, stage: stage, title: "De outra conversa")

    cards_of(chat)

    expect(response).to have_http_status(:ok)
    expect(json["cards"].pluck("id")).to contain_exactly(first.id, second.id)

    enxoval = json["cards"].find { |card| card["id"] == first.id }
    expect(enxoval).to include("title" => "Enxoval", "dealValue" => 1200.0, "chatId" => chat.id.to_s)
    expect(enxoval["stage"]).to eq("id" => stage.id, "name" => "Proposta")
    expect(enxoval["board"]).to include("id" => board.id, "name" => "Vendas")
  end

  it "deixa de fora o arquivado e o de quadro arquivado" do
    archived_board = create(:pipeline_board, organization: organization, archived: true)
    archived_stage = create(:pipeline_stage, board: archived_board)
    create(:pipeline_card, stage: stage, chat_id: chat.id.to_s, archived: true)
    create(:pipeline_card, stage: archived_stage, chat_id: chat.id.to_s)

    cards_of(chat)

    expect(json["cards"]).to be_empty
  end

  it "respeita o quadro restrito" do
    member = member_with(pipelines: "all", chat: "all", chat_list_to: "all")
    role = create(:access_role, organization: organization)
    board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])
    mine = create(:pipeline_card, stage: stage, chat_id: chat.id.to_s, assigned_to: member)
    create(:pipeline_card, stage: stage, chat_id: chat.id.to_s, assigned_to: owner)

    cards_of(chat, as: auth_headers(member))

    expect(json["cards"].pluck("id")).to eq([ mine.id ])
  end

  it "responde vazio para conversa sem card" do
    cards_of(chat)

    expect(response).to have_http_status(:ok)
    expect(json["cards"]).to eq([])
  end
end
