require "rails_helper"

# Origem: spec/services/campaigns/{send_recipient_service_media,send_recipient_service_number_resolution}_spec.rb
# e a parte de envio de batch_execution_service_spec.rb. Aqui a conversa, a mensagem e o destinatário
# são de verdade, e só o provedor é simulado.
RSpec.describe Outreach::SendRecipientService do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_web, organization: organization) }
  let(:campaign) { create(:outreach_campaign, :running, organization: organization, connector_ids: [ connector.id.to_s ], name: "Campanha de Natal") }
  let(:phone) { "5531971810932" }
  let(:recipient) { create(:outreach_recipient, campaign: campaign, phone: phone, name: "Maria") }
  let(:batch) { build_batch(campaign, [ recipient ], connector: connector) }

  before { allow(Connector::WhatsappWeb::Providers::Base).to receive(:sleep) }

  def deliver(target = recipient, on: connector, in_batch: batch)
    taken = claimed(target, connector: on)
    described_class.new(recipient: taken, campaign: campaign.reload, batch: in_batch, connector: on).call
    target.reload
  end

  def messages_of(chat)
    ChatMessage::Base.unscoped.where(chat_id: chat.id).to_a
  end

  describe "texto" do
    before { stub_channel_working(connector) }

    it "envia pela conversa e conta" do
      expect(deliver).to have_attributes(status_cd: "sent", whatsapp_message_id: "EVO-1", sent_at: be_present)
      expect(campaign.reload.sent_count).to eq(1)
    end

    it "manda o texto com as variáveis preenchidas" do
      deliver

      expect(a_request(:post, evolution_text_url(connector)).with { |request| JSON.parse(request.body)["text"] == "Olá Maria" }).to have_been_made.once
    end

    it "marca a mensagem do histórico com a campanha e assina com o nome dela" do
      deliver

      chat = Chat.where(connector_id: connector.id).take
      expect(messages_of(chat).first).to have_attributes(campaign_id: campaign.id.to_s, sender_name: "Campanha de Natal", content: "Olá Maria", message_id: "EVO-1")
    end

    it "grava a conversa no destinatário" do
      deliver

      expect(recipient.reload.chat_id).to eq(Chat.where(connector_id: connector.id).take.id.to_s)
    end

    it "sobe a conversa na lista" do
      chat = create(:chat, connector: connector, organization_id: organization.id, external_id: phone, last_message_at: 3.days.ago)

      deliver

      expect(chat.reload.last_message_at).to be > 1.minute.ago
    end

    context "quando a campanha não sobe as conversas" do
      before { campaign.set(raise_chats: false) }

      it "envia e não sobe a conversa" do
        chat = create(:chat, connector: connector, organization_id: organization.id, external_id: phone, last_message_at: 3.days.ago)

        expect(deliver).to have_attributes(status_cd: "sent", whatsapp_message_id: "EVO-1")
        expect(chat.reload.last_message_at).to be < 1.month.ago
      end

      it "sem id do canal, fica falho" do
        stub_request(:post, evolution_text_url(connector)).to_return(status: 500, body: "fora do ar")

        expect(deliver).to have_attributes(status_cd: "failed", error_code: "whatsappError")
        expect(campaign.reload.failed_count).to eq(1)
      end
    end

    describe "rodízio de mensagens" do
      before { campaign.set(messages: [ "Primeira", "", "Segunda" ]) }

      def text_sent_at(position)
        batch.set(position_offset: position)
        target = create(:outreach_recipient, campaign: campaign)
        batch.set(recipient_ids: [ target.id ])
        deliver(target)

        JSON.parse(WebMock::RequestRegistry.instance.requested_signatures.hash.keys.select { |signature| signature.uri.to_s.include?("sendText") }.last.body)["text"]
      end

      it "alterna pela posição no canal, ignorando as vazias" do
        expect(text_sent_at(0)).to eq("Primeira")
        expect(text_sent_at(1)).to eq("Segunda")
        expect(text_sent_at(2)).to eq("Primeira")
      end
    end
  end

  # Resolução do 9º dígito. Celulares antigos de DDD >= 31 têm JID sem o 9 (`554888314715`), mas a
  # base importa o número completo (`5548988314715`).
  describe "resolução do número" do
    let(:phone) { "5548988314715" }
    let(:without_nine) { "554888314715" }

    before { stub_text_accepted(connector) }

    context "quando o provedor confirma a forma sem o 9" do
      before { stub_number_check(connector, only: without_nine) }

      it "envia para o número que existe" do
        deliver

        expect(a_request(:post, evolution_text_url(connector)).with { |request| JSON.parse(request.body)["number"].start_with?(without_nine) }).to have_been_made.once
      end

      it "abre a conversa no número resolvido" do
        deliver

        expect(Chat.where(connector_id: connector.id).pluck(:external_id)).to eq([ without_nine ])
      end

      it "marca como enviado" do
        expect(deliver.status_cd).to eq("sent")
      end

      # Reaproveitar a variante repetiria o envio para o número errado.
      it "não reaproveita a conversa da outra forma do número" do
        create(:chat, connector: connector, organization_id: organization.id, external_id: phone)

        deliver

        expect(Chat.where(connector_id: connector.id).pluck(:external_id)).to contain_exactly(phone, without_nine)
      end

      it "reaproveita a conversa na forma exata, com ou sem o sufixo" do
        chat = create(:chat, connector: connector, organization_id: organization.id, external_id: "#{without_nine}@s.whatsapp.net")

        deliver

        expect(Chat.where(connector_id: connector.id).count).to eq(1)
        expect(recipient.reload.chat_id).to eq(chat.id.to_s)
      end
    end

    context "quando nenhuma forma do número existe no WhatsApp" do
      before { stub_number_check(connector, only: []) }

      it "falha com o motivo próprio" do
        expect(deliver).to have_attributes(status_cd: "failed", error_code: "numberNotFound")
      end

      it "não cria conversa para um número que não existe" do
        deliver

        expect(Chat.where(connector_id: connector.id).count).to eq(0)
      end

      it "conta como falho" do
        deliver

        expect(campaign.reload.failed_count).to eq(1)
      end

      it "não chega a tentar enviar" do
        deliver

        expect(a_request(:post, evolution_text_url(connector))).not_to have_been_made
      end
    end

    context "quando o envio falha por outro motivo" do
      before do
        stub_number_check(connector)
        stub_request(:post, evolution_text_url(connector)).to_return(status: 500, body: "fora do ar")
      end

      it "fica com o motivo genérico" do
        expect(deliver).to have_attributes(status_cd: "failed", error_code: "whatsappError")
      end

      # Um timeout de leitura não diz se a mensagem saiu: repetir mandaria duas vezes.
      it "não repete o envio" do
        deliver

        expect(a_request(:post, evolution_text_url(connector))).to have_been_made.once
      end
    end

    context "quando o provedor demora a responder um envio que pode ter saído" do
      before do
        stub_number_check(connector)
        stub_request(:post, evolution_text_url(connector)).to_raise(Net::ReadTimeout)
      end

      it "fica falho, sem repetir" do
        expect(deliver).to have_attributes(status_cd: "failed", error_code: "whatsappError", dispatched_at: be_present)
        expect(a_request(:post, evolution_text_url(connector))).to have_been_made.once
      end

      it "a regra vale só para o envio de campanha: o resto do provedor segue repetindo" do
        deliver
        attempts = 0

        expect {
          Connector::WhatsappWeb::Providers::Base.with_retry(label: "x") do
            attempts += 1
            raise "falhou"
          end
        }.to raise_error("falhou")

        expect(attempts).to eq(3)
      end
    end

    # O provedor caiu: nada saiu, e o destinatário não tem culpa.
    context "quando a consulta do número falha" do
      before { stub_request(:post, evolution_numbers_url(connector)).to_return(status: 500, body: "erro") }

      it "volta para a fila, sem enviar e sem contar" do
        expect(deliver).to have_attributes(status_cd: "pending", claim_token: nil, dispatched_at: nil)
        expect(a_request(:post, evolution_text_url(connector))).not_to have_been_made
        expect(campaign.reload).to have_attributes(sent_count: 0, failed_count: 0)
      end

      it "diz que o problema é do canal" do
        taken = claimed(recipient, connector: connector)
        service = described_class.new(recipient: taken, campaign: campaign.reload, batch: batch, connector: connector)

        service.call

        expect(service.channel_trouble?).to be(true)
      end
    end

    context "quando o provedor não consulta números (AIVA)" do
      let(:connector) { create(:connector_whatsapp_web, :aiva, organization: organization) }

      before { stub_request(:post, "http://aiva.test/message/sendText/#{connector.instance_name}").to_return(status: 201, body: { key: { id: "AIVA-1" } }.to_json, headers: OutreachHelpers::JSON_HEADERS) }

      it "não consulta, e reaproveita a conversa da outra forma do número" do
        inbound = create(:chat, connector: connector, organization_id: organization.id, external_id: "#{without_nine}@s.whatsapp.net")

        deliver

        expect(a_request(:post, %r{chat/whatsappNumbers})).not_to have_been_made
        expect(Chat.where(connector_id: connector.id).count).to eq(1)
        expect(recipient.reload.chat_id).to eq(inbound.id.to_s)
      end

      it "com as duas formas gravadas, prefere a exata" do
        exact = create(:chat, connector: connector, organization_id: organization.id, external_id: phone, last_message_at: 2.days.ago)
        create(:chat, connector: connector, organization_id: organization.id, external_id: without_nine, last_message_at: 1.hour.ago)

        deliver

        expect(recipient.reload.chat_id).to eq(exact.id.to_s)
      end

      it "não reaproveita a conversa de outro canal" do
        other = create(:connector_whatsapp_web, :aiva, organization: organization)
        create(:chat, connector: other, organization_id: organization.id, external_id: without_nine)

        deliver

        expect(Chat.where(connector_id: connector.id).count).to eq(1)
      end
    end
  end

  # Antes era um assistente: `flow_id` diz qual fluxo atende quem responder à campanha.
  describe "quem responde" do
    before { stub_channel_working(connector) }

    let(:flow_id) { SecureRandom.uuid }

    context "com fluxo na campanha" do
      before { campaign.set(flow_id: flow_id) }

      it "marca a conversa nova com o fluxo" do
        deliver

        expect(Chat.where(connector_id: connector.id).take.outreach_flow_id).to eq(flow_id)
      end

      it "conversa nova já nasce com automação, mesmo com a organização desligada por padrão" do
        organization.update_automation_settings!(default_automation_enabled: false)

        deliver

        expect(Chat.where(connector_id: connector.id).take.automation_enabled).to be(true)
      end

      it "conversa que já existe recebe o fluxo e mantém o que a pessoa decidiu sobre a automação" do
        chat = create(:chat, connector: connector, organization_id: organization.id, external_id: phone, automation_enabled: false)

        deliver

        expect(chat.reload).to have_attributes(outreach_flow_id: flow_id, automation_enabled: false)
      end
    end

    context "sem fluxo na campanha" do
      it "a conversa nova herda o padrão da organização" do
        organization.update_automation_settings!(default_automation_enabled: false)

        deliver

        expect(Chat.where(connector_id: connector.id).take).to have_attributes(automation_enabled: false, outreach_flow_id: nil)
      end

      it "não apaga o fluxo de uma campanha anterior" do
        chat = create(:chat, connector: connector, organization_id: organization.id, external_id: phone, outreach_flow_id: flow_id)

        deliver

        expect(chat.reload.outreach_flow_id).to eq(flow_id)
      end
    end
  end

  describe "dados da conversa" do
    before { stub_channel_working(connector) }

    let(:enrichment) do
      { "place_id" => "lugar-123", "city" => "Belo Horizonte", "category_name" => "Restaurante", "promocao" => "fora daqui" }
    end

    it "uma conversa nova nasce com os dados do estabelecimento" do
      recipient.set(custom_variables: enrichment)

      deliver

      expect(Chat.where(connector_id: connector.id).take.contact_storage).to eq("place_id" => "lugar-123", "city" => "Belo Horizonte", "category_name" => "Restaurante")
    end

    it "junta os dados em uma conversa que já existe" do
      chat = create(:chat, connector: connector, organization_id: organization.id, external_id: phone, contact_storage: { "website" => "https://antigo.exemplo.com.br" })
      recipient.set(custom_variables: enrichment)

      deliver

      expect(chat.reload.contact_storage).to include("website" => "https://antigo.exemplo.com.br", "place_id" => "lugar-123", "city" => "Belo Horizonte")
    end

    it "variáveis soltas não entram nos dados da conversa" do
      recipient.set(custom_variables: { "cupom" => "NATAL10" })

      deliver

      expect(Chat.where(connector_id: connector.id).take.contact_storage).to eq({})
    end

    it "põe as etiquetas da campanha, sem repetir" do
      tag = create(:chat_tag, organization_id: organization.id)
      campaign.set(chat_tag_ids: [ tag.id.to_s ])
      chat = create(:chat, connector: connector, organization_id: organization.id, external_id: phone, chat_tag_ids: [ tag.id ])

      deliver

      expect(chat.reload.chat_tag_ids).to eq([ tag.id ])

      other_tag = create(:chat_tag, organization_id: organization.id)
      campaign.set(chat_tag_ids: [ tag.id.to_s, other_tag.id.to_s ])
      second = create(:outreach_recipient, campaign: campaign, phone: phone.sub("932", "000"))
      deliver(second, in_batch: build_batch(campaign, [ second ], connector: connector))

      expect(Chat.where(connector_id: connector.id, external_id: second.phone).take.chat_tag_ids).to contain_exactly(tag.id, other_tag.id)
    end
  end

  describe "o que conta como problema do canal" do
    def trouble_after
      taken = claimed(recipient, connector: connector)
      service = described_class.new(recipient: taken, campaign: campaign.reload, batch: batch, connector: connector)
      service.call
      service.channel_trouble?
    end

    it "um envio que funcionou não conta" do
      stub_channel_working(connector)

      expect(trouble_after).to be(false)
    end

    it "número que não existe não conta: a consulta respondeu" do
      stub_number_check(connector, only: [])

      expect(trouble_after).to be(false)
    end

    it "o canal recusar conta" do
      stub_number_check(connector)
      stub_request(:post, evolution_text_url(connector)).to_return(status: 500, body: "fora do ar")

      expect(trouble_after).to be(true)
    end
  end

  describe "variáveis do texto" do
    before { stub_channel_working(connector) }

    def text_with(message, **variables)
      campaign.set(messages: [ message ])
      recipient.set(custom_variables: variables.stringify_keys)
      deliver

      JSON.parse(WebMock::RequestRegistry.instance.requested_signatures.hash.keys.find { |signature| signature.uri.to_s.include?("sendText") }.body)["text"]
    end

    it "troca nome, telefone e as próprias do destinatário" do
      expect(text_with("{{nome}} {{name}} {{telefone}} {{phone}} {{cupom}}", cupom: "NATAL10")).to eq("Maria Maria #{phone} #{phone} NATAL10")
    end

    # As chaves chegam em snake_case da API, e a pessoa escreve como quer.
    it "acha a variável escrita com maiúscula" do
      expect(text_with("Seu {{Cupom}} chegou", cupom: "NATAL10")).to eq("Seu NATAL10 chegou")
    end

    it "aceita espaço dentro das chaves" do
      expect(text_with("Oi {{ nome }}")).to eq("Oi Maria")
    end

    it "um valor com {{algo}} não é trocado de novo" do
      expect(text_with("{{apelido}}", apelido: "{{telefone}}")).to eq("{{telefone}}")
    end

    it "o que não existe fica como veio" do
      expect(text_with("Oi {{sumiu}}")).to eq("Oi {{sumiu}}")
    end
  end

  describe "idempotência" do
    before { stub_channel_working(connector) }

    # A consulta do número pode levar minutos. Nesse meio-tempo a pessoa pausa.
    it "se a campanha foi pausada depois de o passo começar, não envia e devolve o destinatário" do
      taken = claimed(recipient, connector: connector)
      stale = Outreach::Campaign.find(campaign.id)
      Outreach::Lifecycle.new(Outreach::Campaign.find(campaign.id)).pause

      described_class.new(recipient: taken, campaign: stale, batch: batch, connector: connector).call

      expect(a_request(:post, evolution_text_url(connector))).not_to have_been_made
      expect(recipient.reload).to have_attributes(status_cd: "pending", dispatched_at: nil)
    end

    it "se foi cancelada, o destinatário fica como ignorado" do
      taken = claimed(recipient, connector: connector)
      stale = Outreach::Campaign.find(campaign.id)
      Outreach::Lifecycle.new(Outreach::Campaign.find(campaign.id)).cancel

      described_class.new(recipient: taken, campaign: stale, batch: batch, connector: connector).call

      expect(a_request(:post, evolution_text_url(connector))).not_to have_been_made
      expect(recipient.reload.status_cd).to eq("skipped")
    end

    it "erro de banco sobe para o job: quem resolve é a recuperação" do
      allow(Chat).to receive(:where).and_raise(Mongo::Error::SocketError, "caiu")
      taken = claimed(recipient, connector: connector)

      expect { described_class.new(recipient: taken, campaign: campaign, batch: batch, connector: connector).call }.to raise_error(Mongo::Error::SocketError)
      expect(recipient.reload.status_cd).to eq("sending")
    end

    it "grava que vai despachar antes de falar com o canal" do
      moment = nil
      stub_request(:post, evolution_text_url(connector)).to_return do
        moment = recipient.reload.dispatched_at
        { status: 201, body: { key: { id: "EVO-1" } }.to_json, headers: OutreachHelpers::JSON_HEADERS }
      end

      deliver

      expect(moment).to be_present
    end

    it "se a recuperação já devolveu o destinatário, não envia" do
      taken = claimed(recipient, connector: connector)
      Outreach::Recipient.where(_id: recipient.id).find_one_and_update("$set" => { status_cd: "pending" }, "$unset" => { claim_token: true })

      described_class.new(recipient: taken, campaign: campaign, batch: batch, connector: connector).call

      expect(a_request(:post, evolution_text_url(connector))).not_to have_been_made
      expect(recipient.reload.status_cd).to eq("pending")
      expect(campaign.reload).to have_attributes(sent_count: 0, failed_count: 0)
    end

    it "um erro do canal nunca sobe: a campanha precisa seguir para o próximo" do
      stub_request(:post, evolution_text_url(connector)).to_timeout

      expect { deliver }.not_to raise_error
      expect(recipient.reload.status_cd).to eq("failed")
    end
  end

  describe "mídia" do
    let(:attachment_url) { "https://arquivos.vekoo.app/kjh2l3kj4h23" }
    let(:attachment) { Struct.new(:id, :file_url, :name, :file).new("anexo-1", attachment_url, "promo.png", nil) }

    before do
      campaign.set(message_type_cd: "media", attachment_id: "anexo-1", media_url: "https://arquivos.vekoo.app/url-velha", media_content_type: "image/png", media_file_name: "promo.png", messages: [ "Olha, {{nome}}" ])
      allow(Media::AttachmentLookup).to receive_messages(find: attachment, from_file_url: nil)
      stub_number_check(connector)
    end

    def stub_media(reply)
      stub_request(:post, evolution_media_url(connector)).to_return(reply)
    end

    def accepted(id = "3EB0ABC")
      { status: 201, body: { key: { id: id } }.to_json, headers: OutreachHelpers::JSON_HEADERS }
    end

    it "envia a URL recalculada do anexo, não o retrato guardado" do
      stub_media(accepted)

      deliver

      expect(a_request(:post, evolution_media_url(connector)).with { |request| JSON.parse(request.body)["media"] == attachment_url }).to have_been_made.once
    end

    it "grava a mesma URL no histórico" do
      stub_media(accepted)

      deliver

      message = ChatMessage::Base.unscoped.where(chat_id: recipient.reload.chat_id).take
      expect(message).to have_attributes(media_url: attachment_url, campaign_id: campaign.id.to_s, sender_name: "Campanha de Natal")
    end

    it "manda a legenda com as variáveis" do
      stub_media(accepted)

      deliver

      expect(a_request(:post, evolution_media_url(connector)).with { |request| JSON.parse(request.body)["caption"] == "Olha, Maria" }).to have_been_made.once
    end

    it "documento não leva legenda" do
      campaign.set(media_content_type: "application/pdf", media_file_name: "tabela.pdf")
      stub_media(accepted)

      deliver

      expect(a_request(:post, evolution_media_url(connector)).with { |request| !JSON.parse(request.body).key?("caption") }).to have_been_made.once
    end

    it "guarda o id que veio em key.id" do
      stub_media(accepted)

      expect(deliver).to have_attributes(status_cd: "sent", whatsapp_message_id: "3EB0ABC")
    end

    it "quando o provedor aceita sem devolver id, conta como enviado" do
      stub_media({ status: 201, body: "", headers: OutreachHelpers::JSON_HEADERS })
      stub_request(:post, %r{chat/findMessages}).to_return(status: 200, body: {}.to_json, headers: OutreachHelpers::JSON_HEADERS)

      expect(deliver).to have_attributes(status_cd: "sent", whatsapp_message_id: nil)
    end

    it "quando o canal recusa, fica falho, sem repetir e sem mostrar o corpo cru do provedor" do
      stub_media({ status: 500, body: "fora do ar" })

      expect(deliver).to have_attributes(status_cd: "failed", error_code: "whatsappError", error_message: nil)
      expect(campaign.reload.failed_count).to eq(1)
      expect(a_request(:post, evolution_media_url(connector))).to have_been_made.once
    end

    it "quando a Evolution responde que o número não existe, usa o motivo próprio" do
      stub_media({ status: 400, body: { response: { message: [ { exists: false, number: phone } ] } }.to_json, headers: OutreachHelpers::JSON_HEADERS })

      expect(deliver).to have_attributes(status_cd: "failed", error_code: "numberNotFound")
    end

    context "sem URL pública" do
      before { allow(Media::AttachmentLookup).to receive(:find).and_return(nil) }

      before { campaign.set(media_url: nil) }

      it "falha em vez de mandar um link que ninguém baixa" do
        expect(deliver).to have_attributes(status_cd: "failed", error_code: "mediaUnavailable")
      end

      it "nunca chega ao canal" do
        deliver

        expect(a_request(:post, evolution_media_url(connector))).not_to have_been_made
      end
    end

    it "a mídia só sai pelo WhatsApp Web, sem chamada externa" do
      cloud = create(:connector_whatsapp_cloud, organization: organization)

      expect(deliver(on: cloud)).to have_attributes(status_cd: "failed", error_code: "mediaUnsupported")
      expect(WebMock).not_to have_requested(:post, /graph\.facebook\.com/)
    end

    it "não subir as conversas vale também para a mídia" do
      campaign.set(raise_chats: false)
      stub_media(accepted)

      deliver

      expect(Chat.where(connector_id: connector.id).take.last_message_at).to be < 1.month.ago
    end
  end

  describe "modelo da WABA" do
    let(:waba) { create(:connector_whatsapp_cloud, organization: organization) }
    let(:phone_number_id) { "783297291536841" }
    let(:graph_url) { "https://graph.facebook.com/v19.0/#{phone_number_id}/messages" }
    let(:template) { create(:whatsapp_template, connector: waba, name: "boas_vindas", components: [ { "type" => "BODY", "text" => "Olá {{1}}, segmento {{2}}" } ]) }
    let(:campaign) { create(:outreach_campaign, :running, organization: organization, name: "Campanha de Natal") }
    let(:recipient) { create(:outreach_recipient, campaign: campaign, phone: phone, name: "Maria", custom_variables: { "segment" => "vip" }) }
    let(:batch) { build_batch(campaign, [ recipient ], connector: waba, phone_number_id: phone_number_id) }

    before do
      campaign.set(campaign_mode_cd: "template", waba_connector_id: waba.id.to_s, phone_number_ids: [ phone_number_id ], template_ids: [ template.id.to_s ], messages: [])
    end

    def accepted(id = "wamid.batch")
      { status: 200, body: { messaging_product: "whatsapp", contacts: [ { input: phone, wa_id: phone } ], messages: [ { id: id } ] }.to_json }
    end

    def refused
      { status: 400, body: { error: { code: 132_000, message: "O modelo não existe", type: "OAuthException" } }.to_json }
    end

    def body_parameters(request)
      JSON.parse(request.body).dig("template", "components", 0, "parameters").map { |parameter| parameter["text"] }
    end

    context "com o canal aceitando" do
      before { stub_request(:post, graph_url).to_return(accepted) }

      it "usa o número do lote como remetente e registra tudo" do
        expect(deliver(on: waba)).to have_attributes(status_cd: "sent", whatsapp_message_id: "wamid.batch")

        expect(Chat.where(connector_id: waba.id).take.sender_phone_number_id).to eq(phone_number_id.to_i)
        expect(campaign.reload.sent_count).to eq(1)
      end

      it "sem valor preenchido, o primeiro parâmetro é o nome" do
        deliver(on: waba)

        expect(a_request(:post, graph_url).with { |request| body_parameters(request) == [ "Maria", "" ] }).to have_been_made.once
      end

      it "preenche com o que a campanha definiu, com as variáveis" do
        campaign.set(template_params: { template.id.to_s => { "1" => "{{nome}}", "2" => "{{segment}}" } })

        deliver(on: waba)

        expect(a_request(:post, graph_url).with { |request| body_parameters(request) == %w[Maria vip] }).to have_been_made.once
      end

      it "grava o texto renderizado no histórico, com a campanha" do
        campaign.set(template_params: { template.id.to_s => { "1" => "{{nome}}", "2" => "{{segment}}" } })

        deliver(on: waba)

        message = ChatMessage::Base.unscoped.where(chat_id: recipient.reload.chat_id).take
        expect(message).to have_attributes(content: "Olá Maria, segmento vip", campaign_id: campaign.id.to_s, sender_name: "Campanha de Natal", status: "delivery_ack")
      end

      it "alterna os modelos pela posição" do
        other = create(:whatsapp_template, connector: waba, name: "outro_modelo", components: [ { "type" => "BODY", "text" => "Oi" } ])
        campaign.set(template_ids: [ template.id.to_s, other.id.to_s ])
        batch.set(position_offset: 1)

        deliver(on: waba)

        expect(a_request(:post, graph_url).with { |request| JSON.parse(request.body).dig("template", "name") == "outro_modelo" }).to have_been_made.once
      end

      context "com o número fora do lote" do
        let(:batch) { build_batch(campaign, [ recipient ], connector: waba, phone_number_id: nil) }

        it "recupera o número gravado no destinatário" do
          recipient.set(phone_number_id: phone_number_id)

          expect(deliver(on: waba).status_cd).to eq("sent")
          expect(a_request(:post, graph_url)).to have_been_made.once
        end

        it "recupera o número das variáveis do destinatário" do
          recipient.set(custom_variables: { "phone_number_id" => phone_number_id })

          expect(deliver(on: waba).status_cd).to eq("sent")
          expect(a_request(:post, graph_url)).to have_been_made.once
        end

        it "por fim, usa o rodízio da campanha" do
          expect(deliver(on: waba).status_cd).to eq("sent")
          expect(a_request(:post, graph_url)).to have_been_made.once
        end
      end

      describe "a conversa" do
        it "acha a que já existe com o mesmo remetente" do
          chat = create(:chat, connector: waba, organization_id: organization.id, external_id: phone, sender_phone_number_id: phone_number_id.to_i)

          deliver(on: waba)

          expect(recipient.reload.chat_id).to eq(chat.id.to_s)
        end

        it "assume uma conversa antiga, sem remetente" do
          legacy = create(:chat, connector: waba, organization_id: organization.id, external_id: phone, sender_phone_number_id: nil)

          deliver(on: waba)

          expect(recipient.reload.chat_id).to eq(legacy.id.to_s)
          expect(legacy.reload.sender_phone_number_id).to eq(phone_number_id.to_i)
        end

        it "não usa a conversa de outro número da conta" do
          create(:chat, connector: waba, organization_id: organization.id, external_id: phone, sender_phone_number_id: 111)

          deliver(on: waba)

          expect(Chat.where(connector_id: waba.id, sender_phone_number_id: phone_number_id.to_i).count).to eq(1)
        end

        it "cria com o remetente e o nome quando não existe" do
          deliver(on: waba)

          expect(Chat.where(connector_id: waba.id).take).to have_attributes(external_id: phone, user_name: "Maria", sender_phone_number_id: phone_number_id.to_i)
        end
      end
    end

    context "sem número em lugar nenhum" do
      let(:batch) { build_batch(campaign, [ recipient ], connector: waba, phone_number_id: nil) }

      before { campaign.set(phone_number_ids: []) }

      it "não chama a WABA e registra a falha" do
        expect(deliver(on: waba)).to have_attributes(status_cd: "failed", error_code: "noPhoneNumber")
        expect(campaign.reload.failed_count).to eq(1)
      end
    end

    it "quando a WABA recusa, a mensagem e o destinatário ficam falhos" do
      stub_request(:post, graph_url).to_return(refused)

      expect(deliver(on: waba)).to have_attributes(status_cd: "failed", error_code: "whatsappError", error_message: "O modelo não existe")

      message = ChatMessage::Base.unscoped.where(chat_id: recipient.reload.chat_id).take
      expect(message.status).to eq("failed")
      expect(campaign.reload.failed_count).to eq(1)
    end

    it "com o modelo apagado, falha sem chamar a Meta" do
      template.delete

      expect(deliver(on: waba)).to have_attributes(status_cd: "failed", error_code: "templateUnavailable")
      expect(a_request(:post, graph_url)).not_to have_been_made
    end

    it "um modelo com cabeçalho de imagem vira mensagem de mídia no histórico" do
      template.set(components: [ { "type" => "HEADER", "format" => "IMAGE", "example" => { "header_url" => [ "https://cdn.exemplo.com.br/capa.png" ] } }, { "type" => "BODY", "text" => "Legenda" } ], header_media_url: "https://cdn.exemplo.com.br/capa.png")
      stub_request(:post, graph_url).to_return(accepted)

      deliver(on: waba)

      message = ChatMessage::Base.unscoped.where(chat_id: recipient.reload.chat_id).take
      expect(message).to be_a(ChatMessage::Image)
      expect(message).to have_attributes(image_url: "https://cdn.exemplo.com.br/capa.png", caption: "Legenda", campaign_id: campaign.id.to_s)
    end

    it "não subir as conversas vale também para o modelo" do
      campaign.set(raise_chats: false)
      stub_request(:post, graph_url).to_return(accepted)

      deliver(on: waba)

      expect(Chat.where(connector_id: waba.id).take.last_message_at).to be < 1.month.ago
    end
  end
end
