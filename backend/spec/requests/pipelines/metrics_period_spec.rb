require "rails_helper"

RSpec.describe "Pipelines: métricas por período e filtro do histórico", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }
  let(:board) { create(:pipeline_board, :crm, organization: organization) }
  let!(:stage) { create(:pipeline_stage, board: board, name: "Novos") }

  def body = JSON.parse(response.body)

  describe "GET /pipelines/boards/:id/metrics com período" do
    let(:path) { "/pipelines/boards/#{board.id}/metrics" }
    # O "hoje" do pedido é o do fuso da organização. Às 21h em São Paulo, `Date.current` já é amanhã em UTC.
    let(:today) { Time.current.in_time_zone(Pipelines.time_zone_for(organization)).to_date }

    it "não traz `period` sem datas, como sempre foi" do
      get path, headers: headers

      expect(response).to have_http_status(:ok)
      expect(body).not_to have_key("period")
    end

    it "acrescenta `period` ao resto das métricas" do
      create(:pipeline_card, stage: stage, deal_value: 400, won_at: Time.current)

      get path, params: { from: (today - 7).iso8601, to: today.iso8601 }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(body["totalCards"]).to eq(1)
      expect(body["period"]["summary"]).to include("createdCount" => 1, "wonCount" => 1, "wonValue" => 400.0)
      expect(body["period"]["series"].size).to eq(8)
      expect(body["period"]["stageConversion"]["stages"].first).to include("stageName" => "Novos", "reached" => 1)
    end

    it "recusa período inválido" do
      [ { from: "2026-01-10" }, { from: "ontem", to: "hoje" }, { from: "2026-02-01", to: "2026-01-01" },
        { from: "2020-01-01", to: "2026-01-01" } ].each do |period|
        get path, params: period, headers: headers

        expect(response).to have_http_status(:unprocessable_content)
        expect(body.dig("error", "code")).to eq("invalidPeriod")
      end
    end

    it "em quadro restrito, conta só o que a pessoa enxerga" do
      role = create(:access_role, organization: organization)
      board.update!(card_visibility: "assigned", card_visibility_bypass_role_ids: [ role.id ])
      member = member_with(pipelines: "all")
      create(:pipeline_card, stage: stage, assigned_to: member, deal_value: 100, won_at: Time.current)
      create(:pipeline_card, stage: stage, deal_value: 900, won_at: Time.current)

      get path, params: { from: today.iso8601, to: today.iso8601 }, headers: auth_headers(member)

      expect(body["period"]["summary"]).to include("createdCount" => 1, "wonCount" => 1, "wonValue" => 100.0)
      expect(body["period"]["ranking"].map { |entry| entry["user"]["id"] }).to eq([ member.id ])
    end

    it "não enxerga quadro de outra organização" do
      other = create(:pipeline_board, organization: create(:organization))

      get "/pipelines/boards/#{other.id}/metrics", params: { from: "2026-01-01", to: "2026-01-02" }, headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "GET /pipelines/boards/:id/trigger-executions com filtro" do
    let(:path) { "/pipelines/boards/#{board.id}/trigger-executions" }
    let(:card) { create(:pipeline_card, stage: stage) }
    let(:trigger) { create(:pipeline_trigger, board: board) }
    let(:other_trigger) { create(:pipeline_trigger, board: board) }

    before do
      Pipelines::TriggerExecution.create!(trigger: trigger, card: card, status: "failure", executed_at: 2.days.ago)
      Pipelines::TriggerExecution.create!(trigger: trigger, card: card, status: "success", executed_at: 1.day.ago)
      Pipelines::TriggerExecution.create!(trigger: other_trigger, card: card, status: "failure", executed_at: 1.hour.ago)
    end

    it "filtra pelo resultado e conta só o que passou" do
      get path, params: { status: "failure" }, headers: headers

      expect(body["executions"].map { |execution| execution["status"] }).to eq(%w[failure failure])
      expect(body["meta"]["total"]).to eq(2)
    end

    it "filtra pelo gatilho" do
      get path, params: { triggerId: trigger.id }, headers: headers

      expect(body["executions"].map { |execution| execution["triggerId"] }.uniq).to eq([ trigger.id ])
      expect(body["meta"]["total"]).to eq(2)
    end

    it "ignora resultado desconhecido" do
      get path, params: { status: "qualquer" }, headers: headers

      expect(body["meta"]["total"]).to eq(3)
    end
  end
end
