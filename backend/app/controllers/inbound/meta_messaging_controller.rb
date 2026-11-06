module Inbound
  # GET e POST /inbound/meta-messaging, endpoint único de Messenger e Instagram Direct.
  class MetaMessagingController < BaseController
    def callback
      return render_challenge(ENV["META_MESSAGING_VERIFY_TOKEN"]) if verification_request?

      verify_meta_signature
      return if performed?

      enqueue("meta_messaging")
    end
  end
end
