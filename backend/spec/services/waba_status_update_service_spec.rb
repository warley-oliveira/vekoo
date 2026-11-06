require "rails_helper"

# Banco de verdade: a graça deste serviço é achar a mensagem apesar das derivas de telefone
# e de conector, e o que importa é o estado que fica no Mongo.
RSpec.describe WabaStatusUpdateService do
  include ActiveSupport::Testing::TimeHelpers

  subject(:service) { described_class.new(connector, status, phone_number_id) }

  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_whatsapp_cloud, organization: organization) }
  let(:phone_number_id) { connector.phone_number_id.to_s }
  let(:wamid) { "wamid.HBgMNTUzMTcxODEwOTMyFQIAERgSMTQ0OTJEMzREQzVFOUEwOUY4AA==" }
  let(:recipient_id) { "553171810932" }
  let(:status) { { "id" => wamid, "status" => "read", "recipient_id" => recipient_id } }
  let(:current_status) { "delivery_ack" }

  let!(:chat) { create(:chat, connector: connector, external_id: "5531971810932") }
  let!(:message) { create(:chat_text_message, chat: chat, role: "assistant", message_id: wamid, status: current_status) }

  def stored_status
    ChatMessage::Base.unscoped.where(chat_id: message.chat_id, id: message.id).take.status
  end

  # Os `find` que o bloco mandou para o Mongo, para olhar o plano sem dublê.
  def mongo_finds
    commands = []
    subscriber = Class.new do
      define_method(:started) { |event| commands << event.command if event.command_name == "find" }
      def succeeded(_event); end
      def failed(_event); end
    end.new

    Mongoid.default_client.subscribe(Mongo::Monitoring::COMMAND, subscriber)
    yield
    commands
  ensure
    Mongoid.default_client.unsubscribe(Mongo::Monitoring::COMMAND, subscriber)
  end

  describe "#call" do
    it "aplica o status na mensagem encontrada" do
      result = service.call

      expect(result).to have_attributes(code: :updated, message_id: wamid, waba_status: "read", mapped_status: "read")
      expect(stored_status).to eq("read")
    end

    describe "mapa de status da Meta" do
      let(:current_status) { nil }

      {
        "sent" => "server_ack",
        "delivered" => "delivery_ack",
        "read" => "read",
        "failed" => "failed",
        "pending" => "pending"
      }.each do |meta_status, platform_status|
        it "#{meta_status} vira #{platform_status}" do
          status["status"] = meta_status

          expect(service.call).to have_attributes(code: :updated, mapped_status: platform_status)
          expect(stored_status).to eq(platform_status)
        end
      end
    end

    # A deriva do 9º dígito: a Meta manda `553171810932`, a base guarda `5531971810932`.
    describe "deriva de telefone" do
      it "acha a conversa gravada com o 9º dígito quando a Meta manda sem" do
        expect(service.call.code).to eq(:updated)
      end

      it "acha a conversa gravada sem o 9º dígito quando a Meta manda com" do
        chat.set(external_id: "553171810932")
        status["recipient_id"] = "5531971810932"

        expect(service.call.code).to eq(:updated)
      end

      it "acha a conversa gravada com o sufixo do JID" do
        chat.set(external_id: "5531971810932@s.whatsapp.net")

        expect(service.call.code).to eq(:updated)
      end
    end

    # A deriva de conector: a conversa pode ter sido gravada sob outro conector da organização.
    describe "deriva de conector" do
      let(:sibling) { create(:connector_whatsapp_cloud, organization: organization) }

      before { chat.set(connector_id: sibling.id) }

      it "cai no escopo da organização quando o conector não acha nada" do
        expect(service.call.code).to eq(:updated)
        expect(stored_status).to eq("read")
      end

      it "prefere a conversa do próprio conector quando as duas têm o número" do
        own = create(:chat, connector: connector, external_id: "5531971810932")
        create(:chat_text_message, chat: own, role: "assistant", message_id: "wamid.outro", status: "delivery_ack")

        # O wamid está na conversa do conector irmão, que não é candidata nesse caso.
        expect(service.call.code).to eq(:retry_scheduled)
        expect(stored_status).to eq("delivery_ack")
      end
    end

    describe "isolamento entre organizações" do
      let(:other_organization) { create(:organization) }
      let(:other_connector) { create(:connector_whatsapp_cloud, organization: other_organization) }

      it "não toca em conversa de outra organização com o mesmo número e o mesmo wamid" do
        chat.set(connector_id: other_connector.id, organization_id: other_organization.id)

        expect(service.call.code).to eq(:retry_scheduled)
        expect(stored_status).to eq("delivery_ack")
      end
    end

    it "não aplica em mensagem de mesma conversa com outro wamid" do
      status["id"] = "wamid.outro"

      expect(service.call.code).to eq(:retry_scheduled)
      expect(stored_status).to eq("delivery_ack")
    end

    it "agenda nova tentativa quando nenhuma conversa casa com o número" do
      status["recipient_id"] = "5511900000000"

      expect(service.call.code).to eq(:retry_scheduled)
    end

    it "agenda nova tentativa sem número nenhum" do
      status.delete("recipient_id")

      expect(service.call.code).to eq(:retry_scheduled)
    end

    it "devolve :missing_id sem o wamid" do
      status.delete("id")

      expect(service.call.code).to eq(:missing_id)
    end

    it "devolve :missing_id com o status vazio" do
      expect(described_class.new(connector, nil, phone_number_id).call.code).to eq(:missing_id)
    end

    it "devolve :unknown_status para o que a Meta não documenta" do
      status["status"] = "banana"

      expect(service.call).to have_attributes(code: :unknown_status, waba_status: "banana")
      expect(stored_status).to eq("delivery_ack")
    end

    it "aceita ActionController::Parameters além de Hash" do
      params = ActionController::Parameters.new(status)

      expect(described_class.new(connector, params, phone_number_id).call.code).to eq(:updated)
    end

    it "transmite a mudança na stream da conversa" do
      expect { service.call }.to have_broadcasted_to(ChatMessage::Base.stream_for(chat)).with(
        a_hash_including("id" => message.id.to_s, "status" => "read")
      )
    end

    it "enxerga parte de mensagem dividida, que fica fora do default_scope" do
      message.set(is_span: true)

      expect(service.call.code).to eq(:updated)
    end
  end

  describe "trava de ordenação" do
    it "descarta o status que regride o atual" do
      status["status"] = "sent" # server_ack (1) < delivery_ack (2)

      expect(service.call.code).to eq(:ignored_regression)
      expect(stored_status).to eq("delivery_ack")
    end

    it "aplica o status que avança o atual" do
      expect(service.call.code).to eq(:updated)
    end

    it "reaplicar o mesmo status não é regressão" do
      status["status"] = "delivered"

      expect(service.call.code).to eq(:updated)
      expect(stored_status).to eq("delivery_ack")
    end

    context "com a mensagem já lida" do
      let(:current_status) { "read" }

      it "descarta entregue atrasado" do
        status["status"] = "delivered"

        expect(service.call.code).to eq(:ignored_regression)
        expect(stored_status).to eq("read")
      end

      it "aplica failed mesmo sobre um status mais avançado" do
        status["status"] = "failed"

        expect(service.call.code).to eq(:updated)
        expect(stored_status).to eq("failed")
      end
    end

    context "com a mensagem já falhada" do
      let(:current_status) { "failed" }

      %w[sent delivered read pending].each do |meta_status|
        it "#{meta_status} nunca reverte" do
          status["status"] = meta_status

          expect(service.call.code).to eq(:ignored_regression)
          expect(stored_status).to eq("failed")
        end
      end

      it "um segundo failed passa, para guardar a causa" do
        status.merge!("status" => "failed", "errors" => [ { "code" => 131_026 } ])

        expect(service.call.code).to eq(:updated)
        expect(message.reload.status_message).to include("Mensagem não entregue")
      end
    end

    context "com a mensagem ainda sem status" do
      let(:current_status) { nil }

      it "aplica qualquer status" do
        status["status"] = "sent"

        expect(service.call.code).to eq(:updated)
      end
    end

    context "com a mensagem em pending (recém-criada no envio)" do
      let(:current_status) { "pending" }

      it "avança para sent" do
        status["status"] = "sent"

        expect(service.call.code).to eq(:updated)
        expect(stored_status).to eq("server_ack")
      end
    end

    context "com um status atual desconhecido" do
      let(:current_status) { "qualquer" }

      it "não trava" do
        status["status"] = "sent"

        expect(service.call.code).to eq(:updated)
      end
    end
  end

  describe "causa da falha" do
    def fail_with(code, **error)
      status.merge!("status" => "failed", "errors" => [ { "code" => code }.merge(error.stringify_keys) ])
    end

    it "traduz o código para a pessoa entender" do
      fail_with(131_047)

      service.call

      expect(message.reload.status_message).to include("Fora da janela de 24 horas")
    end

    it "acrescenta os detalhes que a Meta mandou" do
      fail_with(131_047, title: "Re-engagement message")

      service.call

      expect(message.reload.status_message).to include("Detalhes da Meta: Re-engagement message")
    end

    it "prefere message a title nos detalhes" do
      fail_with(131_047, title: "Título", message: "Mensagem da Meta")

      service.call

      expect(message.reload.status_message).to include("Detalhes da Meta: Mensagem da Meta")
    end

    it "avisa quando o código não está no dicionário" do
      fail_with(999_999)

      service.call

      expect(message.reload.status_message).to include("Erro não mapeado (Código: 999999)")
    end

    it "sem erro no evento, falha sem causa" do
      status["status"] = "failed"

      service.call

      expect(message.reload).to have_attributes(status: "failed", status_message: nil)
    end

    it "não grava causa num status que não é falha" do
      status["errors"] = [ { "code" => 131_026 } ]

      service.call

      expect(message.reload).to have_attributes(status: "read", status_message: nil)
    end
  end

  describe "erros de conta e cobrança" do
    let(:alerts) { spy("OrganizationAlertService") }
    let(:status) do
      {
        "id" => wamid,
        "status" => "failed",
        "recipient_id" => recipient_id,
        "errors" => [ {
          "code" => 131_042,
          "title" => "Business eligibility payment issue",
          "message" => "Business eligibility payment issue"
        } ]
      }
    end

    before { stub_const("OrganizationAlertService", alerts) }

    it "traduz o erro em status_message" do
      service.call

      expect(message.reload).to have_attributes(status: "failed", status_message: a_string_including("elegibilidade de cobrança"))
    end

    it "levanta um aviso na organização" do
      service.call

      expect(alerts).to have_received(:connector_error).with(
        organization,
        connector,
        hash_including(
          code: "waba_billing_131042",
          message: a_string_including("elegibilidade de cobrança"),
          metadata: hash_including(error_code: 131_042, recipient_id: recipient_id)
        )
      )
    end

    it "guarda o erro no conector" do
      service.call

      expect(connector.reload.error_message).to include("elegibilidade de cobrança")
    end

    # O ponto central do incidente da origem: o aviso ficava atrás do lookup e nunca disparava.
    it "avisa mesmo quando a mensagem não é encontrada" do
      status["id"] = "wamid.sumiu"

      expect(service.call.code).to eq(:retry_scheduled)
      expect(alerts).to have_received(:connector_error)
    end

    it "avisa mesmo quando nenhuma conversa casa com o número" do
      status["recipient_id"] = "5511900000000"

      service.call

      expect(alerts).to have_received(:connector_error)
    end

    describe "deduplicação" do
      def another_recipient(id)
        described_class.new(connector, status.merge("id" => id), phone_number_id).call
      end

      it "um disparo de campanha não vira um aviso por destinatário" do
        service.call
        2.times { |index| another_recipient("wamid.#{index}") }

        expect(alerts).to have_received(:connector_error).once
      end

      it "o status continua sendo aplicado nas mensagens seguintes" do
        service.call
        second = create(:chat_text_message, chat: chat, role: "assistant", message_id: "wamid.2", status: "delivery_ack")

        another_recipient("wamid.2")

        expect(second.reload.status).to eq("failed")
      end

      it "volta a avisar depois de BILLING_ALERT_TTL" do
        service.call

        travel(described_class::BILLING_ALERT_TTL + 1.minute) { another_recipient("wamid.2") }

        expect(alerts).to have_received(:connector_error).twice
      end

      it "outro código avisa em separado" do
        service.call

        described_class.new(connector, status.merge("errors" => [ { "code" => 133_010 } ]), phone_number_id).call

        expect(alerts).to have_received(:connector_error).twice
      end

      it "outro conector avisa em separado" do
        service.call

        other = create(:connector_whatsapp_cloud, organization: organization)
        described_class.new(other, status, other.phone_number_id.to_s).call

        expect(alerts).to have_received(:connector_error).twice
      end
    end

    it "ainda aplica o status quando o próprio aviso quebra" do
      allow(alerts).to receive(:connector_error).and_raise(StandardError, "boom")

      expect(service.call.code).to eq(:updated)
      expect(stored_status).to eq("failed")
    end

    it "ainda aplica o status quando gravar no conector quebra" do
      allow(connector).to receive(:update).and_raise(StandardError, "boom")

      expect(service.call.code).to eq(:updated)
    end

    it "funciona sem o serviço de avisos, que é de outro domínio" do
      hide_const("OrganizationAlertService")

      expect(service.call.code).to eq(:updated)
    end

    it "não avisa erro fora da categoria de conta e cobrança" do
      status["errors"][0]["code"] = 131_026 # destinatário indisponível

      service.call

      expect(alerts).not_to have_received(:connector_error)
      expect(connector.reload.error_message).to be_nil
    end

    it "não avisa sem código de erro" do
      status.delete("errors")

      service.call

      expect(alerts).not_to have_received(:connector_error)
    end

    it "não avisa em status que não é falha" do
      status["status"] = "read"

      service.call

      expect(alerts).not_to have_received(:connector_error)
    end
  end

  # `Outreach::Recipient` é do domínio de campanhas, que ainda não está aqui. O dublê segue a
  # interface que o serviço usa; a regra testada é a de progressão e de contagem.
  describe "destinatário de campanha" do
    let(:campaign) { spy("Outreach::Campaign") }
    let(:recipient) { spy("Outreach::Recipient", status_cd: recipient_status, campaign: campaign) }
    let(:recipient_status) { "sent" }

    before { stub_const("Outreach::Recipient", double(where: double(take: recipient))) }

    it "busca pelo wamid" do
      service.call

      expect(Outreach::Recipient).to have_received(:where).with(whatsapp_message_id: wamid)
    end

    it "avança para entregue" do
      status["status"] = "delivered"

      service.call

      expect(recipient).to have_received(:update).with(hash_including(status: :delivered, delivered_at: kind_of(ActiveSupport::TimeWithZone)))
      expect(campaign).to have_received(:inc).with(delivered_count: 1)
    end

    it "conta a entrega também ao pular de enviado direto para lido" do
      service.call

      expect(recipient).to have_received(:update).with(hash_including(status: :read, delivered_at: anything, read_at: anything))
      expect(campaign).to have_received(:inc).with(delivered_count: 1, read_count: 1)
    end

    context "com o destinatário já entregue" do
      let(:recipient_status) { "delivered" }

      it "conta só a leitura" do
        service.call

        expect(recipient).to have_received(:update).with(hash_including(status: :read, read_at: anything))
        expect(campaign).to have_received(:inc).with(read_count: 1)
      end
    end

    context "com o destinatário já lido" do
      let(:recipient_status) { "read" }

      it "não regride" do
        status["status"] = "delivered"

        service.call

        expect(recipient).not_to have_received(:update)
        expect(campaign).not_to have_received(:inc)
      end
    end

    context "quando o envio falhou" do
      before { status.merge!("status" => "failed", "errors" => [ { "code" => 131_026, "title" => "Message undeliverable" } ]) }

      it "marca como falho com o motivo traduzido" do
        service.call

        expect(recipient).to have_received(:update).with(hash_including(status: :failed, error_message: a_string_including("Mensagem não entregue")))
        expect(campaign).to have_received(:inc).with(failed_count: 1)
      end

      context "com o destinatário já falho" do
        let(:recipient_status) { "failed" }

        it "não conta duas vezes" do
          service.call

          expect(campaign).not_to have_received(:inc)
        end
      end
    end

    it "atualiza o destinatário mesmo sem a mensagem" do
      status["id"] = "wamid.sumiu"

      service.call

      expect(recipient).to have_received(:update)
    end

    it "um erro no destinatário não derruba o status da mensagem" do
      allow(recipient).to receive(:update).and_raise(StandardError, "boom")

      expect(service.call.code).to eq(:updated)
      expect(stored_status).to eq("read")
    end

    it "sem destinatário segue normalmente" do
      stub_const("Outreach::Recipient", double(where: double(take: nil)))

      expect(service.call.code).to eq(:updated)
    end
  end

  describe "nova tentativa" do
    before { status["id"] = "wamid.ainda-nao-gravado" }

    it "agenda na primeira falta, com o primeiro atraso" do
      freeze_time do
        expect { expect(service.call.code).to eq(:retry_scheduled) }
          .to have_enqueued_job(WabaStatusRetryJob).with(connector.id.to_s, status, phone_number_id, 1).at(5.seconds.from_now)
      end
    end

    { 0 => 5.seconds, 1 => 30.seconds, 2 => 2.minutes }.each do |attempt, delay|
      it "na tentativa #{attempt} espera #{delay.inspect}" do
        freeze_time do
          expect { described_class.new(connector, status, phone_number_id, attempt: attempt).call }
            .to have_enqueued_job(WabaStatusRetryJob).with(connector.id.to_s, status, phone_number_id, attempt + 1).at(delay.from_now)
        end
      end
    end

    it "manda um Hash simples, serializável, mesmo com erros aninhados" do
      status["errors"] = [ { "code" => 131_026, "error_data" => { "details" => "sem conta" } } ]

      expect { service.call }.to have_enqueued_job(WabaStatusRetryJob).with(connector.id.to_s, status, phone_number_id, 1)
    end

    it "serializa Parameters também" do
      params = ActionController::Parameters.new(status)

      expect { described_class.new(connector, params, phone_number_id).call }
        .to have_enqueued_job(WabaStatusRetryJob).with(connector.id.to_s, status, phone_number_id, 1)
    end

    it "para ao esgotar os atrasos" do
      attempts = described_class::RETRY_DELAYS.size

      expect { expect(described_class.new(connector, status, phone_number_id, attempt: attempts).call.code).to eq(:not_found) }
        .not_to have_enqueued_job(WabaStatusRetryJob)
    end

    it "aceita a tentativa como texto, como pode voltar da fila" do
      attempts = described_class::RETRY_DELAYS.size.to_s

      expect(described_class.new(connector, status, phone_number_id, attempt: attempts).call.code).to eq(:not_found)
    end

    it "registra as variantes do número, para mostrar qual deriva está ativa" do
      allow(Rails.logger).to receive(:warn)

      service.call

      expect(Rails.logger).to have_received(:warn).with(/variantes=.*5531971810932/)
    end

    # A mensagem chegou no banco depois do webhook: é a janela que o job existe para cobrir.
    it "acha na tentativa seguinte quando o envio já gravou o wamid" do
      service.call

      create(:chat_text_message, chat: chat, role: "assistant", message_id: "wamid.ainda-nao-gravado", status: "pending")

      expect(described_class.new(connector, status, phone_number_id, attempt: 1).call.code).to eq(:updated)
    end
  end

  # Regressões da origem: índice e custo de cada webhook de status.
  describe "plano das consultas" do
    let(:finds) { mongo_finds { service.call } }
    let(:chat_finds) { finds.select { |command| command["find"] == Chat.collection_name.to_s } }
    # A outra consulta a Chat é a do belongs_to, ao transmitir a mensagem: pelo _id.
    let(:chat_lookups) { chat_finds.reject { |command| command["filter"].keys == [ "_id" ] } }
    let(:message_finds) { finds.select { |command| command["find"] == ChatMessage::Base.collection_name.to_s } }

    it "toda consulta a Chat carrega um prefixo de índice" do
      expect(chat_lookups).not_to be_empty
      expect(chat_lookups).to all(satisfy { |command| command["filter"].key?("connector_id") || command["filter"].key?("organization_id") })
    end

    it "só consulta pela organização quando o conector não acha nada" do
      expect(chat_lookups.map { |command| command["filter"].keys.first }).to eq([ "connector_id" ])
    end

    it "sem conversa no conector, a segunda busca é pela organização" do
      chat.set(connector_id: create(:connector_whatsapp_cloud, organization: organization).id)

      expect(chat_lookups.map { |command| command["filter"].key?("organization_id") }).to eq([ false, true ])
    end

    it "a mensagem é buscada sempre dentro das conversas candidatas" do
      expect(message_finds).not_to be_empty
      expect(message_finds).to all(satisfy { |command| command["filter"].key?("chat_id") })
    end

    # `first` sem sort faz o Mongoid injetar `sort({_id: 1})`, que habilita um IXSCAN(_id)
    # na coleção inteira quando o documento não existe, o caso comum aqui. `take` não ordena.
    it "a mensagem é buscada sem ordenação implícita" do
      expect(message_finds).to all(satisfy { |command| !command.key?("sort") })
    end

    it "o diagnóstico de status não resolvido não faz consulta sem prefixo" do
      status["id"] = "wamid.sumiu"

      expect(chat_finds).to all(satisfy { |command| command["filter"].key?("connector_id") || command["filter"].key?("organization_id") })
    end
  end
end
