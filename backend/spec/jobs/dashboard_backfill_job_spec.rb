require "rails_helper"

RSpec.describe DashboardBackfillJob do
  let!(:organization) { create(:organization) }
  let(:zone) { organization.reporting_zone }
  let(:today) { zone.today }

  def active_chat(target = organization, at: Time.current)
    create(:chat, organization: target, last_message_at: at)
  end

  def days_written(target = organization)
    DailyChatStat.where(organization_id: target.id).pluck(:day)
  end

  it "fica na fila que pode esperar, e sem nova tentativa" do
    expect(described_class.new.queue_name).to eq("low")
    expect(described_class.get_sidekiq_options["retry"]).to be(false)
  end

  it "por padrão, recalcula só o dia corrente" do
    active_chat

    described_class.perform_now

    expect(days_written).to eq([ today ])
  end

  it "no modo daily, recalcula só o dia anterior" do
    active_chat

    described_class.perform_now("daily")

    expect(days_written).to eq([ today - 1.day ])
  end

  it "no modo both, recalcula os dois" do
    active_chat

    described_class.perform_now("both")

    expect(days_written).to contain_exactly(today - 1.day, today)
  end

  it "pula a organização sem conversa ativa no dia" do
    other = create(:organization)
    active_chat(other, at: 3.days.ago)
    active_chat

    described_class.perform_now

    expect(days_written).to eq([ today ])
    expect(days_written(other)).to be_empty
  end

  it "usa o dia do fuso de cada organização" do
    tokyo = create(:organization, timezone: "Asia/Tokyo")
    active_chat(tokyo)

    described_class.perform_now

    expect(days_written(tokyo)).to eq([ ActiveSupport::TimeZone["Asia/Tokyo"].today ])
  end

  it "a falha de uma organização não aborta o lote" do
    other = create(:organization)
    active_chat
    active_chat(other)
    allow(Insights::Rollups::DailyChatCalculator).to receive(:new).and_call_original
    allow(Insights::Rollups::DailyChatCalculator).to receive(:new).with(have_attributes(id: organization.id), anything).and_raise("o Mongo caiu")
    allow(Rails.logger).to receive(:error)

    described_class.perform_now

    expect(days_written(other)).to eq([ other.reporting_zone.today ])
    expect(Rails.logger).to have_received(:error).with(/o Mongo caiu/)
  end
end
