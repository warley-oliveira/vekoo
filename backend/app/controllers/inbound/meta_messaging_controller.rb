module Inbound
  # GET e POST /inbound/meta-messaging, endpoint único de Messenger e Instagram Direct.
  class MetaMessagingController < BaseController
    def callback
      return render_challenge(ENV["META_MESSAGING_VERIFY_TOKEN"]) if verification_request?

      enqueue("meta_messaging")
    end
  end
end
