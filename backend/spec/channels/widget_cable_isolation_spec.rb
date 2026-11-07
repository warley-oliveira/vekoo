require "rails_helper"

# O ActionCable aceita assinar qualquer classe de canal pelo nome. O servidor do widget (`/widget-cable`) é
# público, e os dois dividem as mesmas classes: uma conexão de visitante não pode virar assinatura de canal de
# quem atende, nem a de quem atende ouvir a conversa de um visitante.
RSpec.describe "Isolamento entre o cable do widget e o da plataforma", type: :channel do
  let(:organization) { create(:organization) }
  let(:connector) { create(:connector_web_widget, organization: organization, status: :active) }

  staff_channels = [
    AgendaChannel, CampaignChannel, ChatChannel, ChatListChannel, ConnectorsChannel, ContactsExportChannel,
    CopilotChannel, FlowPlaygroundChannel, NotificationsChannel, OrganizationAlertsChannel, PipelineBoardChannel,
    PlaceExtractionChannel, ProductImportChannel
  ]

  staff_channels.each do |channel_class|
    describe channel_class.name do
      tests channel_class

      it "não transmite para uma conexão de visitante" do
        stub_connection(visitor_id: "visitante-0001", web_widget_connector_id: connector.id.to_s)

        begin
          subscribe(chatId: BSON::ObjectId.new.to_s, boardId: SecureRandom.uuid, connectorId: connector.id.to_s, sessionId: "aba-1")
        rescue NameError
          next # A conexão de visitante nem tem `current_account`: o ActionCable registra e não assina.
        end

        expect(subscription).not_to be_confirmed
        expect(subscription.streams).to be_empty
      end
    end
  end

  describe Widget::ChatChannel do
    tests Widget::ChatChannel

    it "uma conexão da plataforma não assina" do
      stub_connection(current_account: create(:account, organization: organization))

      expect { subscribe }.to raise_error(NameError)
    end

    it "o visitante escuta só a própria stream" do
      stub_connection(visitor_id: "visitante-0001", web_widget_connector_id: connector.id.to_s)

      subscribe

      expect(subscription).to be_confirmed
      expect(subscription.streams).to eq([ connector.visitor_stream("visitante-0001") ])
    end

    it "conector desligado recusa" do
      connector.update!(status: :inactive)
      stub_connection(visitor_id: "visitante-0001", web_widget_connector_id: connector.id.to_s)

      subscribe

      expect(subscription).to be_rejected
    end
  end
end
