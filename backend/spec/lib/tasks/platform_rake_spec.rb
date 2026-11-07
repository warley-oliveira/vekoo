require "rails_helper"
require "rake"

RSpec.describe "platform:sync" do
  before(:all) { load Rails.root.join("lib/tasks/platform.rake") }

  # Os arquivos do catálogo anunciam o progresso com `puts`, que no deploy vai para o log.
  def sync_tool_catalog
    expect { PlatformTasks.sync_tool_catalog }.to output.to_stdout
  end

  it "traz o catálogo de ferramentas, que a semente não carrega em produção" do
    expect(Tool.count).to eq(0)

    sync_tool_catalog

    expect(Tool.pluck(:slug)).to include("utilidades-brasil", "contact-tags", "catalog")
    expect(Tool.active.count).to eq(Tool.count)
  end

  it "não duplica o catálogo ao rodar de novo" do
    sync_tool_catalog
    count = Tool.count

    sync_tool_catalog

    expect(Tool.count).to eq(count)
  end

  it "dá os grupos padrão à organização anterior a eles" do
    organization = create(:organization)
    organization.access_roles.delete_all

    PlatformTasks.backfill_access_roles

    expect(organization.reload.access_roles.pluck(:name)).to contain_exactly("Gerente", "Usuário")
  end

  it "não mexe em quem já tem grupos, nem recria o padrão apagado à mão" do
    organization = create(:organization)
    organization.access_roles.where(name: "Usuário").delete_all
    organization.access_roles.first.update_column(:permissions, { "chat" => "own" })

    PlatformTasks.backfill_access_roles

    roles = organization.reload.access_roles
    expect(roles.pluck(:name)).to eq([ "Gerente" ])
    expect(roles.first.permissions).to eq("chat" => "own")
  end
end
