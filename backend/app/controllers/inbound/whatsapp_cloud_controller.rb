module Inbound
  # GET e POST /inbound/whatsapp-cloud/:id
  class WhatsappCloudController < BaseController
    def callback
      connector = Connector::WhatsappCloud.where(id: params[:id]).take
      return render_not_found unless connector
      return render_challenge(connector.verification_token) if verification_request?

      verify_meta_signature
      return if performed?

      enqueue("whatsapp_cloud", connector.id)
    end
  end
end
