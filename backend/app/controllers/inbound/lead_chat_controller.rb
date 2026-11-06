module Inbound
  # POST /inbound/lead-chat/:id/event
  class LeadChatController < BaseController
    def event
      connector = Connector::LeadChat.where(id: params[:id]).take
      return render_not_found unless connector

      enqueue("lead_chat", connector.id)
    end
  end
end
