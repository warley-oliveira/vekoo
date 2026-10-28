require "rails_helper"

RSpec.describe "Layouts", type: :request do
  let(:account) { create(:account) }
  let(:headers) { auth_headers(account) }

  it "devolve os contratos no idioma da requisição, filtrando por formato" do
    get "/layouts", headers: headers.merge("Accept-Language" => "en"), params: { format: "carousel" }

    expect(response).to have_http_status(:ok)
    expect(json["formats"]["story"]).to eq("width" => 1080, "height" => 1920)
    cover = json["layouts"].find { |layout| layout["id"] == "carousel-cover" }
    expect(cover).to include("name" => "Carousel cover", "position" => "first", "formats" => [ "carousel" ])
    expect(cover["slots"].find { |slot| slot["id"] == "title" }).to include("type" => "text", "required" => true, "maxChars" => 60)
    expect(json["layouts"].map { |layout| layout["id"] }).to include("text-only-solid")
  end

  it "exige sessão" do
    get "/layouts"
    expect(response).to have_http_status(:unauthorized)
  end
end
