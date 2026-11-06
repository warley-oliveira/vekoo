require "rails_helper"

RSpec.describe DailyChatStat do
  let(:organization) { create(:organization) }

  def stat(day, **metrics)
    create(:daily_chat_stat, organization: organization, day: Date.parse(day), metrics: metrics.stringify_keys)
  end

  it "exige a organização" do
    expect(build(:daily_chat_stat, organization: nil)).not_to be_valid
  end

  it "o banco não aceita dois registros do mesmo dia na organização" do
    stat("2026-11-01")

    expect { stat("2026-11-01") }.to raise_error(ActiveRecord::RecordNotUnique)
  end

  it "aceita o mesmo dia em outra organização" do
    stat("2026-11-01")

    expect(create(:daily_chat_stat, organization: create(:organization), day: Date.parse("2026-11-01"))).to be_persisted
  end

  it "vem em ordem de dia por padrão" do
    late = stat("2026-11-03")
    early = stat("2026-11-01")

    expect(organization.daily_chat_stats.to_a).to eq([ early, late ])
  end

  describe ".between" do
    it "inclui as duas pontas do período" do
      stat("2026-10-31")
      inside = [ stat("2026-11-01"), stat("2026-11-15"), stat("2026-11-30") ]
      stat("2026-12-01")

      expect(described_class.between(Date.parse("2026-11-01"), Date.parse("2026-11-30")).to_a).to eq(inside)
    end
  end

  describe ".sum_stat" do
    before do
      stat("2026-11-01", messages_total: 3)
      stat("2026-11-02", messages_total: 4.5)
      stat("2026-11-03", outra: 100)
    end

    it "soma a métrica guardada no jsonb" do
      expect(described_class.sum_stat("messages_total")).to eq(7.5)
    end

    it "aceita símbolo" do
      expect(described_class.sum_stat(:messages_total)).to eq(7.5)
    end

    it "encadeia com os outros filtros" do
      expect(described_class.between(Date.parse("2026-11-01"), Date.parse("2026-11-01")).sum_stat("messages_total")).to eq(3)
    end

    it "é zero para métrica que não existe" do
      expect(described_class.sum_stat("nao_existe")).to eq(0)
    end

    it "não deixa a chave escapar da consulta" do
      expect(described_class.sum_stat("x'); DROP TABLE daily_chat_stats; --")).to eq(0)
      expect(described_class.count).to eq(3)
    end
  end

  describe "#[]" do
    let(:record) { stat("2026-11-01", messages_total: 3) }

    it "lê as métricas por nome" do
      expect(record["messages_total"]).to eq(3)
      expect(record[:messages_total]).to eq(3)
    end

    it "devolve nil para métrica que não existe" do
      expect(record["nao_existe"]).to be_nil
    end

    it "continua lendo as colunas de verdade" do
      expect(record["day"]).to eq(Date.parse("2026-11-01"))
      expect(record[:organization_id]).to eq(organization.id)
    end

    it "não deixa uma métrica esconder uma coluna" do
      record = stat("2026-11-02", day: "2020-01-01")

      expect(record["day"]).to eq(Date.parse("2026-11-02"))
    end
  end

  describe "#total_tokens" do
    it "soma os tokens de entrada e saída" do
      expect(stat("2026-11-01", prompt_tokens_total: 10, completion_tokens_total: 5).total_tokens).to eq(15)
    end

    it "é zero sem as métricas" do
      expect(stat("2026-11-01").total_tokens).to eq(0)
    end
  end

  it "guarda o detalhe por hora" do
    record = create(:daily_chat_stat, organization: organization, hourly_breakdown: { "14" => { "messages" => 2 } })

    expect(record.reload.hourly_breakdown).to eq("14" => { "messages" => 2 })
  end
end
