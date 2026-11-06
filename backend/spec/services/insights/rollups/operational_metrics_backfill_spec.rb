require "rails_helper"

RSpec.describe Insights::Rollups::OperationalMetricsBackfill do
  subject(:backfill) { described_class.new(organization, range) }

  let(:organization) { create(:organization) }
  let(:zone) { organization.reporting_zone }
  let(:day) { zone.today - 30.days }
  let(:range) { zone.local((zone.today - 60.days).year, (zone.today - 60.days).month, (zone.today - 60.days).day)...day_range(zone.today, zone).last }

  def stat(on = day)
    DailyChatStat.find_by(organization_id: organization.id, day: on)
  end

  def add_chat(audience_type: "instagram", created_at: zone.local(day.year, day.month, day.day, 9))
    create(:chat, organization: organization, audience_type: audience_type, created_at: created_at, last_message_at: Time.current)
  end

  context "quando o dia já tem uma linha" do
    before do
      DailyChatStat.create!(organization: organization, day: day, metrics: { "chave_antiga" => 12_345 })
    end

    # Reusar o calculador diário sobrescreveria `metrics` inteiro.
    it "preserva as chaves que já estavam, ao acrescentar as novas" do
      add_chat

      backfill.call

      expect(stat.metrics).to include("chave_antiga" => 12_345, "chats_by_channel" => { "instagram" => 1 })
    end

    it "sobrescreve uma chave que já existia em vez de somar" do
      stat.update_columns(metrics: stat.metrics.merge("messages_sent_by_automation" => 999))
      add_message(add_chat, kind: :automation, at: zone.local(day.year, day.month, day.day, 10))

      backfill.call

      expect(stat.metrics["messages_sent_by_automation"]).to eq(1)
    end

    it "grava a distribuição por hora" do
      add_message(add_chat, kind: :inbound, at: zone.local(day.year, day.month, day.day, 10))

      backfill.call

      expect(stat.hourly_breakdown).to eq("message_count" => { "10" => 1 })
    end
  end

  context "quando o dia não tem linha" do
    it "cria a linha" do
      add_chat(audience_type: "web")

      backfill.call

      expect(stat.metrics).to include("chats_by_channel" => { "web" => 1 }, "chats_started" => 1)
      expect(stat.metrics).not_to have_key("hourly")
    end
  end

  it "grava uma linha por dia com atividade e devolve a contagem" do
    add_chat
    other = day + 5.days
    add_chat(created_at: zone.local(other.year, other.month, other.day, 9))

    result = backfill.call

    expect(result.days_written).to eq(2)
    expect(stat(day)).to be_present
    expect(stat(other)).to be_present
  end

  it "não grava nada quando não há atividade no período" do
    expect { backfill.call }.not_to change(DailyChatStat, :count)
    expect(backfill.call.days_written).to eq(0)
  end

  it "rodar de novo dá o mesmo resultado" do
    add_message(add_chat, kind: :automation, at: zone.local(day.year, day.month, day.day, 10))

    2.times { described_class.new(organization, range).call }

    expect(DailyChatStat.where(organization_id: organization.id, day: day).count).to eq(1)
    expect(stat.metrics["messages_sent_by_automation"]).to eq(1)
  end
end
