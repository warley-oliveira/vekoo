require "rails_helper"

RSpec.describe "ConnectorWidgets", type: :request do
  let(:organization) { create(:organization) }
  let(:owner) { create(:account, organization: organization) }
  let(:member) { create(:account, organization: organization, role: "member", access_role: create(:access_role, :member, organization: organization)) }
  let(:headers) { auth_headers(owner) }
  let(:connector) { create(:connector_web_widget, organization: organization) }

  def widget_path(id = connector.id)
    "/connectors/#{id}/widget"
  end

  def update_widget(**params)
    patch widget_path, params: params, headers: headers, as: :json
  end

  describe "acesso" do
    let(:foreign) { create(:connector_web_widget, organization: create(:organization)) }

    [
      [ :get, "" ],
      [ :patch, "" ],
      [ :delete, "" ],
      [ :post, "/regenerate-token" ],
      [ :post, "/upload-image" ]
    ].each do |verb, suffix|
      describe "#{verb.upcase} /connectors/:id/widget#{suffix}" do
        it "responde 401 sem sessão" do
          public_send(verb, "#{widget_path}#{suffix}", as: :json)

          expect(response).to have_http_status(:unauthorized)
        end

        it "responde 403 sem core_settings, porque o snippet traz o token público" do
          public_send(verb, "#{widget_path}#{suffix}", headers: auth_headers(member), as: :json)

          expect(response).to have_http_status(:forbidden)
          expect(connector.reload.status).to eq(:active)
        end

        it "responde 404 para conector de outra organização, sem tocar nele" do
          token = foreign.public_token

          public_send(verb, "#{widget_path(foreign.id)}#{suffix}", headers: headers, as: :json)

          expect(response).to have_http_status(:not_found)
          expect(foreign.reload).to have_attributes(status: :active, public_token: token)
        end

        it "responde 422 em conector de outro tipo" do
          other = create(:connector_whatsapp_web, organization: organization)

          public_send(verb, "#{widget_path(other.id)}#{suffix}", headers: headers, as: :json)

          expect(response).to have_http_status(:unprocessable_content)
          expect(json.dig("error", "code")).to eq("connectorTypeMismatch")
        end
      end
    end
  end

  describe "GET /connectors/:id/widget" do
    it "devolve a configuração completa, com token público e snippet" do
      get widget_path, headers: headers

      expect(response).to have_http_status(:ok)
      expect(json["widget"]).to include(
        "id" => connector.id.to_s,
        "status" => "active",
        "active" => true,
        "publicToken" => connector.public_token,
        "primaryColor" => "#5B93FF",
        "position" => "bottom-right",
        "rateLimitPerMin" => 20,
        "dailyMessageCap" => 0,
        "dailyVisitorCap" => 0,
        "allowedOrigins" => [],
        "deliveryMode" => "rolling"
      )
      expect(json.dig("widget", "installSnippet")).to include(connector.public_token)
    end

    it "nunca devolve o segredo de assinatura" do
      get widget_path, headers: headers

      expect(response.body).not_to include(connector.signing_secret)
      expect(json["widget"]).not_to have_key("signingSecret")
    end
  end

  describe "PATCH /connectors/:id/widget" do
    it "muda a cor" do
      update_widget(primaryColor: "#FF00AA")

      expect(response).to have_http_status(:ok)
      expect(json.dig("widget", "primaryColor")).to eq("#FF00AA")
      expect(connector.reload.primary_color).to eq("#FF00AA")
    end

    it "guarda as origens e o limite, e preserva nas alterações seguintes" do
      update_widget(allowedOrigins: [ "https://shop.example.com", "https://www.example.com" ], rateLimitPerMin: 50)

      expect(response).to have_http_status(:ok)

      update_widget(primaryColor: "#000000")

      expect(json["widget"]).to include(
        "allowedOrigins" => [ "https://shop.example.com", "https://www.example.com" ],
        "rateLimitPerMin" => 50,
        "primaryColor" => "#000000"
      )
    end

    it "tira as origens em branco" do
      update_widget(allowedOrigins: [ "https://shop.example.com", "", nil ])

      expect(json.dig("widget", "allowedOrigins")).to eq([ "https://shop.example.com" ])
    end

    it "ignora o que não é texto na lista de origens" do
      update_widget(allowedOrigins: [ "https://shop.example.com", { "$ne" => "" }, 123 ])

      expect(response).to have_http_status(:ok)
      expect(json.dig("widget", "allowedOrigins")).to eq([ "https://shop.example.com" ])
    end

    it "não quebra com um mapa no lugar da lista de origens" do
      update_widget(allowedOrigins: { "$ne" => "" })

      expect(response).to have_http_status(:ok)
      expect(connector.reload.allowed_origins).to eq([])
    end

    it "esvazia a lista de origens" do
      connector.update!(allowed_origins: [ "https://shop.example.com" ])

      update_widget(allowedOrigins: [])

      expect(connector.reload.allowed_origins).to eq([])
    end

    it "guarda os tokens de aparência e os devolve" do
      update_widget(
        userBubbleColor: "#123456",
        userBubbleTextColor: "#ABCDEF",
        assistantBubbleColor: "#FFFFFF",
        assistantBubbleTextColor: "#000000",
        headerBgColor: "#0A0A0A",
        headerTextColor: "#FFFFFF",
        messageAreaBg: "#F5F5F5",
        launcherSize: 72,
        bubbleRadius: 8,
        panelRadius: 20,
        fontFamily: "inter"
      )

      expect(response).to have_http_status(:ok)
      expect(json["widget"]).to include(
        "userBubbleColor" => "#123456",
        "userBubbleTextColor" => "#ABCDEF",
        "assistantBubbleColor" => "#FFFFFF",
        "assistantBubbleTextColor" => "#000000",
        "headerBgColor" => "#0A0A0A",
        "headerTextColor" => "#FFFFFF",
        "messageAreaBg" => "#F5F5F5",
        "launcherSize" => 72,
        "bubbleRadius" => 8,
        "panelRadius" => 20,
        "fontFamily" => "inter"
      )
    end

    it "guarda o texto, o nome e as regras" do
      update_widget(
        welcomeMessage: "Oi, tudo bem?",
        botDisplayName: "Ana",
        launcherIcon: "balao",
        locale: "en",
        preChatFields: "name",
        dailyMessageCap: 100,
        dailyVisitorCap: 10,
        autoPageContext: false,
        proactiveEnabled: false
      )

      expect(response).to have_http_status(:ok)
      expect(json["widget"]).to include(
        "welcomeMessage" => "Oi, tudo bem?",
        "botDisplayName" => "Ana",
        "launcherIcon" => "balao",
        "locale" => "en",
        "preChatFields" => "name",
        "dailyMessageCap" => 100,
        "dailyVisitorCap" => 10,
        "autoPageContext" => false,
        "proactiveEnabled" => false
      )
    end

    it "não aceita trocar credencial, organização nem status por fora" do
      token = connector.public_token
      secret = connector.signing_secret

      update_widget(publicToken: "pk_widget_meu", signingSecret: "meu", organizationId: "outra", status: "failed", primaryColor: "#000000")

      expect(response).to have_http_status(:ok)
      connector.reload
      expect(connector).to have_attributes(public_token: token, signing_secret: secret, organization_id: organization.id, status: :active)
    end

    describe "liga e desliga" do
      it "liga com active:true" do
        connector.set(status_cd: "inactive")

        update_widget(active: true)

        expect(json.dig("widget", "status")).to eq("active")
        expect(connector.reload).to be_active
      end

      it "desliga com active:false" do
        update_widget(active: false)

        expect(json["widget"]).to include("status" => "inactive", "active" => false)
        expect(connector.reload.status).to eq(:inactive)
      end

      it "não muda o status quando não vem" do
        connector.set(status_cd: "inactive")

        update_widget(primaryColor: "#000000")

        expect(connector.reload.status).to eq(:inactive)
      end
    end

    describe "validação" do
      def expect_invalid(field, **params)
        before = connector.reload.attributes.except("updated_at")

        update_widget(**params)

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("code" => "unprocessable", "field" => field)
        expect(json.dig("error", "details", field)).to be_present
        expect(connector.reload.attributes.except("updated_at")).to eq(before)
      end

      it("recusa posição inválida") { expect_invalid("position", position: "middle-center") }
      it("recusa cor malformada") { expect_invalid("userBubbleColor", userBubbleColor: "red") }
      it("recusa cor principal malformada") { expect_invalid("primaryColor", primaryColor: "#12") }
      it("recusa launcher fora da faixa") { expect_invalid("launcherSize", launcherSize: 500) }
      it("recusa raio do balão fora da faixa") { expect_invalid("bubbleRadius", bubbleRadius: 99) }
      it("recusa raio do painel fora da faixa") { expect_invalid("panelRadius", panelRadius: 4) }
      it("recusa fonte fora da lista") { expect_invalid("fontFamily", fontFamily: "comic-sans") }
      it("recusa formulário desconhecido") { expect_invalid("preChatFields", preChatFields: "tudo") }
      it("recusa limite por minuto zerado") { expect_invalid("rateLimitPerMin", rateLimitPerMin: 0) }
      it("recusa limite por minuto acima do teto") { expect_invalid("rateLimitPerMin", rateLimitPerMin: 1001) }
      it("recusa limite por minuto que não é número") { expect_invalid("rateLimitPerMin", rateLimitPerMin: "muito") }
      it("recusa cota negativa de mensagens") { expect_invalid("dailyMessageCap", dailyMessageCap: -1) }
      it("recusa cota negativa de visitantes") { expect_invalid("dailyVisitorCap", dailyVisitorCap: -1) }
    end

    describe "CSS livre" do
      it "higieniza antes de guardar" do
        update_widget(customCss: "@import url('http://evil.com'); .vekoo-widget .bubble{border:1px solid red}")

        expect(response).to have_http_status(:ok)
        expect(json.dig("widget", "customCss")).not_to include("@import")
        expect(json.dig("widget", "customCss")).to include(".vekoo-widget .bubble")
        expect(connector.reload.custom_css).not_to include("@import")
      end

      it "corta no tamanho máximo em vez de recusar" do
        update_widget(customCss: "a" * (Connector::WebWidget::MAX_CUSTOM_CSS + 10))

        expect(response).to have_http_status(:ok)
        expect(connector.reload.custom_css.length).to eq(Connector::WebWidget::MAX_CUSTOM_CSS)
      end

      it "não apaga o CSS quando não vem" do
        connector.update!(custom_css: ".a{color:red}")

        update_widget(primaryColor: "#000000")

        expect(connector.reload.custom_css).to eq(".a{color:red}")
      end

      it "apaga com texto vazio" do
        connector.update!(custom_css: ".a{color:red}")

        update_widget(customCss: "")

        expect(connector.reload.custom_css).to eq("")
      end

      it "sai na aparência pública já higienizado" do
        update_widget(customCss: ".a{}</style><script>x</script>")

        get "/widget/v1/config", params: { pk: connector.public_token }

        expect(json.dig("config", "customCss")).not_to include("</")
      end
    end

    describe "entrega do bundle" do
      let(:known_version) { Widget::ReleaseRegistry.versions.first }
      let(:known_sri) { Widget::ReleaseRegistry.sri(known_version) }

      it "usa rolling por padrão, com o snippet de sempre" do
        get widget_path, headers: headers

        expect(json["widget"]).to include("deliveryMode" => "rolling", "widgetSri" => nil)
        expect(json.dig("widget", "installSnippet")).to include("/widget.v1.js")
        expect(json.dig("widget", "installSnippet")).not_to include("integrity")
      end

      it "aponta o snippet para o CDN do Vekoo" do
        get widget_path, headers: headers

        expect(json.dig("widget", "installSnippet")).to include("https://widget.vekoo.app/widget.v1.js")
      end

      it "emite o snippet com integrity ao fixar numa versão conhecida" do
        update_widget(deliveryMode: "pinned", pinnedVersion: known_version)

        expect(response).to have_http_status(:ok)
        expect(json["widget"]).to include("deliveryMode" => "pinned", "pinnedVersion" => known_version, "widgetSri" => known_sri)
        expect(json.dig("widget", "installSnippet")).to include(%(integrity="#{known_sri}"), 'crossorigin="anonymous"', "/v/widget.#{known_version}.js")
      end

      it "responde 422 com versão que não está no catálogo" do
        update_widget(deliveryMode: "pinned", pinnedVersion: "99.99.99")

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("field" => "pinnedVersion")
        expect(json.dig("error", "details", "pinnedVersion").join).to match(/99\.99\.99/)
      end

      it "responde 422 ao fixar sem versão" do
        update_widget(deliveryMode: "pinned")

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("field" => "pinnedVersion")
      end

      it "responde 422 com modo desconhecido" do
        update_widget(deliveryMode: "self_hosted")

        expect(response).to have_http_status(:unprocessable_content)
        expect(json["error"]).to include("field" => "deliveryMode")
      end

      it "deixa voltar de fixado para rolling" do
        update_widget(deliveryMode: "pinned", pinnedVersion: known_version)

        update_widget(deliveryMode: "rolling")

        expect(response).to have_http_status(:ok)
        expect(json.dig("widget", "installSnippet")).to include("/widget.v1.js")
      end

      it "expõe o catálogo de versões em camelCase e as diretivas de CSP" do
        get widget_path, headers: headers

        versions = json.dig("widget", "availableVersions")
        expect(versions.map { |version| version["version"] }).to include(known_version)
        expect(versions.first.keys).to include("version", "sri", "releasedAt", "notes")

        expect(json.dig("widget", "cspDirectives", "connect-src")).to include(Media::Storage.backend_url)
        expect(json.dig("widget", "cspDirectives", "script-src")).to include("https://widget.vekoo.app")
        expect(json.dig("widget", "cspScriptHash")).to start_with("'sha256-")
        expect(json.dig("widget", "cspHeader")).to include("script-src", "connect-src")
      end
    end
  end

  # Do painel ao site: nasce desligado, a pessoa personaliza, liga, e o visitante entra.
  it "funciona de ponta a ponta" do
    post "/connectors", params: { connectorType: "web_widget" }, headers: headers, as: :json
    id = json.dig("connector", "id")

    get widget_path(id), headers: headers
    pk = json.dig("widget", "publicToken")
    expect(json.dig("widget", "active")).to be(false)

    get "/widget/v1/config", params: { pk: pk }
    expect(response).to have_http_status(:forbidden)

    patch widget_path(id), params: { active: true, primaryColor: "#FF00AA" }, headers: headers, as: :json
    expect(json.dig("widget", "active")).to be(true)

    post "/widget/v1/session", params: { pk: pk, visitorId: "visitor-ponta" }, as: :json
    expect(response).to have_http_status(:ok)
    expect(json.dig("config", "primaryColor")).to eq("#FF00AA")

    post "/widget/v1/messages", params: { content: "Oi!" }, headers: { "Authorization" => "Bearer #{json['visitorJwt']}" }, as: :json
    expect(response).to have_http_status(:created)
    expect(Chat.where(connector_id: id, organization_id: organization.id).count).to eq(1)
  end

  describe "DELETE /connectors/:id/widget" do
    it "fecha o widget, sem apagar a configuração" do
      connector.update!(primary_color: "#000000")

      delete widget_path, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["widget"]).to include("active" => false, "status" => "closed", "primaryColor" => "#000000")
      expect(connector.reload.status).to eq(:closed)
    end

    it "derruba o acesso público" do
      pk = connector.public_token

      delete widget_path, headers: headers, as: :json
      get "/widget/v1/config", params: { pk: pk }

      expect(response).to have_http_status(:forbidden)
      expect(json.dig("error", "code")).to eq("connectorInactive")
    end
  end

  describe "POST /connectors/:id/widget/regenerate-token" do
    it "troca o token público e o segredo de assinatura" do
      original_token = connector.public_token
      original_secret = connector.signing_secret

      post "#{widget_path}/regenerate-token", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      connector.reload
      expect(connector.public_token).not_to eq(original_token)
      expect(connector.public_token).to start_with("pk_widget_")
      expect(connector.signing_secret).not_to eq(original_secret)
      expect(json.dig("widget", "publicToken")).to eq(connector.public_token)
      expect(json.dig("widget", "installSnippet")).to include(connector.public_token)
      expect(response.body).not_to include(connector.signing_secret)
    end

    it "invalida o token antigo e os JWT já emitidos" do
      old_pk = connector.public_token
      old_jwt = connector.issue_visitor_jwt("visitor-antigo")

      post "#{widget_path}/regenerate-token", headers: headers, as: :json

      get "/widget/v1/config", params: { pk: old_pk }
      expect(response).to have_http_status(:unauthorized)

      get "/widget/v1/visitor", headers: { "Authorization" => "Bearer #{old_jwt}" }
      expect(response).to have_http_status(:unauthorized)
    end
  end

  describe "POST /connectors/:id/widget/upload-image" do
    let(:png) { fixture_file_upload("foto.png", "image/png") }

    def upload(**params)
      post "#{widget_path}/upload-image", params: params, headers: headers
    end

    def blob_of(url)
      ActiveStorage::Blob.find_signed(url[%r{/blobs/proxy/([^/]+)/}, 1])
    end

    it "guarda a imagem do botão e a URL pública, porque ela carrega no site do cliente" do
      upload(slot: "launcher", file: png)

      expect(response).to have_http_status(:ok)
      url = connector.reload.launcher_image_url
      expect(url).to start_with("#{Media::Storage.backend_url}/rails/active_storage/blobs/proxy/")
      expect(json.dig("widget", "launcherImageUrl")).to eq(url)
      expect(blob_of(url)).to have_attributes(filename: an_object_having_attributes(to_s: "foto.png"), content_type: "image/png")
    end

    it "guarda o avatar" do
      upload(slot: "avatar", file: png)

      expect(response).to have_http_status(:ok)
      expect(connector.reload.bot_avatar_url).to start_with("#{Media::Storage.backend_url}/rails/active_storage/blobs/proxy/")
      expect(connector.launcher_image_url).to be_nil
    end

    %w[image/jpeg image/webp image/gif].each do |type|
      it "aceita #{type}" do
        upload(slot: "launcher", file: Rack::Test::UploadedFile.new(StringIO.new("bytes"), type, original_filename: "imagem"))

        expect(response).to have_http_status(:ok)
      end
    end

    it "serve a imagem pela rota proxy, sem sessão" do
      upload(slot: "launcher", file: png)

      get URI.parse(connector.reload.launcher_image_url).path

      expect(response).to have_http_status(:ok)
      expect(response.body).to eq(file_fixture("foto.png").binread)
    end

    it "responde 422 com destino desconhecido" do
      upload(slot: "banner", file: png)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "invalidSlot", "field" => "slot")
    end

    it "responde 422 sem destino" do
      upload(file: png)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("invalidSlot")
    end

    it "responde 422 sem arquivo" do
      upload(slot: "launcher")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "fileRequired", "field" => "file")
    end

    it "responde 422 com texto no lugar do arquivo" do
      upload(slot: "launcher", file: "nao-e-arquivo")

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("fileRequired")
    end

    it "responde 422 com arquivo que não é imagem" do
      upload(slot: "launcher", file: fixture_file_upload("documento.txt", "text/plain"))

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "invalidFileType", "field" => "file")
    end

    it "responde 422 com SVG, que pode carregar script" do
      upload(slot: "launcher", file: Rack::Test::UploadedFile.new(StringIO.new("<svg/>"), "image/svg+xml", original_filename: "a.svg"))

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("invalidFileType")
    end

    it "aceita até 2 MB" do
      limit = ConnectorWidgetsController::MAX_IMAGE_SIZE

      upload(slot: "launcher", file: Rack::Test::UploadedFile.new(StringIO.new("a" * limit), "image/png", original_filename: "cheia.png"))

      expect(response).to have_http_status(:ok)
    end

    it "responde 422 acima de 2 MB, sem guardar" do
      limit = ConnectorWidgetsController::MAX_IMAGE_SIZE

      expect {
        upload(slot: "launcher", file: Rack::Test::UploadedFile.new(StringIO.new("a" * (limit + 1)), "image/png", original_filename: "grande.png"))
      }.not_to change(ActiveStorage::Blob, :count)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json["error"]).to include("code" => "fileTooLarge", "field" => "file")
      expect(connector.reload.launcher_image_url).to be_nil
    end

    it "responde 422 quando o armazenamento falha" do
      allow(Media::Storage).to receive(:store_io).and_raise("disco cheio")

      upload(slot: "launcher", file: png)

      expect(response).to have_http_status(:unprocessable_content)
      expect(json.dig("error", "code")).to eq("uploadFailed")
      expect(response.body).not_to include("disco cheio")
    end
  end
end
