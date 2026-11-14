require "rails_helper"

# O símbolo em vetor: o vtracer de verdade (o mesmo binário da imagem de
# produção). Sem o binário na máquina, a spec fica de fora.
RSpec.describe Logos::Vectorize do
  before { skip "vtracer não instalado (VTRACER_PATH)" unless described_class.available? }

  def page(size = 900) = Vips::Image.black(size, size, bands: 3).new_from_image([ 255, 255, 255 ]).copy(interpretation: :srgb)

  def disc(center, radius, size = 900)
    xyz = Vips::Image.xyz(size, size)
    ((xyz[0] - center) ** 2 + (xyz[1] - center) ** 2) ** 0.5 < radius
  end

  def opaque(result)
    image = Logos::Lockup.raster(result.svg, 512)
    image.extract_band(3).avg / 255.0
  end

  it "tira o fundo branco e mantém o buraco do desenho" do
    xyz = Vips::Image.xyz(900, 900)
    distance = ((xyz[0] - 450) ** 2 + (xyz[1] - 450) ** 2) ** 0.5
    ring = ((distance < 300) & (distance > 220)).ifthenelse([ 61, 42, 26 ], page).cast(:uchar)

    result = described_class.new.call(ring.write_to_buffer(".png"))

    expect(result.svg).to start_with("<svg").and include("viewBox")
    expect(result.svg.scan(/fill="(#\h{6})"/).flatten.uniq).to eq([ "#3D2A1A" ])
    expect(opaque(result)).to be_within(0.06).of(0.36)
  end

  it "o ladrilho que o gerador desenha atrás do símbolo vira fundo" do
    tile = Vips::Image.black(600, 600, bands: 3).new_from_image([ 61, 42, 26 ]).copy(interpretation: :srgb)
    symbol = disc(300, 160, 600).ifthenelse([ 217, 144, 47 ], tile).cast(:uchar)
    image = page.insert(symbol, 150, 150)

    result = described_class.new.call(image.write_to_buffer(".png"))

    expect(result.svg.scan(/fill="(#\h{6})"/).flatten.uniq).to eq([ "#D9902F" ])
    expect(opaque(result)).to be_within(0.06).of(0.785)
  end

  it "imagem toda branca não vira símbolo" do
    expect { described_class.new.call(page.write_to_buffer(".png")) }.to raise_error(described_class::Failed)
  end
end
