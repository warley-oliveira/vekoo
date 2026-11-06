require "rails_helper"

RSpec.describe Pipelines::BoardPeriodMetrics do
  include ActiveSupport::Testing::TimeHelpers

  let(:organization) { create(:organization, timezone: "America/Sao_Paulo") }
  let(:board) { create(:pipeline_board, :crm, organization: organization) }
  let!(:first) { create(:pipeline_stage, board: board, name: "Novos") }
  let!(:second) { create(:pipeline_stage, board: board, name: "Proposta") }
  let!(:third) { create(:pipeline_stage, board: board, name: "Fechamento") }
  let(:today) { Date.new(2026, 11, 20) }

  around do |example|
    Time.use_zone("America/Sao_Paulo") do
      travel_to(today.in_time_zone.change(hour: 12)) { example.run }
    end
  end

  def compute(from: today - 9, to: today, cards: board.cards)
    described_class.call(board, from: from, to: to, cards: cards)
  end

  def card_at(stage, created_at:, **attributes)
    create(:pipeline_card, stage: stage, **attributes).tap do |card|
      card.update_columns(created_at: created_at, stage_entered_at: created_at)
    end
  end

  def moved(card, from:, to:, at:)
    Pipelines::CardActivity.create!(
      card: card, action: "moved", details: { from_stage_id: from.id, to_stage_id: to.id }, created_at: at
    )
    card.update_columns(stage_id: to.id, stage_entered_at: at)
  end

  describe "resumo" do
    it "conta o que aconteceu no período e no período anterior, do mesmo tamanho" do
      card_at(first, created_at: 2.days.ago)
      card_at(first, created_at: 15.days.ago)
      card_at(second, created_at: 30.days.ago, deal_value: 500, won_at: 2.days.ago)
      card_at(second, created_at: 30.days.ago, deal_value: 300, lost_at: 3.days.ago)
      card_at(second, created_at: 30.days.ago, deal_value: 900, won_at: 15.days.ago)

      result = compute

      expect(result).to include(from: "2026-11-11", to: "2026-11-20", previousFrom: "2026-11-01", previousTo: "2026-11-10")
      expect(result[:summary]).to include(createdCount: 1, wonCount: 1, wonValue: 500.0, lostCount: 1, lostValue: 300.0, conversionRate: 50.0)
      expect(result[:previous]).to include(createdCount: 1, wonCount: 1, wonValue: 900.0, lostCount: 0, conversionRate: 100.0)
    end

    it "não inventa uma taxa quando nada fechou" do
      expect(compute[:summary][:conversionRate]).to be_nil
    end
  end

  describe "série" do
    it "tem um ponto por dia, sem buracos, no fuso da organização" do
      # 01:30 UTC do dia 16 ainda é a noite do dia 15 em São Paulo.
      card_at(first, created_at: Time.utc(2026, 11, 16, 1, 30), deal_value: 200, won_at: Time.utc(2026, 11, 16, 1, 30))

      series = compute[:series]

      expect(series.size).to eq(10)
      expect(series.first[:date]).to eq("2026-11-11")
      expect(series.find { |point| point[:date] == "2026-11-15" }).to include(createdCount: 1, wonCount: 1, wonValue: 200.0)
      expect(series.find { |point| point[:date] == "2026-11-16" }).to include(createdCount: 0, wonCount: 0)
    end

    it "agrupa por semana e por mês quando o período cresce" do
      card_at(first, created_at: 3.days.ago)

      weekly = compute(from: today - 59)
      monthly = compute(from: today - 299)

      expect(weekly[:bucket]).to eq("week")
      expect(weekly[:series].sum { |point| point[:createdCount] }).to eq(1)
      expect(Date.iso8601(weekly[:series].first[:date]).wday).to eq(1)
      expect(monthly[:bucket]).to eq("month")
      expect(monthly[:series].last[:date]).to eq("2026-11-01")
      expect(monthly[:series].sum { |point| point[:createdCount] }).to eq(1)
    end
  end

  describe "conversão entre etapas" do
    it "conta até onde chegaram os cards criados no período" do
      advanced = card_at(first, created_at: 5.days.ago)
      moved(advanced, from: first, to: second, at: 4.days.ago)
      moved(advanced, from: second, to: third, at: 3.days.ago)
      returned = card_at(first, created_at: 5.days.ago)
      moved(returned, from: first, to: second, at: 4.days.ago)
      moved(returned, from: second, to: first, at: 3.days.ago)
      card_at(first, created_at: 2.days.ago)
      card_at(third, created_at: 1.day.ago, won_at: Time.current)
      card_at(third, created_at: 90.days.ago)

      conversion = compute[:stageConversion]

      expect(conversion[:cohort]).to eq(4)
      expect(conversion[:won]).to eq(1)
      expect(conversion[:stages].map { |stage| [ stage[:stageName], stage[:reached] ] }).to eq(
        [ [ "Novos", 4 ], [ "Proposta", 3 ], [ "Fechamento", 2 ] ]
      )
    end
  end

  describe "tempo por etapa" do
    it "mede as passagens que terminaram no período e as que seguem em aberto" do
      card = card_at(first, created_at: 10.hours.ago)
      moved(card, from: first, to: second, at: 4.hours.ago)

      times = compute[:avgTimePerStage].to_h { |item| [ item[:stageName], item.slice(:avgHours, :passages) ] }

      expect(times["Novos"]).to eq(avgHours: 6.0, passages: 1)
      expect(times["Proposta"]).to eq(avgHours: 4.0, passages: 1)
      expect(times["Fechamento"]).to eq(avgHours: nil, passages: 0)
    end

    it "em período que já acabou, deixa de fora o que ainda está em aberto" do
      old = card_at(first, created_at: 40.days.ago)
      moved(old, from: first, to: second, at: 38.days.ago)

      times = compute(from: today - 45, to: today - 30)[:avgTimePerStage].to_h { |item| [ item[:stageName], item[:passages] ] }

      expect(times["Novos"]).to eq(1)
      expect(times["Proposta"]).to eq(0)
    end
  end

  describe "ranking" do
    it "ordena pelo valor ganho no período e ignora card sem responsável" do
      ana = create(:account, organization: organization, name: "Ana")
      bia = create(:account, organization: organization, name: "Bia")
      card_at(second, created_at: 30.days.ago, assigned_to: ana, deal_value: 100, won_at: 1.day.ago)
      card_at(second, created_at: 30.days.ago, assigned_to: ana, deal_value: 100, lost_at: 1.day.ago)
      card_at(second, created_at: 30.days.ago, assigned_to: bia, deal_value: 900, won_at: 2.days.ago)
      card_at(second, created_at: 30.days.ago, assigned_to: bia, deal_value: 5000, won_at: 90.days.ago)
      card_at(second, created_at: 30.days.ago, deal_value: 7000, won_at: 1.day.ago)

      ranking = compute[:ranking]

      expect(ranking.map { |entry| entry[:user][:name] }).to eq(%w[Bia Ana])
      expect(ranking.first).to include(wonCount: 1, wonValue: 900.0, lostCount: 0, conversionRate: 100.0)
      expect(ranking.last).to include(wonCount: 1, wonValue: 100.0, lostCount: 1, conversionRate: 50.0)
    end
  end

  it "conta só os cards que recebe" do
    mine = card_at(first, created_at: 2.days.ago)
    card_at(first, created_at: 2.days.ago)

    result = compute(cards: board.cards.where(id: mine.id))

    expect(result[:summary][:createdCount]).to eq(1)
    expect(result[:stageConversion][:cohort]).to eq(1)
  end
end
