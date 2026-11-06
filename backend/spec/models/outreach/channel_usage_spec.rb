require "rails_helper"

RSpec.describe Outreach::ChannelUsage, type: :model do
  let(:channel) { "conector-1:" }
  let(:day) { "2026-11-06" }

  it "reserva até o limite" do
    expect(Array.new(4) { described_class.reserve(channel, day, 3) }).to eq([ true, true, true, false ])
    expect(described_class.used_on(channel, day)).to eq(3)
  end

  it "cada dia tem a própria conta" do
    described_class.reserve(channel, day, 1)

    expect(described_class.reserve(channel, day, 1)).to be(false)
    expect(described_class.reserve(channel, "2026-11-07", 1)).to be(true)
  end

  it "cada canal tem a própria conta" do
    described_class.reserve(channel, day, 1)

    expect(described_class.reserve("conector-2:", day, 1)).to be(true)
  end

  it "um limite menor não vê o que um maior deixou passar" do
    3.times { described_class.reserve(channel, day, 5) }

    expect(described_class.reserve(channel, day, 3)).to be(false)
    expect(described_class.reserve(channel, day, 5)).to be(true)
  end

  it "devolver abre uma vaga, sem nunca ficar negativo" do
    described_class.reserve(channel, day, 1)
    2.times { described_class.release(channel, day) }

    expect(described_class.used_on(channel, day)).to eq(0)
    expect(described_class.reserve(channel, day, 1)).to be(true)
  end

  it "sem envio nenhum, conta zero" do
    expect(described_class.used_on(channel, day)).to eq(0)
  end

  # O último lugar: dois lotes do mesmo canal chegando juntos.
  it "em paralelo, nunca passa do limite" do
    results = Array.new(12) { Thread.new { described_class.reserve(channel, day, 5) } }.map(&:value)

    expect(results.count(true)).to eq(5)
    expect(described_class.used_on(channel, day)).to eq(5)
  end

  # Duas campanhas na abertura da janela: o documento do dia não existe, os dois upserts inserem, e um
  # leva E11000 com a conta longe do limite.
  it "quem perde a corrida do primeiro envio do dia tenta de novo, em vez de dormir até amanhã" do
    collection = described_class.collection
    duplicate = Mongo::Error::OperationFailure.new("E11000 duplicate key", nil, code: 11_000)
    calls = 0
    allow(described_class).to receive(:collection).and_return(collection)
    allow(collection).to receive(:find_one_and_update).and_wrap_original do |original, *args, **options|
      calls += 1
      raise duplicate if calls == 1

      original.call(*args, **options)
    end

    expect(described_class.reserve(channel, day, 1)).to be(true)
    expect(described_class.used_on(channel, day)).to eq(1)
  end

  describe ".day_of" do
    # Todas as campanhas do canal contam o mesmo dia, qualquer que seja o fuso de cada uma.
    it "conta em um fuso só" do
      expect(described_class.day_of(Time.utc(2026, 11, 10, 1))).to eq("2026-11-09")
      expect(described_class.day_of(ActiveSupport::TimeZone["Asia/Tokyo"].local(2026, 11, 10, 9))).to eq("2026-11-09")
    end
  end

  it "some sozinha depois de uns dias" do
    described_class.reserve(channel, day, 1)

    expect(described_class.where(_id: described_class.key(channel, day)).take.expires_at).to be > 6.days.from_now
  end
end
