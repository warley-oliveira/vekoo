require "rails_helper"

# Id de outra organização no corpo da requisição.
RSpec.describe "Referência a registro de outra organização", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  let(:headers) { auth_headers(owner) }
  let(:foreign_folder) { create(:folder, organization: create(:organization)) }

  # Apagar a pasta de lá soltaria o carrossel daqui, e a resposta confirmaria que o id existe.
  describe "pasta de um carrossel" do
    let(:carousel) { create(:carousel, organization: organization) }

    it "não cria dentro da pasta de outra organização" do
      post "/carousels", params: { carousel: { title: "Novo", format: Carousel::FORMATS.first, folderId: foreign_folder.id } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json.dig("error", "field")).to eq("folderId")
    end

    it "não move para a pasta de outra organização" do
      patch "/carousels/#{carousel.id}", params: { carousel: { folderId: foreign_folder.id } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
      expect(carousel.reload.folder_id).to be_nil
    end

    it "move para a própria pasta e tira da pasta" do
      own = create(:folder, organization: organization)

      patch "/carousels/#{carousel.id}", params: { carousel: { folderId: own.id } }, headers: headers, as: :json
      expect(response).to have_http_status(:ok)

      patch "/carousels/#{carousel.id}", params: { carousel: { folderId: nil } }, headers: headers, as: :json
      expect(response).to have_http_status(:ok)
      expect(carousel.reload.folder_id).to be_nil
    end
  end
end
