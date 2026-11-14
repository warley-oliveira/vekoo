require "rails_helper"

# A tradução única da resposta de cada provedor para o id da mensagem. As respostas aqui são
# de verdade (HTTParty e SDK da Meta sobre o WebMock), não dublês.
RSpec.describe Connectors::ExternalId do
  include ConnectorHelpers

  describe ".from" do
    it "devolve como está o que já é o id" do
      expect(described_class.from("wamid.1")).to eq("wamid.1")
    end

    it "devolve nil para nil" do
      expect(described_class.from(nil)).to be_nil
    end

    context "com a resposta do SDK da Meta" do
      let(:connector) { create(:connector_whatsapp_cloud, phone_number_id: 1_234_567_890) }
      let(:url) { "https://graph.facebook.com/v19.0/1234567890/messages" }

      it "lê o wamid" do
        stub_request(:post, url).to_return(json_reply({ messages: [ { id: "wamid.SDK" } ] }))

        expect(described_class.from(connector.send_media_message("553199999", media_dto))).to eq("wamid.SDK")
      end

      it "devolve nil em erro" do
        stub_request(:post, url).to_return(json_reply({ error: { code: 1, message: "x" } }, status: 500))

        expect(described_class.from(connector.send_media_message("553199999", media_dto))).to be_nil
      end
    end

    context "com a resposta do HTTParty" do
      let(:url) { "https://provedor.exemplo.com/enviar" }

      def response(reply)
        stub_request(:post, url).to_return(reply)
        HTTParty.post(url)
      end

      it "lê key.id: Evolution e Vekoo" do
        expect(described_class.from(response(json_reply({ key: { id: "3EB0" } })))).to eq("3EB0")
      end

      it "lê message_id: Messenger e Instagram" do
        expect(described_class.from(response(json_reply({ message_id: "mid.1" })))).to eq("mid.1")
      end

      it "devolve nil sem nenhum dos campos" do
        expect(described_class.from(response(json_reply({ outro: 1 })))).to be_nil
      end

      it "devolve nil com corpo que não é objeto" do
        expect(described_class.from(response(json_reply([ 1, 2 ])))).to be_nil
      end

      it "devolve nil com corpo que não é JSON" do
        expect(described_class.from(response({ status: 200, body: "ok", headers: { "Content-Type" => "text/plain" } }))).to be_nil
      end

      it "devolve nil com corpo vazio, sem o aviso de `nil?` do HTTParty" do
        empty = response({ status: 201, body: "" })

        expect { expect(described_class.from(empty)).to be_nil }.not_to output(/DEPRECATION/).to_stderr
      end
    end

    context "com um hash já pronto" do
      it "lê key.id: é o que a Evolution recupera de findMessages" do
        expect(described_class.from("key" => { "id" => "3EB0NEW" })).to eq("3EB0NEW")
      end

      it "lê id em símbolo: o cliente do LeadChat simboliza as chaves" do
        expect(described_class.from(id: "L1")).to eq("L1")
      end

      it "converte em texto o id numérico do LeadChat" do
        expect(described_class.from(id: 7)).to eq("7")
      end

      it "devolve nil num hash sem id" do
        expect(described_class.from({})).to be_nil
      end
    end

    it "devolve nil para o que não é resposta de provedor" do
      expect(described_class.from(true)).to be_nil
      expect(described_class.from(:erro)).to be_nil
      expect(described_class.from(Connector::LeadChat.new.errors.add(:base, "x"))).to be_nil
    end
  end

  # Todo envio de mídia que devolve a resposta crua precisa render um id aqui.
  describe "de ponta a ponta com cada conector" do
    let(:organization) { create(:organization) }

    it "Vekoo" do
      connector = create(:connector_whatsapp_web, :vekoo, organization: organization, instance_name: "W")
      stub_request(:get, "https://cdn.exemplo.com/foto.jpg").to_return(status: 200, body: "BYTES")
      stub_request(:post, "http://vekoo.test/message/sendMediaFile/W").to_return(json_reply({ key: { id: "A1" } }))

      expect(described_class.from(connector.send_media_message("553199999", media_dto))).to eq("A1")
    end

    it "Evolution" do
      connector = create(:connector_whatsapp_web, organization: organization, instance_name: "W")
      stub_request(:post, "http://evolution.test/message/sendMedia/W").to_return(json_reply({ key: { id: "E1" } }, status: 201))

      expect(described_class.from(connector.send_media_message("553199999", media_dto))).to eq("E1")
    end

    it "Messenger" do
      connector = create(:connector_messenger, organization: organization, page_id: "P")
      stub_request(:post, "https://graph.facebook.com/v22.0/P/messages").to_return(json_reply({ message_id: "M1" }))

      expect(described_class.from(connector.send_media_message("PSID", media_dto))).to eq("M1")
    end

    it "Widget" do
      connector = create(:connector_web_widget, organization: organization)
      chat = create(:chat, connector: connector, external_id: "visitante")

      expect(described_class.from(connector.send_media_message("visitante", media_dto, chat))).to match(/\A[0-9a-f-]{36}\z/)
    end
  end
end
