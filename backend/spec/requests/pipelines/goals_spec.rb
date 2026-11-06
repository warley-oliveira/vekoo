require "rails_helper"

RSpec.describe "Pipelines: metas", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:board) { create(:pipeline_board, organization: organization) }
  let(:stage) { create(:pipeline_stage, board: board) }
  let(:goals_path) { board_path(board, "/goals") }

  it "exige sessão e permissão" do
    get goals_path
    expect(response).to have_http_status(:unauthorized)

    get goals_path, headers: auth_headers(member_with(chat: "all"))
    expect(response).to have_http_status(:forbidden)
  end

  it "responde 404 para quadro de outra organização" do
    get board_path(create(:pipeline_board), "/goals"), headers: headers

    expect(response).to have_http_status(:not_found)
  end

  describe "POST" do
    it "cria a meta do funil" do
      post goals_path, params: { goal: { scope: "funnel", periodMonth: "2026-11", targetValue: 50_000 } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("scope" => "funnel", "periodMonth" => "2026-11", "targetValue" => 50_000.0, "metric" => "revenue", "assignedAccountId" => nil)
    end

    it "cria a meta de uma pessoa" do
      post goals_path, params: { goal: { scope: "user", assignedAccountId: owner.id, periodMonth: "2026-11-15", targetValue: 10_000 } },
        headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("assignedAccountId" => owner.id, "periodMonth" => "2026-11")
    end

    it "responde 422 para duas metas de funil no mesmo mês" do
      create(:pipeline_goal, board: board, period_month: Date.new(2026, 11, 1))

      post goals_path, params: { goal: { scope: "funnel", periodMonth: "2026-11", targetValue: 1 } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "o índice também segura a corrida na meta do funil, que não tem pessoa" do
      create(:pipeline_goal, board: board, period_month: Date.new(2026, 11, 1))
      duplicate = build(:pipeline_goal, board: board, period_month: Date.new(2026, 11, 1))

      expect { duplicate.save(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
    end

    it "responde 422 para meta de pessoa sem a pessoa, e para meta de funil com pessoa" do
      post goals_path, params: { goal: { scope: "user", periodMonth: "2026-11", targetValue: 1 } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      post goals_path, params: { goal: { scope: "funnel", assignedAccountId: owner.id, periodMonth: "2026-11", targetValue: 1 } },
        headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 para pessoa de outra organização" do
      post goals_path, params: { goal: { scope: "user", assignedAccountId: create(:account).id, periodMonth: "2026-11", targetValue: 1 } },
        headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("assignedAccountId")
    end

    it "responde 422, e não grava no mês corrente, para mês inválido ou ausente" do
      post goals_path, params: { goal: { scope: "funnel", periodMonth: "novembro", targetValue: 1 } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("periodMonth")

      post goals_path, params: { goal: { scope: "funnel", targetValue: 1 } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 422 para valor zero ou que não cabe na coluna" do
      post goals_path, params: { goal: { scope: "funnel", periodMonth: "2026-11", targetValue: 0 } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)

      post goals_path, params: { goal: { scope: "funnel", periodMonth: "2026-11", targetValue: 99_999_999_999_999 } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_content)
    end
  end

  it "lista por mês, altera e apaga" do
    goal = create(:pipeline_goal, board: board, period_month: Date.new(2026, 11, 1))
    create(:pipeline_goal, board: board, period_month: Date.new(2026, 10, 1))

    get goals_path, params: { month: "2026-11" }, headers: headers
    expect(json["goals"].map { |item| item["id"] }).to eq([ goal.id ])

    patch "#{goals_path}/#{goal.id}", params: { goal: { targetValue: 20_000 } }, headers: headers, as: :json
    expect(json).to include("targetValue" => 20_000.0)

    delete "#{goals_path}/#{goal.id}", headers: headers
    expect(response).to have_http_status(:no_content)
  end

  it "responde 404 para meta de outro quadro" do
    other = create(:pipeline_goal)

    patch "#{goals_path}/#{other.id}", params: { goal: { targetValue: 1 } }, headers: headers, as: :json

    expect(response).to have_http_status(:not_found)
  end

  describe "GET progress" do
    let(:seller) { pipelines_member }
    let(:other_seller) { pipelines_member }
    let(:month) { Date.new(2026, 11, 1) }

    before do
      create(:pipeline_goal, board: board, period_month: month, target_value: 1_000)
      create(:pipeline_goal, board: board, scope: "user", assigned_account: seller, period_month: month, target_value: 500)
      create(:pipeline_card, stage: stage, assigned_to: seller, deal_value: 250, won_at: Time.zone.local(2026, 11, 10, 12))
      create(:pipeline_card, stage: stage, assigned_to: other_seller, deal_value: 100, won_at: Time.zone.local(2026, 11, 11, 12))
      # Outro mês e negócio aberto não contam.
      create(:pipeline_card, stage: stage, assigned_to: seller, deal_value: 999, won_at: Time.zone.local(2026, 10, 10, 12))
      create(:pipeline_card, stage: stage, assigned_to: seller, deal_value: 999)
    end

    it "soma o que foi ganho no mês" do
      get "#{goals_path}/progress", params: { month: "2026-11" }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["month"]).to eq("2026-11")
      expect(json["funnel"]).to include("targetValue" => 1000.0, "actualValue" => 350.0, "progressPercentage" => 35.0)
      expect(json["users"].first).to include("targetValue" => 500.0, "actualValue" => 250.0, "progressPercentage" => 50.0)
      expect(json["users"].first["user"]).to include("id" => seller.id, "name" => seller.name)
      expect(json["usersWithoutGoal"].map { |user| user["id"] }).to eq([ other_seller.id ])
    end

    it "conta o mês no fuso da organização: um negócio ganho na noite do dia 30, no Brasil, é de novembro" do
      organization.update!(timezone: "America/Sao_Paulo")
      create(:pipeline_card, stage: stage, deal_value: 1_000, won_at: Time.utc(2026, 12, 1, 2, 0))

      get "#{goals_path}/progress", params: { month: "2026-11" }, headers: headers
      expect(json["funnel"]["actualValue"]).to eq(1350.0)

      get "#{goals_path}/progress", params: { month: "2026-12" }, headers: headers
      expect(json["funnel"]).to be_nil
    end

    it "em quadro restrito, a pessoa só vê a própria linha" do
      role = create(:access_role, organization: organization)
      board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])
      create(:pipeline_goal, board: board, scope: "user", assigned_account: other_seller, period_month: month, target_value: 500)

      get "#{goals_path}/progress", params: { month: "2026-11" }, headers: auth_headers(seller)

      expect(json["users"].map { |entry| entry["user"]["id"] }).to eq([ seller.id ])
      expect(json["funnel"]["actualValue"]).to eq(250.0)
    end
  end

  describe "GET history" do
    it "meta e realizado mês a mês, no fuso da organização" do
      organization.update!(timezone: "America/Sao_Paulo")
      create(:pipeline_goal, board: board, period_month: Date.new(2026, 10, 1), target_value: 800)
      create(:pipeline_card, stage: stage, deal_value: 300, won_at: Time.zone.local(2026, 10, 5, 12))
      # 1º de novembro às 2h em UTC ainda é 31 de outubro no Brasil.
      create(:pipeline_card, stage: stage, deal_value: 200, won_at: Time.utc(2026, 11, 1, 2, 0))

      get "#{goals_path}/history", params: { month: "2026-11", months: 2 }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["history"]).to eq([
        { "month" => "2026-10", "targetValue" => 800.0, "actualValue" => 500.0 },
        { "month" => "2026-11", "targetValue" => 0.0, "actualValue" => 0.0 }
      ])
    end
  end
end
