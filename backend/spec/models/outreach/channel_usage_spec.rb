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

  it "some sozinha depois de uns dias" do
    described_class.reserve(channel, day, 1)

    expect(described_class.where(_id: described_class.key(channel, day)).take.expires_at).to be > 6.days.from_now
  end
end
