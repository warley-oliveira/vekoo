require "rails_helper"

# A logo montada: símbolo + nome na fonte da marca, ao lado e em cima, em
# claro e escuro. Na escura, só a cor que some no fundo escuro troca.
RSpec.describe Logos::Lockup do
  let(:brand) { create(:brand_core, :complete) }
  let(:dark_ink) { described_class.color(brand, "textOnDark", "#ffffff") }
  let(:dark_background) { described_class.color(brand, "darkBackground", "#000000") }
  # Um disco na cor do fundo escuro da marca com um miolo no acento.
  let(:svg) do
    <<~SVG
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <path d="M100 10 A90 90 0 1 1 99.9 10 Z" fill="#{dark_background}"/>
        <path d="M100 60 A40 40 0 1 1 99.9 60 Z" fill="#E8B64C"/>
      </svg>
    SVG
  end

  it "monta os dois arranjos, cada um em claro e escuro, em PNG transparente" do
    lockups = described_class.new(brand, svg).call

    expect(lockups.keys).to eq(%w[horizontal stacked])
    lockups.each_value do |variants|
      expect(variants.keys).to eq(%w[light dark])
      variants.each_value { |png| expect(PngInspector.call(StringIO.new(png)).transparent).to be(true) }
    end
    horizontal = Vips::Image.new_from_buffer(lockups["horizontal"]["light"], "")
    stacked = Vips::Image.new_from_buffer(lockups["stacked"]["light"], "")
    expect(horizontal.width).to be > horizontal.height
    expect(stacked.height.to_f / stacked.width).to be > horizontal.height.to_f / horizontal.width
  end

  it "na variante escura, a cor que some no fundo escuro vira a de texto; o acento fica" do
    dark = described_class.dark_svg(svg, brand)

    expect(dark).to include(%(fill="#{dark_ink}")).and include(%(fill="#E8B64C"))
    expect(dark).not_to include(%(fill="#{dark_background}"))
  end

  it "marca sem nome não monta logo" do
    expect(described_class.new(create(:brand_core), svg).call).to eq({})
  end
end
