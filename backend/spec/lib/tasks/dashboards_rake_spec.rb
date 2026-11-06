require "rails_helper"
require "rake"

RSpec.describe "dashboards:backfill_operational" do
  before(:all) { load Rails.root.join("lib/tasks/dashboards.rake") }

  let(:organization) { create(:organization) }
  let(:zone) { organization.reporting_zone }
  let(:day) { zone.today - 10.days }
  let(:output) { StringIO.new }

  def task(**options)
    DashboardTasks::OperationalBackfill.new(io: output, pause: 0, **options)
  end

  def active_chat(target)
    at = zone.local(day.year, day.month, day.day, 10)
    create(:chat, organization: target, created_at: at, last_message_at: Time.current).tap { |chat| add_message(chat, kind: :inbound, at: at) }
  end

  it "preenche os dias passados de uma organização" do
    active_chat(organization)
    active_chat(create(:organization))

    task(days: 30, organization_id: organization.id).call

    expect(DailyChatStat.pluck(:organization_id, :day)).to eq([ [ organization.id, day ] ])
    expect(DailyChatStat.first.metrics).to include("messages_inbound" => 1)
    expect(output.string).to include("1 dia(s) com atividade gravados")
  end

  it "sem organização, passa por todas" do
    other = create(:organization)
    active_chat(organization)
    active_chat(other)

    task(days: 30).call

    expect(DailyChatStat.pluck(:organization_id)).to contain_exactly(organization.id, other.id)
  end

  it "fora do período escolhido, não grava" do
    active_chat(organization)

    task(days: 5, organization_id: organization.id).call

    expect(DailyChatStat.count).to eq(0)
  end

  it "a falha de uma organização não aborta as outras" do
    other = create(:organization)
    active_chat(other)
    allow(Insights::Rollups::OperationalMetricsBackfill).to receive(:new).and_call_original
    allow(Insights::Rollups::OperationalMetricsBackfill).to receive(:new).with(have_attributes(id: organization.id), anything).and_raise("o Mongo caiu")

    task(days: 30).call

    expect(DailyChatStat.pluck(:organization_id)).to eq([ other.id ])
    expect(output.string).to include("FALHA #{organization.id}", "organizações com falha=1")
  end
end
