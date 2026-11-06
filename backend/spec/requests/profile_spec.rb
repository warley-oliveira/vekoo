require "rails_helper"

RSpec.describe "Perfil", type: :request do
  let(:account) { create(:account, name: "Marina Duarte", password: "carrossel123") }
  let(:headers) { auth_headers(account) }

  def png = fixture_file_upload("foto.png", "image/png")

  it "exige sessão em todas as rotas" do
    get "/profile"
    expect(response).to have_http_status(:unauthorized)

    patch "/profile", params: { name: "X" }, as: :json
    expect(response).to have_http_status(:unauthorized)

    post "/profile/avatar", params: { file: png }
    expect(response).to have_http_status(:unauthorized)

    delete "/profile/avatar"
    expect(response).to have_http_status(:unauthorized)
  end

  describe "GET /profile" do
    it "devolve a conta de quem está logado" do
      get "/profile", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json).to include("id" => account.id, "email" => account.email, "locale" => nil, "avatarUrl" => nil)
      expect(json["permissions"]).to be_a(Hash)
    end
  end

  describe "PATCH /profile" do
    it "edita nome, telefone e idioma" do
      patch "/profile", params: { name: "Marina D.", phone: "5511987654321", locale: "en" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("name" => "Marina D.", "phone" => "5511987654321", "locale" => "en")
    end

    it "funciona para quem não tem permissão nenhuma de administração" do
      member = create(:account, organization: account.organization, role: "member")

      patch "/profile", params: { name: "Outro Nome" }, headers: auth_headers(member), as: :json

      expect(response).to have_http_status(:ok)
      expect(member.reload.name).to eq("Outro Nome")
    end

    it "não muda e-mail, papel nem grupo por aqui" do
      member = create(:account, organization: account.organization, role: "member", email: "camila@exemplo.com.br")
      role = account.organization.access_roles.find_by!(name: "Gerente")

      patch "/profile",
        params: { email: "outro@exemplo.com.br", role: "owner", accessRoleId: role.id },
        headers: auth_headers(member), as: :json

      member.reload
      expect(member.email).to eq("camila@exemplo.com.br")
      expect(member).not_to be_owner
      expect(member.access_role_id).to be_nil
    end

    it "responde 422 com os campos inválidos" do
      patch "/profile", params: { name: "" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
    end

    it "recusa idioma que o produto não fala" do
      patch "/profile", params: { locale: "fr" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("locale")
    end

    it "limpa telefone e idioma com vazio" do
      account.update!(phone: "5511987654321", locale: "en")

      patch "/profile", params: { phone: "", locale: "" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("phone" => nil, "locale" => nil)
    end

    describe "senha" do
      it "troca com a senha atual certa e derruba só as outras sessões" do
        other_session = Session.start!(account)
        current = headers

        patch "/profile",
          params: { currentPassword: "carrossel123", password: "nova-senha-boa", passwordConfirmation: "nova-senha-boa" },
          headers: current, as: :json

        expect(response).to have_http_status(:ok)
        expect(account.reload.authenticate("nova-senha-boa")).to be_truthy
        expect(Session.authenticate(other_session.token)).to be_nil

        get "/profile", headers: current
        expect(response).to have_http_status(:ok)
      end

      it "aceita sem a confirmação" do
        patch "/profile", params: { currentPassword: "carrossel123", password: "nova-senha-boa" }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
      end

      it "exige a senha atual" do
        patch "/profile", params: { password: "nova-senha-boa" }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("wrongPassword")
        expect(json.dig("error", "field")).to eq("currentPassword")
        expect(account.reload.authenticate("carrossel123")).to be_truthy
      end

      it "recusa a senha atual errada, sem gravar mais nada do pedido" do
        patch "/profile",
          params: { name: "Outro Nome", currentPassword: "errada", password: "nova-senha-boa" },
          headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "code")).to eq("wrongPassword")
        expect(account.reload.name).to eq("Marina Duarte")
      end

      it "recusa confirmação diferente" do
        patch "/profile",
          params: { currentPassword: "carrossel123", password: "nova-senha-boa", passwordConfirmation: "outra" },
          headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "field")).to eq("passwordConfirmation")
      end

      it "recusa senha curta" do
        patch "/profile", params: { currentPassword: "carrossel123", password: "curta" }, headers: headers, as: :json

        expect(response).to have_http_status(:unprocessable_content)
        expect(json.dig("error", "field")).to eq("password")
      end

      it "ignora senha em branco" do
        patch "/profile", params: { name: "Outro Nome", password: "" }, headers: headers, as: :json

        expect(response).to have_http_status(:ok)
        expect(account.reload.authenticate("carrossel123")).to be_truthy
      end
    end
  end

  describe "POST /profile/avatar" do
    it "guarda a foto e devolve a conta com o avatar, também em /me" do
      post "/profile/avatar", params: { file: png }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(account.reload.avatar).to be_attached
      expect(json["avatarUrl"]).to start_with("/rails/active_storage/representations/proxy/")

      get "/me", headers: headers
      expect(json.dig("account", "avatarUrl")).to start_with("/rails/active_storage/representations/proxy/")
    end

    it "serve a foto de verdade pela rota do avatar" do
      post "/profile/avatar", params: { file: png }, headers: headers

      get json["avatarUrl"]

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("image/jpeg")
    end

    it "troca a foto anterior" do
      account.avatar.attach(png)
      blob = account.avatar.blob

      post "/profile/avatar", params: { file: png }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(account.reload.avatar.blob).not_to eq(blob)
    end

    it "responde 400 sem arquivo" do
      post "/profile/avatar", headers: headers

      expect(response).to have_http_status(:bad_request)
      expect(json.dig("error", "code")).to eq("parameterMissing")
    end

    it "recusa o que não é imagem, apontando o campo" do
      post "/profile/avatar", params: { file: fixture_file_upload("documento.txt", "text/plain") }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("file")
      expect(account.reload.avatar).not_to be_attached
    end

    # O navegador diz o que quiser: quem manda é o conteúdo do arquivo.
    it "recusa texto que se declara imagem" do
      post "/profile/avatar", params: { file: fixture_file_upload("documento.txt", "image/png") }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("file")
      expect(account.reload.avatar).not_to be_attached
    end

    it "recusa arquivo acima de 2 MB" do
      stub_const("ImageUploadable::IMAGE_MAX_BYTES", 10)

      post "/profile/avatar", params: { file: png }, headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "message")).to include("2 MB")
      expect(account.reload.avatar).not_to be_attached
    end
  end

  describe "DELETE /profile/avatar" do
    it "tira a foto" do
      account.avatar.attach(png)

      delete "/profile/avatar", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["avatarUrl"]).to be_nil
      expect(account.reload.avatar).not_to be_attached
    end

    it "não reclama se não houver foto" do
      delete "/profile/avatar", headers: headers

      expect(response).to have_http_status(:ok)
    end
  end
end
