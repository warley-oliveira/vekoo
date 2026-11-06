module LeadChatApi
  module Endpoints
    SYNC_MESSAGE_SLUG = '/chat/v1/message/send-sync'.freeze
    SESSION_SLUG = '/chat/v1/session'.freeze
    SUBSCRIPTION_SLUG = '/core/v1/webhook/subscription'.freeze
    CONTACT_SLUG = '/core/v1/contact'.freeze
    SEND_MESSAGE_SESSION_SYNC = 'chat/v1/session/%<id>s/message/sync'.freeze
  end
end
