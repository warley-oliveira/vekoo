require "rails_helper"

RSpec.describe "Organização", type: :request do
  let(:organization) { create(:organization, name: "Marina Duarte Conteúdo") }
  let(:owner) { create(:account, organization: organization, role: "owner") }
  # Sem grupo: valem os padrões de membro, com `chat` e sem `core_settings`.
  let(:attendant) { create(:account, organization: organization, role: "member") }
  let(:outsider_role) { create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS) }
  let(:no_chat) { create(:account, organization: organization, role: "member", access_role: outsider_role) }

  def png = fixture_file_upload("foto.png", "image/png")

  it "exige sessão em todas as rotas" do
    get "/organization"
    expect(response).to have_http_status(:unauthorized)

    patch "/organization", params: { name: "X" }, as: :json
    expect(response).to have_http_status(:unauthorized)

    patch "/organization/chat-settings", params: {}, as: :json
    expect(response).to have_http_status(:unauthorized)

    post "/organization/logo", params: { file: png }
    expect(response).to have_http_status(:unauthorized)

    delete "/organization/logo"
    expect(response).to have_http_status(:unauthorized)
  end

  describe "GET /organization" do
    it "mostra a organização da sessão a qualquer pessoa dela" do
      get "/organization", headers: auth_headers(no_chat)

      expect(response).to have_http_status(:ok)
      expect(json).to include(
        "id" => organization.id,
        "name" => "Marina Duarte Conteúdo",
        "timezone" => "America/Sao_Paulo",
        "plan" => "free",
        "logoUrl" => nil
      )
      expect(json["settings"]).to eq(
        "companyInfo" => {
          "businessName" => nil, "cnpj" => nil, "formattedCnpj" => nil,
          "companyName" => "Marina Duarte Conteúdo", "validCnpj" => false
        },
        "chatSettings" => { "autoRemoveWaitingOperatorTag" => false, "reopenConversationOnInboundEnabled" => false }
      )
    end

    # Não há id na URL: a organização vem da sessão, e a de outra pessoa é inalcançável.
    it "só alcança a organização de quem pergunta" do
      other_owner = create(:account, organization: create(:organization), role: "owner")

      get "/organization", headers: auth_headers(other_owner)

      expect(json["id"]).to eq(other_owner.organization_id)
    end
  end

  describe "PATCH /organization" do
    it "edita nome, fuso e dados da empresa" do
      patch "/organization",
        params: {
          name: "Marina Conteúdo",
          timezone: "America/Manaus",
          settings: { companyInfo: { businessName: "Marina Duarte Conteúdo Ltda", cnpj: "11.222.333/0001-81" } }
        },
        headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("name" => "Marina Conteúdo", "timezone" => "America/Manaus")
      expect(json.dig("settings", "companyInfo")).to eq(
        "businessName" => "Marina Duarte Conteúdo Ltda",
        "cnpj" => "11.222.333/0001-81",
        "formattedCnpj" => "11.222.333/0001-81",
        "companyName" => "Marina Duarte Conteúdo Ltda",
        "validCnpj" => true
      )
    end

    it "formata o CNPJ que vem só com dígitos" do
      patch "/organization", params: { settings: { companyInfo: { cnpj: "11222333000181" } } }, headers: auth_headers(owner), as: :json

      expect(json.dig("settings", "companyInfo", "formattedCnpj")).to eq("11.222.333/0001-81")
    end

    it "mescla: mandar um campo não apaga os outros" do
      organization.update_with_settings!(
        company_info: { business_name: "Razão Social", cnpj: "11222333000181" },
        chat_settings: { auto_remove_waiting_operator_tag: true }
      )

      patch "/organization",
        params: { settings: { companyInfo: { businessName: "Outra Razão" }, chatSettings: { reopenConversationOnInboundEnabled: true } } },
        headers: auth_headers(owner), as: :json

      expect(json.dig("settings", "companyInfo")).to include("businessName" => "Outra Razão", "cnpj" => "11222333000181")
      expect(json.dig("settings", "chatSettings")).to eq(
        "autoRemoveWaitingOperatorTag" => true, "reopenConversationOnInboundEnabled" => true
      )
    end

    it "mexe só no nome, sem tocar em settings" do
      organization.update_with_settings!(company_info: { business_name: "Razão Social" })

      patch "/organization", params: { name: "Novo Nome" }, headers: auth_headers(owner), as: :json

      expect(json["name"]).to eq("Novo Nome")
      expect(json.dig("settings", "companyInfo", "businessName")).to eq("Razão Social")
    end

    # `features` é só leitura: o que está ligado não se decide pela API.
    it "ignora features, plano e créditos" do
      organization.update!(features: { "campaigns_enabled" => false })

      patch "/organization",
        params: { features: { campaigns_enabled: true }, plan: "pro", creditsTotal: 9999 },
        headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:ok)
      organization.reload
      expect(organization.features).to eq("campaigns_enabled" => false)
      expect(organization.plan).to eq("free")
      expect(organization.credits_total).to eq(50)
    end

    it "exige core_settings" do
      patch "/organization", params: { name: "Invadido" }, headers: auth_headers(attendant), as: :json

      expect(response).to have_http_status(:forbidden)
      expect(organization.reload.name).to eq("Marina Duarte Conteúdo")
    end

    it "responde 422 com nome inválido" do
      patch "/organization", params: { name: "" }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("name")
    end

    it "responde 422 com fuso que não existe" do
      patch "/organization", params: { timezone: "America/Atlantida" }, headers: auth_headers(owner), as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("timezone")
      expect(organization.reload.timezone).to eq("America/Sao_Paulo")
    end

    it "responde 422 com CNPJ incompleto e deixa limpar com vazio" do
      patch "/organization", params: { settings: { companyInfo: { cnpj: "1234" } } }, headers: auth_headers(owner), as: :json
      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("cnpj")

      organization.update_with_settings!(company_info: { cnpj: "11222333000181" })

      patch "/organization", params: { settings: { companyInfo: { cnpj: "" } } }, headers: auth_headers(owner), as: :json
      expect(response).to have_http_status(:ok)
      expect(json.dig("settings", "companyInfo", "cnpj")).to be_nil
    end
  end

  describe "PATCH /organization/chat-settings" do
    # Da origem: as preferências ficam na tela do chat, ao alcance de quem atende.
    it "deixa quem atende mudar, sem core_settings" do
      patch "/organization/chat-settings", params: { autoRemoveWaitingOperatorTag: true }, headers: auth_headers(attendant), as: :json

      expect(response).to have_http_status(:ok)
      expect(json.dig("settings", "chatSettings", "autoRemoveWaitingOperatorTag")).to be(true)
    end

    it "exige a permissão de chat" do
      patch "/organization/chat-settings", params: { autoRemoveWaitingOperatorTag: true }, headers: auth_headers(no_chat), as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it "salva uma preferência sem apagar a outra" do
      organization.update_with_settings!(chat_settings: { auto_remove_waiting_operator_tag: true })

      patch "/organization/chat-settings", params: { reopenConversationOnInboundEnabled: true }, headers: auth_headers(attendant), as: :json

      expect(json.dig("settings", "chatSettings")).to eq(
        "autoRemoveWaitingOperatorTag" => true, "reopenConversationOnInboundEnabled" => true
      )
    end

    it "não muda mais nada por aqui" do
      patch "/organization/chat-settings", params: { name: "Invadido", timezone: "UTC" }, headers: auth_headers(attendant), as: :json

      expect(organization.reload.name).to eq("Marina Duarte Conteúdo")
      expect(organization.timezone).to eq("America/Sao_Paulo")
    end

    # O flag é lido com cache no caminho de toda mensagem recebida.
    it "faz o flag de reabertura valer na hora, sem esperar o cache" do
      expect(Organization.reopen_on_inbound_enabled?(organization.id)).to be(false)

      patch "/organization/chat-settings", params: { reopenConversationOnInboundEnabled: true }, headers: auth_headers(attendant), as: :json

      expect(Organization.reopen_on_inbound_enabled?(organization.id)).to be(true)
    end
  end

  describe "POST /organization/logo" do
    it "guarda o logo e o devolve também em /me" do
      post "/organization/logo", params: { file: png }, headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(organization.reload.logo).to be_attached
      expect(json["logoUrl"]).to start_with("/rails/active_storage/representations/proxy/")

      get "/me", headers: auth_headers(owner)
      expect(json.dig("organization", "logoUrl")).to start_with("/rails/active_storage/representations/proxy/")
    end

    it "serve o logo de verdade, em PNG para não perder a transparência" do
      post "/organization/logo", params: { file: png }, headers: auth_headers(owner)

      get json["logoUrl"]

      expect(response).to have_http_status(:ok)
      expect(response.media_type).to eq("image/png")
    end

    it "exige core_settings" do
      post "/organization/logo", params: { file: png }, headers: auth_headers(attendant)

      expect(response).to have_http_status(:forbidden)
      expect(organization.reload.logo).not_to be_attached
    end

    it "recusa o que não é imagem" do
      post "/organization/logo", params: { file: fixture_file_upload("documento.txt", "image/png") }, headers: auth_headers(owner)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "field")).to eq("file")
      expect(organization.reload.logo).not_to be_attached
    end
  end

  describe "DELETE /organization/logo" do
    before { organization.logo.attach(png) }

    it "tira o logo" do
      delete "/organization/logo", headers: auth_headers(owner)

      expect(response).to have_http_status(:ok)
      expect(json["logoUrl"]).to be_nil
      expect(organization.reload.logo).not_to be_attached
    end

    it "exige core_settings" do
      delete "/organization/logo", headers: auth_headers(attendant)

      expect(response).to have_http_status(:forbidden)
      expect(organization.reload.logo).to be_attached
    end
  end
end
