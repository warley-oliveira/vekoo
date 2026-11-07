require "rails_helper"

RSpec.describe "Semente do domínio automation" do
  include ActiveJob::TestHelper

  let(:organization) { create(:organization) }
  let!(:account) { create(:account, organization: organization, email: "marina.duarte@exemplo.com.br") }

  def seed
    load Rails.root.join("db/seeds/automation.rb").to_s
  end

  before do
    connector = create(:connector_whatsapp_web, organization: organization)
    create_list(:chat, 6, connector: connector, ignore_events: true)
    create(:custom_field, organization_id: organization.id, name: "Interesse")
  end

  it "o aviso de webhook da demonstração aponta para um webhook que existe" do
    seed

    alert = organization.organization_alerts.find_by(category: "webhooks")

    expect(alert.origin_id).to eq(organization.hooks.find_by(name: "Espelho no CRM").id.to_s)
    expect(alert.display_message).to include("Espelho no CRM")
  end

  it "cria catálogo, fluxos em cada estado, histórico e webhooks com logs, sem disparar nada" do
    expect { seed }.not_to have_enqueued_job

    expect(Tool.pluck(:slug)).to include("utilidades-brasil", "contact-tags", "catalog")
    expect(organization.tool_installations.count).to eq(1)
    expect(organization.tool_functions.pluck(:name)).to include("consultar_frete", "status_do_pedido")

    flows = Flow.for_organization(organization.id)
    expect(flows.pluck(:status).uniq).to match_array(%w[published draft archived])
    expect(flows.where(status: "published").count).to be >= 5
    expect(FlowExecution.where(organization_id: organization.id).pluck(:status).uniq).to match_array(%w[completed failed waiting_for_message])
    expect(FlowExecutionLog.joins(:flow_execution).where(flow_executions: { organization_id: organization.id })).to exist

    hooks = Hook.for_organization(organization.id)
    expect(hooks.pluck(:status)).to match_array(%w[active test inactive])
    expect(hooks.find_by(status: "inactive")).to be_signature_enabled
    expect(hooks.find_by(status: "test").received_payload).to be_present
    expect(organization.hook_logs.count).to eq(90)
    expect(organization.hook_logs.pluck(:status).uniq).to include("success", "skipped")
  end

  it "usa só blocos do catálogo final, e cada fluxo publicado passa na validação" do
    seed

    Flow.for_organization(organization.id).where(status: "published").find_each do |flow|
      expect(FlowRuntime::DefinitionValidator.new(flow.published_version).issues.map(&:to_h)).to eq([])
    end
  end

  it "é idempotente, e não desfaz o que a pessoa mudou" do
    seed
    flow = Flow.find_by(organization_id: organization.id, name: "Boas-vindas da Doma")
    flow.update!(description: "Mudei")
    counts = -> { [ Flow.count, FlowVersion.count, FlowExecution.count, Hook.count, HookAction::Base.count, HookLog.count, Tool.count, ToolInstallation.count, ToolFunction::Base.count ] }
    before = counts.call

    seed

    expect(counts.call).to eq(before)
    expect(flow.reload.description).to eq("Mudei")
  end

  it "sem a conta de demonstração, só o catálogo" do
    account.destroy!

    seed

    expect(Tool.count).to be_positive
    expect(Flow.for_organization(organization.id)).not_to exist
  end
end
