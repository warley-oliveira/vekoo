require "rails_helper"

# Templates na WABA: listagem paginada, sincronização com remoção lógica, fallback de idioma
# no envio (erro 132001) e a mídia do cabeçalho.
RSpec.describe Connector::WhatsappCloud do
  include ConnectorHelpers

  let(:organization) { create(:organization) }
  let(:connector) do
    create(:connector_whatsapp_cloud, organization: organization, access_token: "token-da-meta", phone_number_id: 1_234_567_890, waba_id: 555_666_777)
  end
  let(:list_url) { "https://graph.facebook.com/v24.0/555666777/message_templates" }

  def meta_payload(overrides = {})
    {
      "id" => "100",
      "name" => "final_de_semana",
      "language" => "pt_BR",
      "status" => "APPROVED",
      "category" => "MARKETING",
      "components" => [ { "type" => "BODY", "text" => "Olá {{1}}" } ]
    }.merge(overrides)
  end

  # Primeira página da listagem: é a única que vai com `limit` na query.
  def stub_listing(*payloads)
    stub_request(:get, list_url).with(query: hash_including("limit" => "100")).to_return(json_reply({ data: payloads }))
  end

  describe "#fetch_remote_templates" do
    let(:next_url) { "#{list_url}?after=CURSOR&access_token=token-da-meta" }

    it "pede a página com token, limite e os campos que o padrão da Graph API não traz" do
      request = stub_listing(meta_payload)

      expect(connector.fetch_remote_templates).to eq([ meta_payload ])

      expect(request).to have_been_requested
      expect(a_request(:get, list_url).with(query: hash_including(
        "access_token" => "token-da-meta", "limit" => "100", "fields" => a_string_including("quality_score", "sub_category", "components")
      ))).to have_been_made
    end

    it "segue a paginação por cursor em vez de parar na primeira página" do
      stub_request(:get, list_url).with(query: hash_including("limit" => "100"))
        .to_return(json_reply({ data: [ meta_payload ], paging: { next: next_url } }))
      stub_request(:get, next_url).to_return(json_reply({ data: [ meta_payload("id" => "101") ] }))

      expect(connector.fetch_remote_templates.map { |template| template["id"] }).to eq(%w[100 101])
    end

    it "trava contra paginação sem fim" do
      stub_request(:get, list_url).with(query: hash_including("limit" => "100"))
        .to_return(json_reply({ data: [ meta_payload ], paging: { next: next_url } }))
      following = stub_request(:get, next_url).to_return(json_reply({ data: [ meta_payload ], paging: { next: next_url } }))

      expect(connector.fetch_remote_templates.size).to eq(described_class::TEMPLATES_MAX_PAGES)
      expect(following).to have_been_made.times(described_class::TEMPLATES_MAX_PAGES - 1)
    end

    it "repete sem `fields` quando a Graph API os recusa (erro 100)" do
      rejected = stub_request(:get, list_url).with(query: hash_including("fields" => /.+/))
        .to_return(json_reply({ error: { code: 100, message: "campo ruim" } }, status: 400))
      accepted = stub_request(:get, list_url).with(query: hash_including("limit" => "100")) { |request| !request.uri.query_values.key?("fields") }
        .to_return(json_reply({ data: [ meta_payload ] }))

      expect(connector.fetch_remote_templates.size).to eq(1)
      expect(rejected).to have_been_made.once
      expect(accepted).to have_been_made.once
    end

    it "não repete para sempre quando a recusa continua sem `fields`" do
      request = stub_request(:get, list_url).with(query: hash_including({}))
        .to_return(json_reply({ error: { code: 100, message: "campo ruim" } }, status: 400))

      expect { connector.fetch_remote_templates }.to raise_error(/campo ruim/)
      expect(request).to have_been_made.twice
    end

    it "levanta com a mensagem da Meta nas outras falhas" do
      stub_request(:get, list_url).with(query: hash_including({}))
        .to_return(json_reply({ error: { code: 190, message: "token expirado" } }, status: 401))

      expect { connector.fetch_remote_templates }.to raise_error(/token expirado/)
    end

    it "levanta com o status quando a Meta não explica" do
      stub_request(:get, list_url).with(query: hash_including({})).to_return(json_reply({}, status: 503))

      expect { connector.fetch_remote_templates }.to raise_error(/HTTP 503/)
    end

    it "levanta em falha de rede" do
      stub_request(:get, list_url).with(query: hash_including({})).to_timeout

      expect { connector.fetch_remote_templates }.to raise_error(Net::OpenTimeout)
    end

    it "usa o business_id sem WABA" do
      fallback = create(:connector_whatsapp_cloud, organization: organization, waba_id: nil, business_id: 42)
      request = stub_request(:get, "https://graph.facebook.com/v24.0/42/message_templates").with(query: hash_including({})).to_return(json_reply({ data: [] }))

      fallback.fetch_remote_templates

      expect(request).to have_been_requested
    end

    it "levanta sem WABA nem business_id" do
      fallback = create(:connector_whatsapp_cloud, organization: organization, waba_id: nil, business_id: nil)

      expect { fallback.fetch_remote_templates }.to raise_error(/WABA\/business id ausente/)
    end
  end

  describe "#sync_templates" do
    context "com o payload completo da Meta" do
      before do
        stub_listing(meta_payload(
          "sub_category" => "ORDER_STATUS",
          "previous_category" => "UTILITY",
          "correct_category" => "MARKETING",
          "rejected_reason" => "NONE",
          "quality_score" => { "score" => "GREEN" },
          "parameter_format" => "POSITIONAL",
          "message_send_ttl_seconds" => 259_200,
          "library_template_name" => "weekend_promo",
          "cta_url_link_tracking_opted_out" => true
        ))
      end

      it "espelha todo campo que a Meta devolve, não só nome, idioma, categoria e status" do
        connector.sync_templates
        template = connector.whatsapp_templates.find_by(template_id: "100")

        expect(template).to have_attributes(
          name: "final_de_semana",
          language: "pt_BR",
          category: "MARKETING",
          sub_category: "ORDER_STATUS",
          previous_category: "UTILITY",
          correct_category: "MARKETING",
          rejected_reason: "NONE",
          quality_score: { "score" => "GREEN" },
          parameter_format: "POSITIONAL",
          message_send_ttl_seconds: 259_200,
          library_template_name: "weekend_promo",
          cta_url_link_tracking_opted_out: true,
          status_cd: "approved"
        )
        expect(template.last_synced_at).to be_present
      end

      it "resume a rodada" do
        expect(connector.sync_templates).to include(created: 1, updated: 0, removed: 0, total: 1)
      end

      it "conta como inalterado na segunda rodada" do
        connector.sync_templates

        expect(connector.sync_templates).to include(created: 0, updated: 0, unchanged: 1)
      end
    end

    it "conta como atualizado o que mudou na Meta" do
      stub_request(:get, list_url).with(query: hash_including({})).to_return(
        json_reply({ data: [ meta_payload ] }),
        json_reply({ data: [ meta_payload("category" => "UTILITY") ] })
      )

      connector.sync_templates

      expect(connector.sync_templates).to include(created: 0, updated: 1, unchanged: 0)
      expect(connector.whatsapp_templates.find_by(template_id: "100").category).to eq("UTILITY")
    end

    it "não chama a criação na Meta: os dados vêm dela" do
      stub_listing(meta_payload)

      connector.sync_templates

      expect(a_request(:post, /message_templates/)).not_to have_been_made
    end

    it "pula item sem id" do
      stub_listing(meta_payload("id" => nil), meta_payload("id" => "101", "name" => "outro"))

      connector.sync_templates

      expect(connector.whatsapp_templates.pluck(:template_id)).to eq([ "101" ])
    end

    it "grava mesmo com nome e idioma já usados por um template removido" do
      create(:whatsapp_template, connector: connector, template_id: "antigo", name: "final_de_semana", language: "pt_BR", status: :removed)
      stub_listing(meta_payload)

      expect { connector.sync_templates }.not_to raise_error
      expect(connector.whatsapp_templates.find_by(template_id: "100")).to be_approved
    end

    context "com status que o SDK não conhece (PAUSED, DISABLED...)" do
      before { stub_listing(meta_payload("status" => "PAUSED"), meta_payload("id" => "101", "name" => "outro")) }

      it "grava o status em vez de explodir e pular o resto da lista" do
        expect { connector.sync_templates }.not_to raise_error

        expect(connector.whatsapp_templates.find_by(template_id: "100").status_cd).to eq("paused")
        expect(connector.whatsapp_templates.find_by(template_id: "101")).to be_present
      end
    end

    context "com um template que não existe mais na WABA" do
      let!(:orphan) { create(:whatsapp_template, connector: connector, template_id: "999", name: "antigo") }

      before { stub_listing(meta_payload) }

      it "marca como removido em vez de apagar o documento" do
        connector.sync_templates

        expect(WhatsappTemplate.where(template_id: "999").count).to eq(1)
        orphan.reload
        expect(orphan.status_cd).to eq("removed")
        expect(orphan.removed_at).to be_present
        expect(WhatsappTemplate.find(orphan.id)).to eq(orphan)
      end

      it "conta a remoção no resumo" do
        expect(connector.sync_templates).to include(removed: 1)
      end

      it "tira do escopo .available e põe no .removed" do
        connector.sync_templates

        expect(connector.whatsapp_templates.available.map(&:template_id)).to eq([ "100" ])
        expect(connector.whatsapp_templates.removed.map(&:template_id)).to eq([ "999" ])
      end

      it "não conta de novo quem já estava removido" do
        connector.sync_templates

        expect(connector.sync_templates).to include(removed: 0)
      end

      it "restaura quando o template volta para a WABA" do
        connector.sync_templates
        stub_listing(meta_payload, meta_payload("id" => "999", "name" => "antigo"))

        connector.sync_templates

        orphan.reload
        expect(orphan.status_cd).to eq("approved")
        expect(orphan.removed_at).to be_nil
      end
    end

    it "não mexe em template local que ainda não tem id na Meta" do
      draft = create(:whatsapp_template, connector: connector, template_id: nil, name: "rascunho")
      stub_listing(meta_payload)

      connector.sync_templates

      expect(draft.reload).to be_approved
    end

    context "quando a listagem falha" do
      let!(:existing) { create(:whatsapp_template, connector: connector, template_id: "999", name: "antigo") }

      it "levanta sem marcar a base inteira como removida" do
        stub_request(:get, list_url).with(query: hash_including({})).to_raise(Net::ReadTimeout)

        expect { connector.sync_templates }.to raise_error(Net::ReadTimeout)
        expect(existing.reload.status_cd).to eq("approved")
      end

      it "também quando a falha é no meio da paginação" do
        next_url = "#{list_url}?after=CURSOR"
        stub_request(:get, list_url).with(query: hash_including("limit" => "100"))
          .to_return(json_reply({ data: [ meta_payload ], paging: { next: next_url } }))
        stub_request(:get, next_url).to_return(json_reply({ error: { code: 1, message: "fora do ar" } }, status: 500))

        expect { connector.sync_templates }.to raise_error(/fora do ar/)
        expect(existing.reload.status_cd).to eq("approved")
      end
    end

    context "com template de outro conector" do
      let(:other_connector) { create(:connector_whatsapp_cloud, organization: organization) }
      let!(:other_template) { create(:whatsapp_template, connector: other_connector, template_id: "777", name: "de_outra_waba") }

      before { stub_listing(meta_payload) }

      it "não toca no que é de outro conector" do
        connector.sync_templates

        expect(other_template.reload.status_cd).to eq("approved")
      end

      it "não confunde template de mesmo id em outro conector" do
        stub_listing(meta_payload("id" => "777", "name" => "aqui"))

        connector.sync_templates

        expect(other_template.reload.name).to eq("de_outra_waba")
        expect(connector.whatsapp_templates.find_by(template_id: "777").name).to eq("aqui")
      end
    end
  end

  describe "#business_templates" do
    it "lista pelo SDK, na WABA do conector" do
      request = stub_request(:get, "https://graph.facebook.com/v19.0/555666777/message_templates?limit=100").to_return(json_reply({ data: [] }))

      connector.business_templates

      expect(request).to have_been_requested
    end
  end

  describe "#send_template_message" do
    let(:chat) { create(:chat, connector: connector, external_id: "5511999999999") }
    let(:template) { create(:whatsapp_template, connector: connector, name: "final_de_semana", language: "pt_BR") }
    let(:messages_url) { "https://graph.facebook.com/v19.0/1234567890/messages" }
    let(:delivered) { json_reply({ messages: [ { id: "wamid.T" } ] }) }

    def error(code, message = "boom")
      json_reply({ error: { code: code, message: message } }, status: 404)
    end

    def stub_send(language, reply)
      stub_request(:post, messages_url)
        .with(body: hash_including("template" => hash_including("name" => "final_de_semana", "language" => { "code" => language })))
        .to_return(reply)
    end

    context "quando o template existe no idioma pedido" do
      it "envia uma vez e não consulta a lista de templates" do
        request = stub_send("pt_BR", delivered)

        response = connector.send_template_message(template, [], chat)

        expect(Connectors::ExternalId.from(response)).to eq("wamid.T")
        expect(request).to have_been_made.once
        expect(a_request(:get, list_url).with(query: hash_including({}))).not_to have_been_made
      end

      it "manda para o número da conversa" do
        stub_send("pt_BR", delivered)

        connector.send_template_message(template, [], chat)

        expect(a_request(:post, messages_url).with(body: hash_including("to" => 5_511_999_999_999, "type" => "template"))).to have_been_made
      end

      it "sai pelo número de origem da conversa quando ela tem um" do
        chat.set(sender_phone_number_id: 999)
        request = stub_request(:post, "https://graph.facebook.com/v19.0/999/messages").to_return(delivered)

        connector.send_template_message(template, [], chat)

        expect(request).to have_been_requested
      end
    end

    context "quando a Meta responde 132001 (tradução não existe)" do
      before do
        stub_listing(
          { "id" => "1", "name" => "final_de_semana", "language" => "pt", "status" => "APPROVED" },
          { "id" => "2", "name" => "outro", "language" => "en", "status" => "APPROVED" },
          { "id" => "3", "name" => "final_de_semana", "language" => "es", "status" => "REJECTED" }
        )
        stub_send("pt_BR", error(132_001, "tradução não existe"))
      end

      it "repete no idioma que a Meta informa e corrige o registro local" do
        request = stub_send("pt", delivered)

        response = connector.send_template_message(template, [], chat)

        expect(Connectors::ExternalId.from(response)).to eq("wamid.T")
        expect(request).to have_been_requested
        expect(template.reload.language).to eq("pt")
      end

      it "só tenta idiomas aprovados deste mesmo template" do
        stub_send("pt", delivered)

        connector.send_template_message(template, [], chat)

        expect(a_request(:post, messages_url).with(body: hash_including("template" => hash_including("language" => { "code" => "en" })))).not_to have_been_made
        expect(a_request(:post, messages_url).with(body: hash_including("template" => hash_including("language" => { "code" => "es" })))).not_to have_been_made
      end

      it "corrigir o idioma não dispara a atualização na Meta" do
        stub_send("pt", delivered)
        template.sync_update = true

        connector.send_template_message(template, [], chat)

        expect(a_request(:post, "https://graph.facebook.com/v19.0/#{template.template_id}")).not_to have_been_made
      end

      it "devolve o erro original quando nenhum idioma funciona, sem mexer no registro" do
        stub_send("pt", error(132_001, "também não"))

        response = connector.send_template_message(template, [], chat)

        expect(response.error.message).to eq("tradução não existe")
        expect(template.reload.language).to eq("pt_BR")
      end
    end

    context "quando a lista de templates não pode ser lida" do
      before do
        stub_request(:get, list_url).with(query: hash_including({})).to_raise(Net::ReadTimeout)
        stub_send("pt_BR", error(132_001))
      end

      it "tenta os locales irmãos do idioma configurado, na ordem" do
        stub_send("pt", error(132_001))
        request = stub_send("pt_PT", delivered)

        response = connector.send_template_message(template, [], chat)

        expect(Connectors::ExternalId.from(response)).to eq("wamid.T")
        expect(request).to have_been_requested
        expect(template.reload.language).to eq("pt_PT")
      end

      it "desiste com idioma sem irmãos conhecidos" do
        template.set(language: "ja")
        request = stub_send("ja", error(132_001, "sem tradução"))

        expect(connector.send_template_message(template, [], chat).error.message).to eq("sem tradução")
        expect(request).to have_been_made.once
      end
    end

    context "quando o erro não tem a ver com a tradução" do
      it "não tenta outros idiomas" do
        request = stub_send("pt_BR", error(131_047, "fora da janela"))

        response = connector.send_template_message(template, [], chat)

        expect(response.error.code).to eq(131_047)
        expect(request).to have_been_made.once
        expect(a_request(:get, list_url).with(query: hash_including({}))).not_to have_been_made
      end
    end
  end

  describe "#prepare_template_components" do
    let(:public_url) { "https://arquivos.vekoo.app/banner.jpg" }
    let(:meta_cdn_url) { "https://scontent.whatsapp.net/v/t61.29466-34/banner.jpg?ccb=1-7&oh=01_Q5Aa5&oe=6AA411FB" }

    def media_template(example: { "header_handle" => [ meta_cdn_url ] }, format: "IMAGE", **attributes)
      create(:whatsapp_template, connector: connector, name: "promo_fds", components: [ { "type" => "HEADER", "format" => format, "example" => example } ], **attributes)
    end

    context "com cabeçalho de mídia" do
      let(:template) { media_template(header_media_url: public_url) }

      it "monta o cabeçalho com a URL pública, não com o CDN da Meta" do
        expect(connector.prepare_template_components(template, []).first).to eq(
          "type" => "header",
          "parameters" => [ { "type" => "image", "image" => { "link" => public_url } } ]
        )
      end

      it "mantém os componentes da tela depois do cabeçalho" do
        body = { "type" => "body", "parameters" => [ { "type" => "text", "text" => "Warley" } ] }

        expect(connector.prepare_template_components(template, [ body ]).last).to eq(body)
      end

      it "não altera o que a tela mandou" do
        components = [ { "type" => "body" } ]

        connector.prepare_template_components(template, components)

        expect(components).to eq([ { "type" => "body" } ])
      end

      { "VIDEO" => "video", "DOCUMENT" => "document" }.each do |format, type|
        it "monta #{format} no parâmetro #{type}" do
          video = media_template(format: format, header_media_url: public_url)

          expect(connector.prepare_template_components(video, []).first["parameters"]).to eq([ { "type" => type, type => { "link" => public_url } } ])
        end
      end
    end

    context "sem origem pública para a mídia" do
      let(:template) { media_template }

      it "omite o cabeçalho em vez de mandar um link que falha com 131053" do
        expect(connector.prepare_template_components(template, [])).to be_empty
      end

      it "registra no log por que o cabeçalho faltou" do
        expect(captured_log { connector.prepare_template_components(template, []) }).to include("nenhuma URL pública de mídia")
      end
    end

    context "quando a tela já mandou um cabeçalho" do
      let(:components) { [ { "type" => "HEADER", "parameters" => [ { "type" => "image", "image" => { "link" => "https://cdn/x.jpg" } } ] } ] }

      it "não mexe nele" do
        expect(connector.prepare_template_components(media_template(header_media_url: public_url), components)).to eq(components)
      end
    end

    context "com cabeçalho de texto" do
      let(:template) { create(:whatsapp_template, connector: connector, components: [ { "type" => "HEADER", "format" => "TEXT", "text" => "Oi" } ]) }

      it "devolve os componentes da tela como vieram" do
        expect(connector.prepare_template_components(template, [])).to be_empty
      end
    end

    it "o envio leva o cabeçalho montado até a Meta" do
      chat = create(:chat, connector: connector, external_id: "5511999999999")
      stub_request(:post, "https://graph.facebook.com/v19.0/1234567890/messages").to_return(json_reply({ messages: [ { id: "wamid.T" } ] }))

      connector.send_template_message(media_template(header_media_url: public_url), [], chat)

      expect(a_request(:post, "https://graph.facebook.com/v19.0/1234567890/messages").with(body: hash_including(
        "template" => hash_including("components" => [ { "type" => "header", "parameters" => [ { "type" => "image", "image" => { "link" => public_url } } ] } ])
      ))).to have_been_made
    end
  end
end
