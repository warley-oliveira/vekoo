require "rails_helper"

# A tela cega do teste lado a lado. O que importa aqui é o que **não** sai: o
# braço de cada lado e o par de controle ficam escondidos até o resultado.
RSpec.describe "Admin: teste lado a lado", type: :request do
  let(:staff) { create(:account, :staff) }
  let(:headers) { auth_headers(staff) }
  let(:brand) { create(:brand_core, :published) }
  let(:turn) { create(:agent_turn, organization: brand.organization) }
  let(:pieces) { Array.new(4) { |index| create(:piece, organization: brand.organization, brand_core: brand, agent_turn: turn, title: "opção #{index}") } }
  let!(:pairs) do
    [
      [ %w[references plain], false ],
      [ %w[plain plain], true ]
    ].each_with_index.map { |(arms, control), index|
      ReferenceEvalPair.create!(
        round: "1", position: index + 1, brand_core: brand, request_key: "p#{index}", request_text: "pedido #{index}",
        control: control, left_arm: arms.first, right_arm: arms.last,
        left_piece_ids: pieces.first(2).map(&:id), right_piece_ids: pieces.last(2).map(&:id)
      )
    }
  end

  it "responde 404 a quem não é staff" do
    member = auth_headers(create(:account))

    get "/admin/reference-evals", headers: member
    expect(response).to have_http_status(:not_found)
    get "/admin/reference-evals/pairs/#{pairs.first.id}", headers: member
    expect(response).to have_http_status(:not_found)
    patch "/admin/reference-evals/pairs/#{pairs.first.id}", headers: member, params: { pair: { verdict: "left" } }
    expect(response).to have_http_status(:not_found)
  end

  it "lista as rodadas com o andamento" do
    get "/admin/reference-evals", headers: headers

    expect(json["rounds"]).to eq([ { "round" => "1", "total" => 2, "decided" => 0, "createdAt" => json["rounds"].first["createdAt"] } ])
  end

  it "mostra o par sem dizer que lado tem referência nem que é controle" do
    get "/admin/reference-evals/pairs/#{pairs.first.id}", headers: headers

    expect(response).to have_http_status(:ok)
    expect(json).to include("position" => 1, "total" => 2, "requestText" => "pedido 0", "nextId" => pairs.second.id)
    expect(json["left"].map { |piece| piece["title"] }).to eq([ "opção 0", "opção 1" ])
    expect(json.keys).not_to include("leftArm", "rightArm", "control", "arm")
    expect(response.body).not_to include("references", "plain", "control")
  end

  it "grava a avaliação e aponta o próximo par sem avaliação" do
    patch "/admin/reference-evals/pairs/#{pairs.first.id}", headers: headers, params: {
      pair: { verdict: "left", usableLeft: 2, usableRight: 1, reasons: %w[hook copy], copiedSides: [], notes: "capa melhor" }
    }

    expect(response).to have_http_status(:ok)
    expect(pairs.first.reload).to have_attributes(verdict: "left", usable_left: 2, usable_right: 1, reasons: %w[hook copy], decided_by: staff)
    expect(json["nextPendingId"]).to eq(pairs.second.id)
  end

  it "recusa avaliação fora da escala" do
    patch "/admin/reference-evals/pairs/#{pairs.first.id}", headers: headers, params: { pair: { verdict: "meio", usableLeft: 5 } }

    expect(response).to have_http_status(:unprocessable_content)
    expect(pairs.first.reload.verdict).to be_nil
  end

  it "o resultado só sai com a rodada inteira avaliada — e aí revela os braços na conta" do
    get "/admin/reference-evals/1/results", headers: headers
    expect(response).to have_http_status(:conflict)
    expect(json.dig("error", "code")).to eq("evalIncomplete")

    pairs.first.update!(verdict: "left", usable_left: 3, usable_right: 1)
    pairs.second.update!(verdict: "tie", usable_left: 1, usable_right: 1)
    get "/admin/reference-evals/1/results", headers: headers

    expect(response).to have_http_status(:ok)
    expect(json["main"]).to include("referencesWins" => 1, "plainWins" => 0, "winRate" => 1.0)
    expect(json["controls"]).to eq("pairs" => 1, "ties" => 1, "preferred" => 0)
    expect(json["decision"]).to eq("turnOn")
  end
end
