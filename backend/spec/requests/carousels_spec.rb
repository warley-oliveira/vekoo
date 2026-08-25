require "rails_helper"

RSpec.describe "Carrosséis", type: :request do
  let(:account) { create(:account) }
  let(:organization) { account.organization }
  let(:headers) { auth_headers(account) }

  describe "GET /carousels" do
    it "lista os ativos, do mais recente para o mais antigo, em resumo" do
      antigo = create(:carousel, organization: organization, edited_at: 3.days.ago, title: "Antigo")
      novo = create(:carousel, organization: organization, edited_at: 1.hour.ago, title: "Novo")
      create(:carousel, :trashed, organization: organization)

      get "/carousels", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["carousels"].map { |c| c["id"] }).to eq([ novo.id, antigo.id ])
      # Resumo: a grade desenha o card 1, não o documento inteiro.
      expect(json["carousels"].first["cards"].length).to eq(1)
      expect(json["carousels"].first["cardCount"]).to eq(1)
    end

    it "lista a lixeira quando pedida" do
      create(:carousel, organization: organization)
      lixo = create(:carousel, :trashed, organization: organization)

      get "/carousels", params: { trashed: true }, headers: headers

      expect(json["carousels"].map { |c| c["id"] }).to eq([ lixo.id ])
    end

    it "filtra por favorito, por pasta e por busca no título" do
      pasta = create(:folder, organization: organization)
      alvo = create(:carousel, :favorite, organization: organization, folder: pasta, title: "Bolo caseiro")
      create(:carousel, organization: organization, title: "Outra coisa")

      get "/carousels", params: { favorite: true, folder_id: pasta.id, q: "bolo" }, headers: headers

      expect(json["carousels"].map { |c| c["id"] }).to eq([ alvo.id ])
    end

    it "não mistura o trabalho de outra organização" do
      create(:carousel)

      get "/carousels", headers: headers

      expect(json["carousels"]).to be_empty
    end
  end

  describe "GET /carousels/:id" do
    it "devolve o documento inteiro" do
      carousel = create(:carousel, organization: organization)

      get "/carousels/#{carousel.id}", headers: headers

      expect(json["cards"].first["blocks"].first).to include("type" => "text", "role" => "title")
      expect(json["theme"]).to include("accentInk")
    end

    it "responde 404 para carrossel de outra organização" do
      get "/carousels/#{create(:carousel).id}", headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /carousels" do
    it "cria com o tema do catálogo quando nenhum é enviado" do
      ThemePreset.create!(key: "paper", position: 0, theme: {
        "bg" => "a", "surface" => "b", "ink" => "c", "accent" => "d", "accentInk" => "e"
      })

      post "/carousels", params: { carousel: { title: "Novo carrossel" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["theme"]["bg"]).to eq("a")
      expect(json["cards"]).to eq([])
      expect(json["editedAt"]).to be_present
    end

    it "recusa formato que o produto não desenha" do
      post "/carousels", params: { carousel: { title: "X", format: "9:16" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["details"]).to have_key("format")
    end

    it "recusa tema incompleto — faltando tinta o card renderiza com buraco" do
      post "/carousels",
        params: { carousel: { title: "X", theme: { "bg" => "oklch(0.9 0 0)" } } },
        headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["details"]).to have_key("theme")
    end
  end

  describe "PATCH /carousels/:id" do
    let(:carousel) { create(:carousel, organization: organization, edited_at: 2.days.ago) }

    it "salva o documento inteiro e carimba a edição" do
      cards = [ {
        "id" => "card-1", "layout" => "no-image", "bg" => nil, "align" => "center", "image" => nil,
        "blocks" => [ {
          "id" => "card-1-b1", "type" => "quote",
          "spans" => [ { "text" => "Bolo caseiro não compete com bolo de esquina.", "bold" => true } ],
          "color" => "ink"
        } ]
      } ]

      patch "/carousels/#{carousel.id}",
        params: { carousel: { title: "Novo título", cards: cards } },
        headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["title"]).to eq("Novo título")
      expect(json["cards"]).to eq(cards)
      expect(json["editedAt"]).to be > (2.days.ago.to_f * 1000)
    end

    it "favoritar e mover de pasta não conta como edição do documento" do
      pasta = create(:folder, organization: organization)
      antes = carousel.edited_at

      patch "/carousels/#{carousel.id}",
        params: { carousel: { favorite: true, folderId: pasta.id } },
        headers: headers, as: :json

      expect(json["favorite"]).to be(true)
      expect(json["folderId"]).to eq(pasta.id)
      expect(carousel.reload.edited_at.to_i).to eq(antes.to_i)
    end
  end

  describe "lixeira" do
    let!(:carousel) { create(:carousel, organization: organization) }

    it "apagar manda para a lixeira, restaurar traz de volta" do
      delete "/carousels/#{carousel.id}", headers: headers
      expect(json["trashedAt"]).to be_present
      expect(carousel.reload).to be_trashed

      post "/carousels/#{carousel.id}/restore", headers: headers
      expect(json["trashedAt"]).to be_nil
    end

    it "apagar de vez remove o registro" do
      delete "/carousels/#{carousel.id}/permanent", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(Carousel.exists?(carousel.id)).to be(false)
    end

    it "esvaziar a lixeira leva só o que está nela" do
      create(:carousel, :trashed, organization: organization)
      create(:carousel, :trashed, organization: organization)

      delete "/trash", headers: headers

      expect(json["deleted"]).to eq(2)
      expect(organization.carousels.count).to eq(1)
    end
  end

  describe "POST /carousels/:id/duplicate" do
    it "copia o documento, sem herdar favorito nem lixeira" do
      original = create(:carousel, :favorite, organization: organization, title: "Bolo caseiro")

      expect {
        post "/carousels/#{original.id}/duplicate", headers: headers
      }.to change(Carousel, :count).by(1)

      expect(response).to have_http_status(:created)
      expect(json["title"]).to eq("Bolo caseiro (cópia)")
      expect(json["cards"]).to eq(original.cards)
      expect(json["favorite"]).to be(false)
      expect(json["trashedAt"]).to be_nil
    end

    it "usa o idioma da requisição no nome da cópia" do
      original = create(:carousel, organization: organization, title: "Bolo caseiro")

      post "/carousels/#{original.id}/duplicate?locale=en", headers: headers

      expect(json["title"]).to eq("Bolo caseiro (copy)")
    end
  end
end
