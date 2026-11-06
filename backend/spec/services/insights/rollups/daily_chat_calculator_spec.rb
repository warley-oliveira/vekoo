require "rails_helper"

RSpec.describe Insights::Rollups::DailyChatCalculator do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization) }
  let(:zone) { organization.reporting_zone }
  let(:today) { zone.today }
  let(:noon) { zone.local(today.year, today.month, today.day, 12) }

  def stat(on = today)
    DailyChatStat.find_by(organization_id: organization.id, day: on)
  end

  it "grava a linha do dia, com as métricas e a distribuição por hora" do
    chat = create(:chat, organization: organization, audience_type: "instagram", created_at: noon, last_message_at: noon)
    add_message(chat, kind: :inbound, at: noon)
    add_message(chat, kind: :automation, at: noon + 30.seconds)

    described_class.new(organization, today).call

    expect(stat.metrics).to include(
      "chats_started" => 1,
      "active_chats" => 1,
      "automation_chats" => 1,
      "messages_inbound" => 1,
      "messages_sent_by_automation" => 1,
      "first_response_automation_seconds_sum" => 30.0,
      "first_response_automation_count" => 1,
      "chats_by_channel" => { "instagram" => 1 }
    )
    expect(stat.hourly_breakdown).to eq("message_count" => { "12" => 2 })
  end

  it "sem data, calcula o dia de hoje no fuso da organização" do
    organization.update!(timezone: "Asia/Tokyo")
    tokyo = ActiveSupport::TimeZone["Asia/Tokyo"]

    travel_to(tokyo.local(2026, 11, 5, 1)) do
      described_class.new(organization).call

      expect(DailyChatStat.where(organization_id: organization.id).pick(:day)).to eq(Date.new(2026, 11, 5))
    end
  end

  # Às 23h em São Paulo já é o dia seguinte em UTC: a mensagem ainda é de hoje.
  it "o dia fecha no fuso da organização, não no do servidor" do
    late = zone.local(today.year, today.month, today.day, 23, 30)
    chat = create(:chat, organization: organization, created_at: late, last_message_at: late)
    add_message(chat, kind: :inbound, at: late)

    travel_to(late + 1.minute) do
      described_class.new(organization, today).call
    end

    expect(stat.metrics["messages_inbound"]).to eq(1)
  end

  it "recalcular substitui a linha, sem duplicar" do
    chat = create(:chat, organization: organization, created_at: noon, last_message_at: noon)
    add_message(chat, kind: :inbound, at: noon)
    described_class.new(organization, today).call

    add_message(chat, kind: :inbound, at: noon + 1.minute)
    described_class.new(organization, today).call

    expect(DailyChatStat.where(organization_id: organization.id, day: today).count).to eq(1)
    expect(stat.metrics["messages_inbound"]).to eq(2)
  end

  it "não mistura organizações" do
    other = create(:organization)
    chat = create(:chat, organization: other, created_at: noon, last_message_at: noon)
    add_message(chat, kind: :inbound, at: noon)

    described_class.new(organization, today).call

    expect(stat.metrics["messages_inbound"]).to eq(0)
  end
end
