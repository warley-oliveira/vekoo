class Connector::LeadChat < Connector::Base
  field :phone_number_id, type: Integer
  encrypted_field :access_token
  field :verification_token, type: String

  # Webhook subscription from LeadChat
  field :external_subscription_id, type: String

  before_create do
    self.verification_token = SecureRandom.base36(32)
  end

  def activate
    setup_webhook!
    save!
  end

  def instance_name
    "LeadChat #{phone_number_id || id}"
  end

  def send_text_message(_sender_id, message, chat = nil, reply_to_external_id: nil) # rubocop:disable Lint/UnusedMethodArgument
    leadchat_message = LeadChatApi::Message.new(leadchat_client)
    response = leadchat_message.send_text_message_to_session(
      session_id: chat.external_fields['session_id'],
      message: message
    )
    response.is_a?(Hash) ? response[:id].to_s.presence : nil
  end

  def send_template_message(_sender_id, _template, _language: 'en_US')
    raise 'Not implemented'
  end

  def send_media_message(_to, media_dto, chat = nil)
    file_url = media_dto&.media_url
    return if file_url.blank?

    Rails.logger.info("[LeadChat Model] Sending file: #{media_dto.as_json}")
    LeadChatApi::Message.new(leadchat_client).send_file_message_to_session(
      session_id: chat.external_fields['session_id'],
      file_url: file_url
    )
  end

  def send_audio_message_by_url(_to, audio_url, chat = nil)
    return if audio_url.blank?

    LeadChatApi::Message.new(leadchat_client).send_file_message_to_session(
      session_id: chat.external_fields['session_id'],
      file_url: Media::Storage.public_url(audio_url)
    )
  end

  # This feature has no support
  def mark_read_message(*_args) = true

  # This feature has no support
  def send_presence(_number, _presence) = true

  def retrieve_audio_message(file_url)
    file_path = Rails.root.join('tmp', "#{SecureRandom.hex}.mp3")
    response = HTTParty.get(file_url)

    File.binwrite(file_path, response.body)
    file_path
  end

  # This feature has no support
  def reload_instance = true

  def logout_instance
    webhook = LeadChatApi::Webhook.new(leadchat_client)
    if external_subscription_id
      webhook.delete_subscription(external_subscription_id)
      self.external_subscription_id = nil
    end
    self.status = :closed
    save!
  end

  # private

  def leadchat_client
    @leadchat_client ||= LeadChatApi::Client.new(access_token)
  end

  def webhook_url
    inbound_url(:lead_chat_event, id)
  end

  def setup_webhook!
    webhook = LeadChatApi::Webhook.new(leadchat_client)
    response = webhook.create_subscription('Vekoo', webhook_url)

    raise LeadChatApi::Error.new(response.dig(:error, :code), response.dig(:error, :message)) if response.is_a?(Hash) && response[:error]

    self.external_subscription_id = response[:id]
    self.status = :active
  rescue LeadChatApi::Error => e
    Rails.logger.error("[LeadChat] #{e.message}")
    self.status = :failed
  end
end
