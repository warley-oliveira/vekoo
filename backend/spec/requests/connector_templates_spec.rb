require "rails_helper"

# Os detalhes do sync (paginação, campos, status desconhecido) estão em
# spec/models/connector/whatsapp_cloud_templates_spec.rb. Aqui fica a rota inteira.
RSpec.describe "ConnectorTemplates", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:member) { create(:account, organization: organization, role: "member", access_role: create(:access_role, :member, organization: organization)) }
  let(:headers) { auth_headers(owner) }
  let(:connector) { create(:connector_whatsapp_cloud, organization: organization, waba_id: 456, business_id: 789) }
  let(:graph_sdk) { ConnectorProviderStubs::GRAPH_SDK }
  let(:listing_url) { %r{\Ahttps://graph\.facebook\.com/v24\.0/456/message_templates} }

  def remote_template(id, name, status: "APPROVED", **overrides)
    { id: id, name: name, language: "pt_BR", category: "UTILITY", status: status, components: [ { type: "BODY", text: "Olá {{1}}" } ] }.merge(overrides)
  end

  def stub_listing(*templates)
    stub_request(:get, listing_url).to_return(provider_json({ data: templates }))
  end

  def templates_path(id = connector.id)
    "/connectors/#{id}/templates"
  end

  describe "GET /connectors/:id/templates" do
    it "responde 401 sem sessão" do
      get templates_path

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 404 para conector de outra organização" do
      foreign = create(:connector_whatsapp_cloud, organization: create(:organization))

      get templates_path(foreign.id), headers: headers

      expect(response).to have_http_status(:not_found)
    end

    it "responde 422 em conector de outro tipo" do
      get templates_path(create(:connector_whatsapp_web, organization: organization).id), headers: headers

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
    end

    it "vale para qualquer conta da organização, porque o chat e as campanhas enviam modelos" do
      stub_listing

      get templates_path, headers: auth_headers(member)

      expect(response).to have_http_status(:ok)
    end

    it "sincroniza com a Meta antes de responder, em ordem de nome" do
      stub_listing(remote_template("t2", "boas_vindas"), remote_template("t1", "aviso_entrega"))

      get templates_path, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["templates"].map { |template| template["name"] }).to eq(%w[aviso_entrega boas_vindas])
      expect(connector.whatsapp_templates.count).to eq(2)
    end

    it "responde em camelCase, com as datas em milissegundos" do
      stub_listing(remote_template("t1", "boas_vindas", sub_category: "CUSTOM", rejected_reason: "NONE", quality_score: { score: "GREEN" }))

      get templates_path, headers: headers

      expect(json["templates"].first).to include(
        "templateId" => "t1",
        "connectorId" => connector.id.to_s,
        "name" => "boas_vindas",
        "language" => "pt_BR",
        "category" => "UTILITY",
        "subCategory" => "CUSTOM",
        "rejectedReason" => "NONE",
        "qualityScore" => { "score" => "GREEN" },
        "status" => "approved",
        "removed" => false,
        "hasParameters" => true,
        "lastSyncedAt" => a_kind_of(Integer),
        "createdAt" => a_kind_of(Integer)
      )
    end

    it "não oferece os modelos que sumiram da WABA, sem apagá-los" do
      kept = create(:whatsapp_template, connector: connector, template_id: "t1", name: "fica")
      gone = create(:whatsapp_template, connector: connector, template_id: "t2", name: "sumiu")
      stub_listing(remote_template("t1", "fica"))

      get templates_path, headers: headers

      expect(json["templates"].map { |template| template["id"] }).to eq([ kept.id.to_s ])
      expect(gone.reload).to be_removed
    end

    it "inclui os removidos quando pedido" do
      create(:whatsapp_template, connector: connector, template_id: "t1", name: "fica")
      gone = create(:whatsapp_template, connector: connector, template_id: "t2", name: "sumiu")
      stub_listing(remote_template("t1", "fica"))

      get templates_path, params: { includeRemoved: true }, headers: headers

      expect(json["templates"].map { |template| template["name"] }).to eq(%w[fica sumiu])
      removed = json["templates"].find { |template| template["id"] == gone.id.to_s }
      expect(removed).to include("removed" => true, "status" => "removed", "removedAt" => a_kind_of(Integer))
    end

    it "traz de volta o que reapareceu na WABA" do
      returned = create(:whatsapp_template, connector: connector, template_id: "t1", name: "voltou")
      returned.mark_as_removed!
      stub_listing(remote_template("t1", "voltou"))

      get templates_path, headers: headers

      expect(json["templates"].map { |template| template["id"] }).to eq([ returned.id.to_s ])
    end

    context "quando a Meta falha" do
      let!(:local) { create(:whatsapp_template, connector: connector, template_id: "t1", name: "guardado") }

      it "não derruba a tela: devolve o que está guardado, sem marcar nada como removido" do
        stub_request(:get, listing_url).to_return(provider_json({ error: { message: "Fora do ar", code: 2 } }, status: 500))

        get templates_path, headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["templates"].map { |template| template["name"] }).to eq(%w[guardado])
        expect(local.reload).not_to be_removed
      end

      it "aguenta a rede fora" do
        stub_request(:get, listing_url).to_timeout

        get templates_path, headers: headers

        expect(response).to have_http_status(:ok)
        expect(json["templates"].map { |template| template["name"] }).to eq(%w[guardado])
      end
    end

    it "não derruba a tela quando o conector não tem WABA nem business_id" do
      connector.set(waba_id: nil, business_id: nil)
      create(:whatsapp_template, connector: connector, name: "guardado")

      get templates_path, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["templates"].map { |template| template["name"] }).to eq(%w[guardado])
    end

    it "não mostra o modelo de outro conector da organização" do
      other = create(:connector_whatsapp_cloud, organization: organization)
      create(:whatsapp_template, connector: other, name: "do_outro")
      stub_listing

      get templates_path, headers: headers

      expect(json["templates"]).to eq([])
    end

    it "não vaza o token da Meta" do
      connector.access_token = "SEGREDO-da-meta"
      connector.save!
      stub_listing(remote_template("t1", "boas_vindas"))

      get templates_path, headers: headers

      expect(response.body).not_to include("SEGREDO-da-meta")
    end
  end

  describe "POST /connectors/:id/templates" do
    let(:body) do
      {
        name: "Lembrete Consulta",
        language: "pt_BR",
        category: "UTILITY",
        components: [ { type: "BODY", text: "Olá {{1}}, sua consulta é amanhã" } ]
      }
    end

    def stub_creation(id: "meta-1")
      stub_request(:post, "#{graph_sdk}/456/message_templates")
        .to_return(provider_json({ id: id, status: "PENDING", category: "UTILITY" }))
    end

    it "responde 401 sem sessão" do
      post templates_path, params: body, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 403 sem core_settings" do
      post templates_path, params: body, headers: auth_headers(member), as: :json

      expect(response).to have_http_status(:forbidden)
      expect(connector.whatsapp_templates.count).to eq(0)
    end

    it "responde 404 para conector de outra organização" do
      foreign = create(:connector_whatsapp_cloud, organization: create(:organization))

      post templates_path(foreign.id), params: body, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "responde 422 em conector de outro tipo" do
      post templates_path(create(:connector_lead_chat, organization: organization).id), params: body, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
    end

    it "cria na Meta e guarda pendente, com o nome normalizado" do
      creation = stub_creation

      post templates_path, params: body, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["template"]).to include(
        "templateId" => "meta-1",
        "name" => "lembrete_consulta",
        "language" => "pt_BR",
        "category" => "UTILITY",
        "status" => "pending",
        "connectorId" => connector.id.to_s
      )
      expect(creation.with(body: hash_including("name" => "lembrete_consulta", "language" => "pt_BR", "allow_category_change" => true))).to have_been_requested
      expect(WhatsappTemplate.where(connector_id: connector.id).take.template_id).to eq("meta-1")
    end

    it "não mexe nas chaves dos componentes, que são da Meta" do
      stub_creation
      components = [ { "type" => "BUTTONS", "buttons" => [ { "type" => "QUICK_REPLY", "text" => "Sim" } ] } ]

      post templates_path, params: body.merge(components: components), headers: headers, as: :json

      expect(json["template"]["components"]).to eq(components)
      expect(WhatsappTemplate.where(connector_id: connector.id).take.components).to eq(components)
    end

    it "usa o business_id quando não há WABA" do
      connector.set(waba_id: nil)
      creation = stub_request(:post, "#{graph_sdk}/789/message_templates").to_return(provider_json({ id: "meta-1", status: "PENDING" }))

      post templates_path, params: body, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(creation).to have_been_requested
    end

    it "responde 422 sem nome, sem chamar a Meta" do
      post templates_path, params: body.except(:name), headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "unprocessable", "field" => "name")
      expect(connector.whatsapp_templates.count).to eq(0)
    end

    it "responde 422 com nome e idioma repetidos no mesmo conector" do
      create(:whatsapp_template, connector: connector, name: "lembrete_consulta", language: "pt_BR")
      stub_creation

      post templates_path, params: body.merge(name: "lembrete_consulta"), headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "unprocessable", "field" => "name")
    end

    it "responde 422 com a mensagem da Meta quando ela recusa" do
      stub_request(:post, "#{graph_sdk}/456/message_templates")
        .to_return(provider_json({ error: { message: "Invalid parameter", error_user_msg: "O corpo tem variáveis demais", code: 100 } }, status: 400))

      post templates_path, params: body, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "message")).to eq("O corpo tem variáveis demais")
      expect(connector.whatsapp_templates.count).to eq(0)
    end

    it "responde 422 com categoria que a Meta não conhece, sem chamá-la" do
      post templates_path, params: body.merge(category: "PROMOCAO"), headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorProviderError")
      expect(connector.whatsapp_templates.count).to eq(0)
    end

    it "responde 422 com idioma que a Meta não conhece, sem chamá-la" do
      post templates_path, params: body.merge(language: "klingon"), headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorProviderError")
    end

    it "responde 422 quando a rede cai" do
      stub_request(:post, "#{graph_sdk}/456/message_templates").to_timeout

      post templates_path, params: body, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorProviderError")
      expect(response.body).not_to include("token-da-meta")
      expect(connector.whatsapp_templates.count).to eq(0)
    end
  end

  describe "PATCH /connectors/:id/templates/:id" do
    let!(:template) { create(:whatsapp_template, connector: connector, template_id: "meta-1", name: "lembrete") }
    let(:new_components) { [ { "type" => "BODY", "text" => "Novo texto" } ] }

    def template_path(id = template.id, connector_id: connector.id)
      "/connectors/#{connector_id}/templates/#{id}"
    end

    def stub_update
      stub_request(:post, "#{graph_sdk}/meta-1").to_return(provider_json({ success: true }))
    end

    it "responde 401 sem sessão" do
      patch template_path, params: { components: new_components }, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 403 sem core_settings" do
      patch template_path, params: { components: new_components }, headers: auth_headers(member), as: :json

      expect(response).to have_http_status(:forbidden)
    end

    it "responde 404 para conector de outra organização" do
      foreign = create(:connector_whatsapp_cloud, organization: create(:organization))

      patch template_path(connector_id: foreign.id), params: { components: new_components }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "responde 404 para modelo de outro conector" do
      other = create(:whatsapp_template, connector: create(:connector_whatsapp_cloud, organization: organization))

      patch template_path(other.id), params: { components: new_components }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(json.dig("error", "code")).to eq("templateNotFound")
    end

    it "responde 404 para modelo que não existe" do
      patch template_path(BSON::ObjectId.new), params: { components: new_components }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "responde 422 em conector de outro tipo" do
      patch template_path(connector_id: create(:connector_zapi, organization: organization).id), params: {}, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
    end

    it "atualiza na Meta e aqui" do
      update = stub_update

      patch template_path, params: { components: new_components }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(update.with(body: { components: new_components }.to_json)).to have_been_requested
      expect(json.dig("template", "components")).to eq(new_components)
      expect(template.reload.components).to eq(new_components)
    end

    it "ignora o que não é editável" do
      stub_update

      patch template_path, params: { status: "rejected", templateId: "outro", connectorId: "outro" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(template.reload).to have_attributes(status: :approved, template_id: "meta-1", connector_id: connector.id)
    end

    it "responde 422 de validação sem chamar a Meta" do
      patch template_path, params: { name: "" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "unprocessable", "field" => "name")
    end

    it "responde 422 e mantém o que estava guardado quando a Meta recusa" do
      original = template.components
      stub_request(:post, "#{graph_sdk}/meta-1")
        .to_return(provider_json({ error: { message: "Invalid parameter", error_user_msg: "Modelo em análise não pode mudar", code: 100 } }, status: 400))

      patch template_path, params: { components: new_components }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "message")).to eq("Modelo em análise não pode mudar")
      expect(template.reload.components).to eq(original)
    end

    it "responde 422 quando a rede cai, sem guardar" do
      original = template.components
      stub_request(:post, "#{graph_sdk}/meta-1").to_timeout

      patch template_path, params: { components: new_components }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorProviderError")
      expect(template.reload.components).to eq(original)
    end
  end

  describe "DELETE /connectors/:id/templates/:id" do
    let!(:template) { create(:whatsapp_template, connector: connector, template_id: "meta-1", name: "lembrete") }
    let(:deletion_url) { "#{graph_sdk}/456/message_templates" }

    def template_path(id = template.id, connector_id: connector.id)
      "/connectors/#{connector_id}/templates/#{id}"
    end

    it "responde 401 sem sessão" do
      delete template_path, as: :json

      expect(response).to have_http_status(:unauthorized)
    end

    it "responde 403 sem core_settings, sem apagar" do
      delete template_path, headers: auth_headers(member), as: :json

      expect(response).to have_http_status(:forbidden)
      expect(WhatsappTemplate.where(id: template.id).exists?).to be(true)
    end

    it "responde 404 para conector de outra organização" do
      foreign = create(:connector_whatsapp_cloud, organization: create(:organization))

      delete template_path(connector_id: foreign.id), headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end

    it "responde 404 para modelo de outro conector, sem apagar" do
      other = create(:whatsapp_template, connector: create(:connector_whatsapp_cloud, organization: organization))

      delete template_path(other.id), headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(json.dig("error", "code")).to eq("templateNotFound")
      expect(WhatsappTemplate.where(id: other.id).exists?).to be(true)
    end

    it "responde 422 em conector de outro tipo" do
      delete template_path(connector_id: create(:connector_messenger, organization: organization).id), headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
    end

    it "apaga na Meta, pelo id do modelo, e aqui" do
      deletion = stub_request(:delete, deletion_url).with(query: { name: "lembrete", hsm_id: "meta-1" }).to_return(provider_json({ success: true }))

      delete template_path, headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(deletion).to have_been_requested
      expect(WhatsappTemplate.where(id: template.id).exists?).to be(false)
    end

    it "usa o business_id quando não há WABA" do
      connector.set(waba_id: nil)
      deletion = stub_request(:delete, "#{graph_sdk}/789/message_templates").with(query: hash_including({})).to_return(provider_json({ success: true }))

      delete template_path, headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(deletion).to have_been_requested
    end

    it "responde 422 com a mensagem da Meta quando ela recusa, sem apagar" do
      stub_request(:delete, deletion_url).with(query: hash_including({}))
        .to_return(provider_json({ error: { message: "Invalid parameter", error_user_msg: "Modelo em uso", code: 100 } }, status: 400))

      delete template_path, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "connectorProviderError", "message" => "Modelo em uso")
      expect(WhatsappTemplate.where(id: template.id).exists?).to be(true)
    end

    it "usa a mensagem técnica quando a Meta não manda a amigável" do
      stub_request(:delete, deletion_url).with(query: hash_including({})).to_return(meta_error("Fora do ar"))

      delete template_path, headers: headers, as: :json

      expect(json.dig("error", "message")).to eq("Fora do ar")
    end

    it "responde 422 quando a rede cai, sem apagar" do
      stub_request(:delete, deletion_url).with(query: hash_including({})).to_timeout

      delete template_path, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("connectorProviderError")
      expect(WhatsappTemplate.where(id: template.id).exists?).to be(true)
    end
  end
end
