require "rails_helper"

RSpec.describe "Catálogo", type: :request do
  it "serve o acervo da ferramenta sem exigir sessão" do
    ThemePreset.create!(key: "paper", position: 0, theme: { "bg" => "a", "surface" => "b", "ink" => "c", "accent" => "d", "accentInk" => "e" })
    LibraryImage.create!(key: "amanhecer", base: "oklch(0.88 0.09 70)", position: 0, layers: [ { "color" => "x", "x" => 25, "y" => 20, "size" => 70 } ])
    PaletteColor.create!(group: "folder", key: "violeta", value: "oklch(0.62 0.12 292)", position: 0)
    PaletteColor.create!(group: "accent", value: "oklch(0.5 0.2 292)", position: 0)
    PaletteColor.create!(group: "extended", value: "oklch(0.97 0.005 285)", position: 0)

    get "/catalog"

    expect(response).to have_http_status(:ok)
    expect(json["formats"]).to eq([ { "id" => "4:5", "ratio" => 0.8 }, { "id" => "1:1", "ratio" => 1.0 } ])
    expect(json["themePresets"].first["id"]).to eq("paper")
    expect(json["imageLibrary"].first["layers"].first["size"]).to eq(70)
    expect(json["folderColors"]).to eq([ { "id" => "violeta", "value" => "oklch(0.62 0.12 292)" } ])
    expect(json["accentChoices"]).to eq([ "oklch(0.5 0.2 292)" ])
    expect(json["extendedPalette"]).to eq([ "oklch(0.97 0.005 285)" ])
    expect(json["aiCosts"]).to include("carousel" => 5, "rewrite" => 1)
  end
end
