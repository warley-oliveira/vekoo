require "rails_helper"

RSpec.describe "Webhooks", type: :request do
  include ActiveJob::TestHelper
  include ActiveSupport::Testing::TimeHelpers
  include ScriptEngineHelpers

  let(:organization) { create(:organization) }
  let(:account) { create(:account, organization: organization) }
  let(:headers) { auth_headers(account) }
  let(:blank_role) { create(:access_role, organization: organization, permissions: AccessRole::BLANK_PERMISSIONS) }
  let(:no_access_headers) { auth_headers(create(:account, organization: organization, role: "member", access_role: blank_role)) }
  let(:other_hook) { create(:hook, organization: create(:organization)) }

  describe "GET /webhooks" do
    it "lista os da organização, com as ações e o último corpo recebido achatado" do
      hook = create(:hook, organization: organization, received_payload: [ { "body" => { "a" => { "b" => 1 } }, "query" => {}, "headers" => {} } ])
      create(:hook_action_contact, hook: hook)
      other_hook

      get "/webhooks", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(json["webhooks"].pluck("id")).to eq([ hook.id ])
      item = json["webhooks"].first
      expect(item["receivedPayload"]).to eq("body.a.b" => 1)
      expect(item["url"]).to end_with("/inbound/webhooks/#{hook.uid}")
      expect(item["webhookActions"].first).to include("type" => "HookAction::ContactHandling", "static" => true)
      expect(item["webhookActions"].first["config"]).to eq("contactIdentifier" => "{{body.telefone}}", "contactName" => "{{body.nome}}")
    end

    it "401 e 403 (é de quem tem core_settings)" do
      get "/webhooks", as: :json
      expect(response).to have_http_status(:unauthorized)

      get "/webhooks", headers: no_access_headers, as: :json
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /webhooks/:id" do
    it "404 em outra organização" do
      get "/webhooks/#{other_hook.id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "POST /webhooks" do
    it "nasce em teste, com a ação do contato" do
      post "/webhooks", params: { webhook: { name: "Pedido aprovado", status: "active" } }, headers: headers, as: :json

      expect(response).to have_http_status(:created)
      expect(json["webhook"]).to include("name" => "Pedido aprovado", "status" => "test", "slug" => "pedido-aprovado", "signatureEnabled" => false)
      expect(json["webhook"]["uid"]).to be_present
      expect(json["webhook"]["webhookActions"].pluck("type")).to eq([ "HookAction::ContactHandling" ])
    end

    it "422 sem nome e 403 sem a permissão" do
      post "/webhooks", params: { webhook: { name: "" } }, headers: headers, as: :json
      expect(response).to have_http_status(:unprocessable_entity)

      post "/webhooks", params: { webhook: { name: "x" } }, headers: no_access_headers, as: :json
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "PATCH /webhooks/:id" do
    let(:hook) { create(:hook, organization: organization, status: "test") }
    let!(:contact) { create(:hook_action_contact, hook: hook, config: {}) }
    let(:connector) { create(:connector_whatsapp_web, organization: organization) }

    def update_actions(*actions, **attributes)
      patch "/webhooks/#{hook.id}", params: { webhook: attributes.merge(webhookActions: actions) }, headers: headers, as: :json
    end

    it "muda nome e status" do
      patch "/webhooks/#{hook.id}", params: { webhook: { name: "Outro", status: "active" } }, headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      expect(hook.reload).to have_attributes(name: "Outro", status: "active", slug: "outro")
    end

    it "422 em status desconhecido" do
      patch "/webhooks/#{hook.id}", params: { webhook: { status: "outro" } }, headers: headers, as: :json

      expect(response).to have_http_status(:unprocessable_entity)
    end

    it "cria, muda e remove ações" do
      flow = published_flow(organization, [ node("t", "trigger_webhook") ], [], trigger_type: "webhook")
      update_actions(
        { id: contact.id, config: { contactIdentifier: "{{body.fone}}", contactName: "{{body.nome}}" } },
        { type: "HookAction::StartFlow", config: { connectorId: connector.id.to_s, flowId: flow.id, messageText: "Oi {{body.nome}}", sendMode: "simple" } },
        { type: "HookAction::HttpRequest", config: { url: "https://api.exemplo.test/x", httpMethod: "POST", headers: [ { key: "X-Chave", value: "1" } ], body: { "campoLivre" => "{{body.nome}}" } } }
      )

      expect(response).to have_http_status(:ok)
      expect(contact.reload.contact_identifier).to eq("{{body.fone}}")
      start_flow = hook.hook_actions.find_by(type: "HookAction::StartFlow")
      expect(start_flow).to have_attributes(connector_id: connector.id.to_s, flow_id: flow.id, message_text: "Oi {{body.nome}}")

      http = json["webhook"]["webhookActions"].find { |action| action["type"] == "HookAction::HttpRequest" }
      expect(http["config"]).to include("httpMethod" => "POST", "headers" => [ { "key" => "X-Chave", "value" => "1" } ], "body" => { "campoLivre" => "{{body.nome}}" })

      update_actions({ id: start_flow.id, _destroy: true })
      expect(hook.hook_actions.where(type: "HookAction::StartFlow")).not_to exist
    end

    it "a ação do contato não sai" do
      update_actions({ id: contact.id, _destroy: true })

      expect(HookAction::Base.where(id: contact.id)).to exist
    end

    it "não aceita canal, fluxo nem campo de outra organização" do
      other = create(:organization)
      update_actions({ type: "HookAction::StartFlow", config: { connectorId: create(:connector_whatsapp_web, organization: other).id.to_s } })
      expect(response).to have_http_status(:unprocessable_entity)

      update_actions({ type: "HookAction::StartFlow", config: { flowId: create(:flow, organization: other).id } })
      expect(response).to have_http_status(:unprocessable_entity)

      update_actions({ type: "HookAction::UserField", config: { customFieldId: create(:custom_field, organization_id: other.id).id.to_s } })
      expect(response).to have_http_status(:unprocessable_entity)

      expect(hook.hook_actions.count).to eq(1)
    end

    it "não alcança a ação de outro webhook" do
      alheia = create(:hook_action_contact, hook: other_hook)

      update_actions({ id: alheia.id, config: { contactName: "x" } })

      expect(response).to have_http_status(:not_found)
      expect(alheia.reload.contact_name).not_to eq("x")
    end

    it "422 em tipo que não existe, e nada fica pela metade" do
      update_actions(
        { type: "HookAction::CodeRunner", config: { code: "return 1;" } },
        { type: "Kernel", config: {} },
        name: "Outro"
      )

      expect(response).to have_http_status(:unprocessable_entity)
      expect(json["error"]["code"]).to eq("unknownActionType")
      expect(hook.reload.name).not_to eq("Outro")
      expect(hook.hook_actions.count).to eq(1)
    end

    it "salvar resolve o alerta do webhook" do
      hook.alert_failure!("deu ruim")

      update_actions({ id: contact.id, config: { contactName: "x" } })

      expect(organization.organization_alerts.active.for_origin("Hook", hook.id)).not_to exist
    end

    it "404 em outra organização" do
      patch "/webhooks/#{other_hook.id}", params: { webhook: { name: "x" } }, headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
    end
  end

  describe "DELETE /webhooks/:id" do
    it "apaga, com as ações e os logs" do
      hook = create(:hook, organization: organization)
      action = create(:hook_action_contact, hook: hook)
      create(:hook_log, hook_id: hook.id, organization_id: organization.id)

      delete "/webhooks/#{hook.id}", headers: headers, as: :json

      expect(response).to have_http_status(:no_content)
      expect(HookAction::Base.where(id: action.id)).not_to exist
      expect(HookLog.for_hook(hook.id)).not_to exist
    end

    it "404 em outra organização" do
      delete "/webhooks/#{other_hook.id}", headers: headers, as: :json

      expect(response).to have_http_status(:not_found)
      expect(Hook.exists?(other_hook.id)).to be(true)
    end
  end

  describe "a assinatura" do
    let(:hook) { create(:hook, organization: organization) }

    it "ligar pela primeira vez devolve o segredo, uma vez só" do
      post "/webhooks/#{hook.id}/enable-signature", headers: headers, as: :json

      expect(response).to have_http_status(:ok)
      secret = json["signingSecret"]
      expect(secret).to start_with("whsec_")
      expect(json["webhook"]).to include("signatureEnabled" => true, "signingSecretHint" => "whsec_••••••••#{secret.last(4)}")
      expect(response.body).not_to include("ciphertext")

      get "/webhooks/#{hook.id}", headers: headers, as: :json
      expect(response.body).not_to include(secret)
    end

    it "religar mantém a chave, sem devolver" do
      secret = hook.enable_signature!
      delete "/webhooks/#{hook.id}/disable-signature", headers: headers, as: :json
      expect(json["webhook"]["signatureEnabled"]).to be(false)

      post "/webhooks/#{hook.id}/enable-signature", headers: headers, as: :json

      expect(json["signingSecret"]).to be_nil
      expect(hook.reload.signing_secret).to eq(secret)
    end

    it "renovar troca a chave, e a anterior para de valer" do
      old = hook.enable_signature!

      post "/webhooks/#{hook.id}/rotate-signing-secret", headers: headers, as: :json

      expect(json["signingSecret"]).not_to eq(old)
      expect(hook.reload.signing_secret).to eq(json["signingSecret"])
      expect(json["webhook"]["signingSecretGeneratedAt"]).to be_present
    end

    it "404 em outra organização, e 403 sem a permissão" do
      post "/webhooks/#{other_hook.id}/rotate-signing-secret", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)

      post "/webhooks/#{hook.id}/enable-signature", headers: no_access_headers, as: :json
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /webhook-logs" do
    let(:hook) { create(:hook, organization: organization) }

    it "lista os da organização, do mais novo para o mais antigo, com os filtros" do
      older = create(:hook_log, hook_id: hook.id, organization_id: organization.id, status: "error", created_at: 2.days.ago)
      newer = create(:hook_log, hook_id: hook.id, organization_id: organization.id, status: "success")
      create(:hook_log, hook_id: "outro", organization_id: organization.id)
      create(:hook_log, organization_id: other_hook.organization_id)

      get "/webhook-logs", params: { webhookId: hook.id }, headers: headers
      expect(response).to have_http_status(:ok)
      expect(json["logs"].pluck("id")).to eq([ newer.id.to_s, older.id.to_s ])
      expect(json["meta"]).to include("total" => 2, "perPage" => 50)
      expect(json["logs"].first).to include("webhookId" => hook.id, "status" => "success", "requestBody" => { "nome" => "Ana" })

      get "/webhook-logs", params: { webhookId: hook.id, status: "error" }, headers: headers
      expect(json["logs"].pluck("id")).to eq([ older.id.to_s ])

      get "/webhook-logs", params: { webhookId: hook.id, startDate: 1.day.ago.iso8601 }, headers: headers
      expect(json["logs"].pluck("id")).to eq([ newer.id.to_s ])

      get "/webhook-logs", params: { webhookId: hook.id, endDate: 1.day.ago.iso8601 }, headers: headers
      expect(json["logs"].pluck("id")).to eq([ older.id.to_s ])
    end

    it "mostra um, e 404 no de outra organização" do
      log = create(:hook_log, organization_id: organization.id)
      alheio = create(:hook_log, organization_id: other_hook.organization_id)

      get "/webhook-logs/#{log.id}", headers: headers, as: :json
      expect(json["log"]["id"]).to eq(log.id.to_s)

      get "/webhook-logs/#{alheio.id}", headers: headers, as: :json
      expect(response).to have_http_status(:not_found)
    end

    it "401 e 403" do
      get "/webhook-logs", as: :json
      expect(response).to have_http_status(:unauthorized)

      get "/webhook-logs", headers: no_access_headers, as: :json
      expect(response).to have_http_status(:forbidden)
    end
  end

  describe "GET /webhook-logs/stats" do
    it "conta por situação e por dia, só da organização" do
      organization.update!(timezone: "America/Sao_Paulo")
      freeze_time do
        create(:hook_log, organization_id: organization.id, status: "success", processing_time_ms: 10.0)
        create(:hook_log, organization_id: organization.id, status: "success", processing_time_ms: 30.0)
        create(:hook_log, organization_id: organization.id, status: "error")
        create(:hook_log, organization_id: organization.id, status: "skipped", created_at: 40.days.ago)
        create(:hook_log, organization_id: other_hook.organization_id, status: "success")

        get "/webhook-logs/stats", headers: headers, as: :json
      end

      stats = json["stats"]
      expect(stats).to include("periodDays" => 30, "totalRequests" => 3, "successCount" => 2, "errorCount" => 1, "skippedCount" => 0, "avgProcessingTimeMs" => 20.0)
      expect(stats["dailyStats"].values.first).to eq("total" => 3, "success" => 2, "error" => 1, "skipped" => 0)
    end

    it "filtra por webhook e limita o período" do
      create(:hook_log, organization_id: organization.id, hook_id: "a", status: "success")
      create(:hook_log, organization_id: organization.id, hook_id: "b", status: "success")

      get "/webhook-logs/stats", params: { webhookId: "a", days: 500 }, headers: headers

      expect(json["stats"]).to include("totalRequests" => 1, "periodDays" => 90)
    end
  end

  describe "POST /inbound/webhooks/:uid" do
    let(:hook) { create(:hook, organization: organization, status: "active") }
    let(:body) { { telefone: "+55 (31) 97181-0932", nome: "Fernanda" } }

    def deliver(params = body, extra_headers = {})
      post "/inbound/webhooks/#{hook.uid}", params: params.to_json, headers: { "Content-Type" => "application/json" }.merge(extra_headers)
    end

    it "responde na hora, sem sessão, e deixa o trabalho para o job" do
      expect { deliver }.to have_enqueued_job(Hooks::ProcessRequestJob)

      expect(response).to have_http_status(:ok)
      expect(json).to eq("success" => true)
    end

    it "404 em webhook que não existe" do
      post "/inbound/webhooks/nao-existe", params: "{}", headers: { "Content-Type" => "application/json" }

      expect(response).to have_http_status(:not_found)
    end

    it "400 em corpo que não é JSON" do
      post "/inbound/webhooks/#{hook.uid}", params: "{nao é json", headers: { "Content-Type" => "application/json" }

      expect(response).to have_http_status(:bad_request)
    end

    it "413 em corpo grande demais" do
      deliver({ grande: "a" * Hooks::Capture::MAX_BODY_BYTES })

      expect(response).to have_http_status(:content_too_large)
    end

    it "em teste, guarda o que chegou, com teto, e não executa" do
      hook.update!(status: "test")
      create(:hook_action_contact, hook: hook)

      perform_enqueued_jobs { (Hook::MAX_STORED_PAYLOADS + 2).times { |index| deliver({ telefone: "5531971810932", nome: "n#{index}" }) } }

      hook.reload
      expect(hook.received_payload.length).to eq(Hook::MAX_STORED_PAYLOADS)
      expect(hook.total_request).to eq(Hook::MAX_STORED_PAYLOADS + 2)
      expect(hook.last_payload_fields).to include("body.nome" => "n11")
      expect(Chat.where(organization_id: organization.id.to_s)).not_to exist
      expect(HookLog.for_hook(hook.id).count).to eq(Hook::MAX_STORED_PAYLOADS + 2)
    end

    it "aceita qualquer chave no corpo, inclusive as que o ActiveJob reserva" do
      create(:hook_action_contact, hook: hook)

      expect { perform_enqueued_jobs { deliver(body.merge(_aj_serialized: "x", "_aj_symbol_keys" => [ "y" ])) } }.not_to raise_error

      expect(response).to have_http_status(:ok)
      expect(Chat.where(organization_id: organization.id.to_s)).to exist
    end

    it "desligado, só registra" do
      hook.update!(status: "inactive")

      perform_enqueued_jobs { deliver }

      expect(response).to have_http_status(:ok)
      expect(HookLog.for_hook(hook.id).take).to have_attributes(status: "skipped", hook_status: "inactive")
    end

    it "não guarda cabeçalho com segredo no log" do
      perform_enqueued_jobs { deliver(body, "Authorization" => "Bearer segredo", "X-Pedido" => "42") }

      log = HookLog.for_hook(hook.id).take
      expect(log.request_headers).to include("X-Pedido" => "42")
      expect(log.request_headers.to_json).not_to include("segredo")
    end

    it "corpo grande fica cortado no log, e as ações recebem inteiro" do
      create(:hook_action_contact, hook: hook)
      grande = "a" * (Hooks::Capture::MAX_LOGGED_BODY_BYTES + 10)

      perform_enqueued_jobs { deliver(body.merge(grande: grande)) }

      expect(HookLog.for_hook(hook.id).take.request_body).to include("_truncated" => true)
      expect(Chat.where(organization_id: organization.id.to_s).take.external_id).to eq("5531971810932")
    end

    describe "a assinatura" do
      let!(:secret) { hook.rotate_signing_secret! }
      let(:raw) { body.to_json }

      def signed(timestamp: Time.current.to_i, key: secret, payload: raw)
        {
          Hooks::SignatureVerifier::TIMESTAMP_HEADER => timestamp.to_s,
          Hooks::SignatureVerifier::SIGNATURE_HEADER => Hooks::SignatureVerifier.signature_for(key, timestamp, payload)
        }
      end

      it "aceita a certa, sobre os bytes originais" do
        expect { deliver(body, signed) }.to have_enqueued_job(Hooks::ProcessRequestJob)

        expect(response).to have_http_status(:ok)
      end

      it "recusa a errada, a velha, e sem assinatura, e registra no log" do
        expect { deliver(body, signed(key: "whsec_outra")) }.not_to have_enqueued_job(Hooks::ProcessRequestJob)
        expect(response).to have_http_status(:unauthorized)
        expect(json["error"]["code"]).to eq("invalidSignature")

        deliver(body, signed(timestamp: 1.hour.ago.to_i))
        expect(json["error"]["code"]).to eq("expiredTimestamp")

        deliver
        expect(json["error"]["code"]).to eq("missingSignature")

        expect(HookLog.for_hook(hook.id).where(status: "error", status_code: 401).count).to eq(3)
      end

      it "a chave renovada derruba a anterior na hora" do
        hook.rotate_signing_secret!

        deliver(body, signed)

        expect(response).to have_http_status(:unauthorized)
      end
    end

    describe "as ações" do
      let(:connector) { create(:connector_whatsapp_web, organization: organization) }

      before do
        allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep)
        stub_flow_channel(connector)
        create(:hook_action_contact, hook: hook)
      end

      it "acha ou cria a conversa, nas formas do 9º dígito" do
        existing = create(:chat, organization: organization, external_id: "553171810932")

        perform_enqueued_jobs { deliver }

        expect(existing.reload.user_name).to eq("Fernanda")
        expect(Chat.where(organization_id: organization.id.to_s).count).to eq(1)
        expect(hook.reload.total_request).to eq(1)
        expect(HookLog.for_hook(hook.id).take).to have_attributes(status: "success", hook_status: "active")
      end

      it "registra o erro no log e no alerta, se não vier o telefone" do
        perform_enqueued_jobs { deliver({ nome: "x" }) }

        expect(HookLog.for_hook(hook.id).take).to have_attributes(status: "error", error_message: a_string_including("identificador"))
        expect(organization.organization_alerts.active.for_origin("Hook", hook.id).for_code("webhook_delivery_failed")).to exist
      end

      it "grava campo personalizado" do
        field = create(:custom_field, organization_id: organization.id, name: "Pedido")
        create(:hook_action_user_field, hook: hook, config: { "custom_field_id" => field.id.to_s, "value_template" => "{{body.pedido}}" })

        perform_enqueued_jobs { deliver(body.merge(pedido: "42")) }

        expect(Chat.where(organization_id: organization.id.to_s).take.custom_attributes).to include("pedido" => "42")
      end

      it "iniciar fluxo: liga a conversa ao canal, envia a mensagem e começa o fluxo, com o corpo nas variáveis" do
        flow = published_flow(organization, [ node("t", "trigger_webhook"), node("a", "send_text", text: "Pedido {{vars.webhook.body.pedido}}") ], [ edge("t", "a") ], trigger_type: "webhook")
        create(:hook_action_start_flow, hook: hook, config: { "connector_id" => connector.id.to_s, "flow_id" => flow.id, "message_text" => "Oi {{body.nome}}" })

        perform_enqueued_jobs { deliver(body.merge(pedido: "42")) }

        chat = Chats::Locator.find(connector: connector, phone: "5531971810932")
        expect(chat).to have_attributes(automation_enabled: true)
        expect(sent_texts).to eq([ "Oi Fernanda", "Pedido 42" ])
        expect(FlowExecution.for_chat(organization.id, chat.id).take.context["event"]).to eq("webhook")
      end

      it "o interruptor da organização não deixa começar o fluxo" do
        flow = published_flow(organization, [ node("t", "trigger_webhook"), node("a", "send_text", text: "oi") ], [ edge("t", "a") ], trigger_type: "webhook")
        create(:hook_action_start_flow, hook: hook, config: { "connector_id" => connector.id.to_s, "flow_id" => flow.id })
        organization.update_automation_settings!(automation_enabled: false)

        perform_enqueued_jobs { deliver }

        expect(FlowExecution.where(flow: flow)).not_to exist
      end

      it "um corpo com chave reservada do ActiveJob chega ao fluxo" do
        flow = published_flow(organization, [ node("t", "trigger_webhook"), node("a", "send_text", text: "{{vars.webhook.body._aj_globalid}}") ], [ edge("t", "a") ], trigger_type: "webhook")
        create(:hook_action_start_flow, hook: hook, config: { "connector_id" => connector.id.to_s, "flow_id" => flow.id })

        perform_enqueued_jobs { deliver(body.merge(_aj_globalid: "gid://x")) }

        expect(sent_texts).to eq([ "gid://x" ])
      end

      it "manda os blocos do modo avançado" do
        stub_request(:post, %r{/message/sendMedia/}).to_return(status: 201, body: { key: { id: "M1" } }.to_json, headers: { "Content-Type" => "application/json" })
        create(:hook_action_start_flow, hook: hook, config: {
          "connector_id" => connector.id.to_s,
          "send_mode" => "advanced",
          "message_blocks" => [
            { "type" => "text", "content" => "Oi {{body.nome}}" },
            { "type" => "image", "media_url" => "https://cdn.exemplo.test/a.png", "caption" => "Sua foto" }
          ]
        })

        perform_enqueued_jobs { deliver }

        expect(sent_texts).to eq([ "Oi Fernanda" ])
        expect(ChatMessage::Media.where(media_type: "image").take).to have_attributes(caption: "Sua foto")
      end

      it "o texto da ação chega como foi escrito" do
        create(:hook_action_start_flow, hook: hook, config: { "connector_id" => connector.id.to_s, "message_text" => %(Copo d'água, "gelado" [ver] {{body.nome}}) })

        perform_enqueued_jobs { deliver }

        expect(sent_texts).to eq([ %(Copo d'água, "gelado" [ver] Fernanda) ])
      end

      it "o bloco de texto do modo avançado também" do
        create(:hook_action_start_flow, hook: hook, config: {
          "connector_id" => connector.id.to_s,
          "send_mode" => "advanced",
          "message_blocks" => [ { "type" => "text", "content" => "Copo d'água" } ]
        })

        perform_enqueued_jobs { deliver }

        expect(sent_texts).to eq([ "Copo d'água" ])
      end

      it "anexo citado vai como mídia, e o que sumiu não chega como código e vira alerta" do
        attachment = create(:attachment, organization: organization)
        sent_media = stub_request(:post, %r{/message/sendMedia/}).to_return(status: 201, body: { key: { id: "M1" } }.to_json, headers: { "Content-Type" => "application/json" })
        gone = SecureRandom.uuid
        create(:hook_action_start_flow, hook: hook, config: { "connector_id" => connector.id.to_s, "message_text" => "Segue attachment_id_#{attachment.id} e attachment_id_#{gone} pronto" })

        perform_enqueued_jobs { deliver }

        expect(sent_media).to have_been_requested.once
        expect(sent_texts.join(" ")).not_to include("attachment_id_")
        expect(sent_texts).to eq([ "Segue", "e", "pronto" ])
        expect(organization.organization_alerts.active.for_origin("Hook", hook.id).take.message).to include(gone)
      end

      it "o canal que falha vira alerta, e o resto continua" do
        stub_request(:post, %r{/message/sendText/}).to_return(status: 500, body: "{}")
        create(:hook_action_start_flow, hook: hook, config: { "connector_id" => connector.id.to_s, "message_text" => "Oi" })

        perform_enqueued_jobs { deliver }

        expect(organization.organization_alerts.active.for_origin("Hook", hook.id)).to exist
        expect(HookLog.for_hook(hook.id).take.status).to eq("success")
      end

      it "a próxima entrega boa resolve o alerta" do
        hook.alert_failure!("deu ruim")

        perform_enqueued_jobs { deliver }

        expect(organization.organization_alerts.active.for_origin("Hook", hook.id)).not_to exist
      end

      it "o script vai para a fila scripts, e as ações seguintes esperam por ele" do
        create(:hook_action_code_runner, hook: hook, config: { "code" => "tag.add('pedido-' + params['body.pedido']);" })
        field = create(:custom_field, organization_id: organization.id, name: "Pedido")
        create(:hook_action_user_field, hook: hook, config: { "custom_field_id" => field.id.to_s, "value_template" => "{{body.pedido}}" })

        perform_enqueued_jobs(only: Hooks::ProcessRequestJob) { deliver(body.merge(pedido: "42")) }

        expect(enqueued_jobs.map { |job| [ job["job_class"], job["queue_name"] ] }).to include([ "Hooks::CodeRunnerJob", "scripts" ])
        chat = Chat.where(organization_id: organization.id.to_s).take
        expect(chat.custom_attributes).not_to have_key("pedido")

        perform_enqueued_jobs(only: [ Hooks::CodeRunnerJob, Hooks::ContinueActionsJob ])
        perform_enqueued_jobs(only: Hooks::ContinueActionsJob)

        expect(chat.reload.custom_attributes).to include("pedido" => "42")
        expect(chat.chat_tags.map(&:name)).to eq([ "pedido-42" ])
      end

      it "o erro do script vai para o log e para o alerta" do
        create(:hook_action_code_runner, hook: hook, config: { "code" => "throw new Error('quebrou');" })

        perform_enqueued_jobs { deliver }

        expect(HookLog.for_hook(hook.id).take).to have_attributes(status: "error", error_message: a_string_including("quebrou"))
        expect(organization.organization_alerts.active.for_origin("Hook", hook.id)).to exist
      end

      describe "a ação HTTP" do
        before { stub_public_dns("api.exemplo.test") }

        it "repassa para a URL, com as variáveis" do
          stub = stub_request(:post, "https://api.exemplo.test/pedidos")
                 .with(body: { "cliente" => "Fernanda" }.to_json, headers: { "X-Chave" => "abc" })
                 .to_return(status: 200, body: "{}")
          create(:hook_action_http, hook: hook, config: {
            "url" => "https://api.exemplo.test/pedidos",
            "http_method" => "POST",
            "headers" => [ { "key" => "X-Chave", "value" => "abc" } ],
            "body" => "{\"cliente\":\"{{body.nome}}\"}"
          })

          perform_enqueued_jobs { deliver }

          expect(stub).to have_been_requested
          expect(organization.organization_alerts.active.for_origin("Hook", hook.id)).not_to exist
        end

        it "não alcança a rede interna, e vira alerta" do
          stub_public_dns("interno.exemplo.test", ip: "169.254.169.254")
          create(:hook_action_http, hook: hook, config: { "url" => "http://interno.exemplo.test/latest/meta-data" })

          perform_enqueued_jobs { deliver }

          expect(a_request(:any, /interno/)).not_to have_been_made
          alert = organization.organization_alerts.active.for_origin("Hook", hook.id).for_code("webhook_delivery_failed").take
          expect(alert.message).to eq(I18n.t("automation.hooks.errors.http_destination"))
        end

        it "não alcança a rede interna por variável do corpo" do
          create(:hook_action_http, hook: hook, config: { "url" => "http://{{body.host}}:6379/" })

          perform_enqueued_jobs { deliver(body.merge(host: "127.0.0.1")) }

          expect(a_request(:any, /127\.0\.0\.1/)).not_to have_been_made
        end

        it "um status de erro do destino vira alerta" do
          stub_request(:post, "https://api.exemplo.test/pedidos").to_return(status: 503, body: "")
          create(:hook_action_http, hook: hook)

          perform_enqueued_jobs { deliver }

          expect(organization.organization_alerts.active.for_origin("Hook", hook.id).take.message).to include("503")
        end
      end
    end
  end
end
