require "rails_helper"

RSpec.describe "Pipelines: etiquetas", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }

  it "exige sessão e permissão" do
    get "/pipelines/labels"
    expect(response).to have_http_status(:unauthorized)

    get "/pipelines/labels", headers: auth_headers(member_with(chat: "all"))
    expect(response).to have_http_status(:forbidden)
  end

  it "lista só as da organização, em ordem de nome, com busca" do
    create(:pipeline_label, organization: organization, name: "Urgente")
    create(:pipeline_label, organization: organization, name: "Atacado")
    create(:pipeline_label, name: "De outra")

    get "/pipelines/labels", headers: headers
    expect(json["labels"].map { |label| label["name"] }).to eq(%w[Atacado Urgente])

    get "/pipelines/labels", params: { search: "urg" }, headers: headers
    expect(json["labels"].map { |label| label["name"] }).to eq(%w[Urgente])
  end

  describe "POST" do
    it "cria" do
      post "/pipelines/labels", params: { label: { name: "Quente", color: "#E53935" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json).to include("name" => "Quente", "color" => "#E53935")
    end

    it "devolve a que já existe, sem ligar para a caixa" do
      existing = create(:pipeline_label, organization: organization, name: "Quente")

      post "/pipelines/labels", params: { label: { name: " QUENTE ", color: "#000000" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["id"]).to eq(existing.id)
      expect(json["color"]).to eq(existing.color)
    end

    it "o mesmo nome em outra organização é outra etiqueta" do
      create(:pipeline_label, name: "Quente")

      post "/pipelines/labels", params: { label: { name: "Quente", color: "#000000" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
    end

    it "responde 422 sem nome" do
      post "/pipelines/labels", params: { label: { name: "" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "o índice segura a corrida" do
      create(:pipeline_label, organization: organization, name: "Quente")
      duplicate = build(:pipeline_label, organization: organization, name: "quente")

      expect { duplicate.save(validate: false) }.to raise_error(ActiveRecord::RecordNotUnique)
    end
  end

  it "altera e apaga, tirando dos cards" do
    label = create(:pipeline_label, organization: organization)
    stage = create(:pipeline_stage, board: create(:pipeline_board, organization: organization))
    card = create(:pipeline_card, stage: stage)
    card.card_labels.create!(label: label)

    patch "/pipelines/labels/#{label.id}", params: { label: { name: "Morno" } }, headers: headers, as: :json
    expect(json).to include("name" => "Morno")

    delete "/pipelines/labels/#{label.id}", headers: headers
    expect(response).to have_http_status(:no_content)
    expect(card.labels.reload).to be_empty
  end

  it "responde 404 para etiqueta de outra organização" do
    other = create(:pipeline_label)

    patch "/pipelines/labels/#{other.id}", params: { label: { name: "X" } }, headers: headers, as: :json
    expect(response).to have_http_status(:not_found)

    delete "/pipelines/labels/#{other.id}", headers: headers
    expect(response).to have_http_status(:not_found)
  end
end
