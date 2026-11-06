require "rails_helper"

RSpec.describe "Campos personalizados", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:headers) { auth_headers(owner) }

  def field_for(org = organization, **attributes)
    create(:custom_field, organization_id: org.id, **attributes)
  end

  it "exige sessão" do
    get "/custom-fields"

    expect(response).to have_http_status(:unauthorized)
  end

  describe "GET /custom-fields" do
    it "lista os da organização, do alterado por último para o mais antigo" do
      old = field_for(name: "Antigo")
      old.set(updated_at: 2.days.ago)
      recent = field_for(name: "Recente", value_type: "list", option_values: %w[A B])
      field_for(create(:organization), name: "De fora")

      get "/custom-fields", headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["customFields"].map { |f| f["id"] }).to eq([ recent.id.to_s, old.id.to_s ])
      expect(json["customFields"].first).to include(
        "name" => "Recente", "key" => "recente", "valueType" => "list", "optionValues" => %w[A B],
        "autoNormalize" => false, "normalizationStrategy" => "min"
      )
    end

    it "abre a leitura a qualquer sessão: chat, contatos e pipelines mostram os campos" do
      field_for

      get "/custom-fields", headers: auth_headers(member_with(catalog: "all"))

      expect(response).to have_http_status(:ok)
      expect(json["customFields"].size).to eq(1)
    end
  end

  describe "GET /custom-fields/:id" do
    it "responde 404 para o de outra organização" do
      get "/custom-fields/#{field_for(create(:organization)).id}", headers: headers

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /custom-fields" do
    it "cria com a chave derivada do nome" do
      post "/custom-fields",
           params: { customField: { name: "  Volume Médio ", valueType: "text", autoNormalize: true, normalizationStrategy: "avg", normalizationTargetKey: "volume_num" } },
           headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["customField"]).to include(
        "name" => "Volume Médio", "key" => "volume_medio", "autoNormalize" => true,
        "normalizationStrategy" => "avg", "normalizationTargetKey" => "volume_num"
      )
      expect(CustomField.find(json["customField"]["id"]).organization_id).to eq(organization.id)
    end

    it "limpa as opções em branco" do
      post "/custom-fields",
           params: { customField: { name: "Plano", valueType: "list", optionValues: [ "Ouro", "", "Prata" ] } },
           headers: headers, as: :json

      expect(json["customField"]["optionValues"]).to eq(%w[Ouro Prata])
    end

    it "responde 422 com tipo que não existe" do
      post "/custom-fields", params: { customField: { name: "Campo", valueType: "string" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["field"]).to eq("valueType")
    end

    it "responde 422 sem nome" do
      post "/custom-fields", params: { customField: { name: "", valueType: "text" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["details"]).to have_key("name")
    end

    it "responde 422 com estratégia ou campo de destino inválidos" do
      post "/custom-fields",
           params: { customField: { name: "Campo", valueType: "text", normalizationStrategy: "median", normalizationTargetKey: "Com Espaço" } },
           headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["details"].keys).to include("normalizationStrategy", "normalizationTargetKey")
    end

    # Dois campos na mesma chave gravariam um por cima do outro em `custom_attributes`.
    it "recusa nome que daria a mesma chave de outro campo" do
      field_for(name: "Cidade")

      post "/custom-fields", params: { customField: { name: "CIDADE", valueType: "text" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("field" => "name", "message" => "nome já está em uso")
    end

    it "explica o tipo errado com o nome que a pessoa conhece" do
      post "/custom-fields", params: { customField: { name: "Errado", valueType: "string" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("field" => "valueType", "message" => "tipo não está na lista")
    end

    it "explica em inglês para quem pede em inglês" do
      post "/custom-fields?locale=en", params: { customField: { name: "Wrong", valueType: "string" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["message"]).to start_with("Type ")
    end

    it "aceita a mesma chave em outra organização" do
      field_for(create(:organization), name: "Cidade")

      post "/custom-fields", params: { customField: { name: "Cidade", valueType: "text" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
    end

    it "exige core_settings" do
      post "/custom-fields", params: { customField: { name: "x", valueType: "text" } }, headers: auth_headers(member_with(chat: "all")), as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PATCH /custom-fields/:id" do
    it "altera sem mudar a chave: é por ela que os valores estão gravados" do
      field = field_for(name: "Cidade")

      patch "/custom-fields/#{field.id}", params: { customField: { name: "Município", description: "Onde mora" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["customField"]).to include("name" => "Município", "key" => "cidade", "description" => "Onde mora")
    end

    it "responde 422 na validação" do
      patch "/custom-fields/#{field_for.id}", params: { customField: { valueType: "x" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "responde 404 para o de outra organização" do
      patch "/custom-fields/#{field_for(create(:organization)).id}", params: { customField: { name: "x" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /custom-fields/:id" do
    it "apaga, com os valores" do
      field = field_for
      create(:custom_field_value, custom_field: field)

      delete "/custom-fields/#{field.id}", headers: headers

      expect(response).to have_http_status(:no_content)
      expect(CustomField.where(id: field.id).exists?).to be(false)
      expect(CustomFieldValue.where(custom_field_id: field.id).exists?).to be(false)
    end

    it "exige core_settings" do
      delete "/custom-fields/#{field_for.id}", headers: auth_headers(member_with(chat: "all"))

      expect(response).to have_http_status(:forbidden)
    end

    it "não alcança o de outra organização" do
      other = field_for(create(:organization))

      delete "/custom-fields/#{other.id}", headers: headers

      expect(response).to have_http_status(:not_found)
      expect(CustomField.where(id: other.id).exists?).to be(true)
    end
  end

  describe "POST /custom-fields/:id/options" do
    let(:field) { field_for(name: "Plano", value_type: "list", option_values: %w[Ouro]) }

    it "deixa quem atende criar opção de dentro da conversa" do
      post "/custom-fields/#{field.id}/options", params: { value: " Prata " }, headers: auth_headers(member_with(chat: "all")), as: :json

      expect(response).to have_http_status(:ok)
      expect(json["customField"]["optionValues"]).to eq(%w[Ouro Prata])
    end

    it "não repete opção que já existe, mesmo com outra caixa" do
      post "/custom-fields/#{field.id}/options", params: { value: "OURO" }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["customField"]["optionValues"]).to eq(%w[Ouro])
    end

    it "responde 422 em campo que não é lista" do
      post "/custom-fields/#{field_for.id}/options", params: { value: "x" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["code"]).to eq("notListField")
    end

    it "responde 422 sem valor" do
      post "/custom-fields/#{field.id}/options", params: { value: " " }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]["field"]).to eq("value")
    end

    it "recusa quem não atende nem configura" do
      post "/custom-fields/#{field.id}/options", params: { value: "x" }, headers: auth_headers(member_with(catalog: "all")), as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /custom-fields/:id/values" do
    let(:field) { field_for(name: "Volume Medio") }

    it "traz os valores distintos com contagem, e respeita o recorte de datas" do
      create(:chat, organization: organization, custom_attributes: { "volume_medio" => "20 a 40/dia" })
      old = create(:chat, organization: organization, custom_attributes: { "volume_medio" => "50" })
      old.set(created_at: 2.years.ago)

      get "/custom-fields/#{field.id}/values", params: { startDate: 1.year.ago.iso8601 }, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["values"]).to eq([ { "value" => "20 a 40/dia", "count" => 1, "editable" => true } ])
      expect(json["truncated"]).to be(false)
    end

    it "não conta valor de outra organização" do
      create(:chat, organization: create(:organization), custom_attributes: { "volume_medio" => "de fora" })

      get "/custom-fields/#{field.id}/values", headers: headers

      expect(json["values"].map { |v| v["value"] }).not_to include("de fora")
    end

    # Os valores atravessam as conversas da organização inteira.
    it "exige core_settings" do
      get "/custom-fields/#{field.id}/values", headers: auth_headers(member_with(chat: "all"))

      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "POST /custom-fields/:id/normalize" do
    let(:field) { field_for(name: "Volume Medio") }
    let!(:chat) { create(:chat, organization: organization, custom_attributes: { "volume_medio" => "20 a 40/dia" }) }

    it "aplica em targetKey preservando o campo original" do
      post "/custom-fields/#{field.id}/normalize",
           params: { mapping: { "20 a 40/dia" => "20" }, dryRun: false, targetKey: "volume_medio_normalizado" },
           headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json).to include("dryRun" => false, "targetKey" => "volume_medio_normalizado")
      expect(json["changes"]).to eq([ { "from" => "20 a 40/dia", "to" => "20", "count" => 1 } ])
      attributes = chat.reload.custom_attributes
      expect(attributes["volume_medio_normalizado"]).to eq("20")
      expect(attributes["volume_medio"]).to eq("20 a 40/dia")
    end

    it "sem dryRun, só mostra a prévia" do
      post "/custom-fields/#{field.id}/normalize", params: { mapping: { "20 a 40/dia" => "20" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["dryRun"]).to be(true)
      expect(chat.reload.custom_attributes["volume_medio"]).to eq("20 a 40/dia")
    end

    it "mantém as chaves do mapeamento como foram escritas" do
      create(:chat, organization: organization, custom_attributes: { "volume_medio" => "dozeOuTreze" })

      post "/custom-fields/#{field.id}/normalize", params: { mapping: { "dozeOuTreze" => "12" }, dryRun: true }, headers: headers, as: :json

      expect(json["changes"].first).to include("from" => "dozeOuTreze", "count" => 1)
    end

    it "converte o tipo do campo quando pedido" do
      post "/custom-fields/#{field.id}/normalize",
           params: { mapping: { "20 a 40/dia" => "20" }, dryRun: false, convertToNumber: true },
           headers: headers, as: :json

      expect(field.reload.value_type).to eq("number")
    end

    it "não toca em conversa de outra organização" do
      foreign = create(:chat, organization: create(:organization), custom_attributes: { "volume_medio" => "20 a 40/dia" })

      post "/custom-fields/#{field.id}/normalize", params: { mapping: { "20 a 40/dia" => "20" }, dryRun: false }, headers: headers, as: :json

      expect(foreign.reload.custom_attributes["volume_medio"]).to eq("20 a 40/dia")
    end

    it "recusa targetKey fora do formato" do
      post "/custom-fields/#{field.id}/normalize",
           params: { mapping: { "a" => "b" }, targetKey: "Campo Inválido!" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "invalidTargetKey", "field" => "targetKey")
    end

    it "recusa mapeamento vazio" do
      post "/custom-fields/#{field.id}/normalize", params: { mapping: {} }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "invalidMapping", "field" => "mapping")
    end

    it "recusa mapeamento que não é objeto" do
      post "/custom-fields/#{field.id}/normalize", params: { mapping: "a" }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_content)
    end

    it "exige core_settings" do
      post "/custom-fields/#{field.id}/normalize", params: { mapping: { "a" => "b" } }, headers: auth_headers(member_with(chat: "all")), as: :json

      expect(response).to have_http_status(:forbidden)
    end
  end
end
