require "rails_helper"

# O card mantém o id entre um salvar e outro: a tela guarda o que já desenhou por ele.
RSpec.describe "Id dos cards de um dashboard personalizado", type: :request do
  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }
  let(:dashboard) { create(:custom_dashboard, organization: organization, created_by_account_id: account.id) }

  def widget(**attributes)
    { widgetType: "rich_text", title: "Nota", visualConfig: { content: "Oi" }, layout: { x: 0, y: 0, w: 4, h: 2 }, position: 0, **attributes }
  end

  def save(widgets)
    patch "/custom-dashboards/#{dashboard.id}", params: { customDashboard: { widgets: widgets } }, headers: headers, as: :json
    json["customDashboard"]["widgets"]
  end

  it "mantém o id que veio" do
    id = save([ widget ]).first["id"]

    expect(save([ widget(id: id, title: "Outro título") ]).first).to include("id" => id, "title" => "Outro título")
    expect(dashboard.reload.widgets.first.id.to_s).to eq(id)
  end

  it "aceita o id de um card novo, que a tela já desenhou" do
    id = BSON::ObjectId.new.to_s

    expect(save([ widget(id: id) ]).first["id"]).to eq(id)
  end

  it "gera outro id quando o que veio não serve" do
    expect(save([ widget(id: "nao-e-um-id") ]).first["id"]).to match(/\A\h{24}\z/)
  end

  it "não deixa dois cards com o mesmo id" do
    id = BSON::ObjectId.new.to_s

    ids = save([ widget(id: id), widget(id: id, position: 1) ]).map { |item| item["id"] }

    expect(ids.uniq.size).to eq(2)
    expect(ids).to include(id)
  end

  it "duplicar o dashboard continua gerando ids novos" do
    id = save([ widget ]).first["id"]

    post "/custom-dashboards/#{dashboard.id}/duplicate", headers: headers, as: :json

    expect(json["customDashboard"]["widgets"].first["id"]).not_to eq(id)
  end
end
