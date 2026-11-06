# frozen_string_literal: true

# Model para integração com Z-API (WhatsApp não oficial)
# Documentação: https://developer.z-api.io
class Connector::Zapi < Connector::Base
  BASE_URL = 'https://api.z-api.io'
  PREFIX_INSTANCE = 'IZA-'

  field :instance_id, type: String
  encrypted_field :token
  encrypted_field :account_token
  field :number_id, type: String
  field :phone_number, type: String
  field :profile_picture_url, type: String
  field :profile_name, type: String

  validates :instance_id, presence: true
  validates :token, presence: true

  index({ instance_id: 1 })

  # ============================================================================
  # Callbacks
  # ============================================================================

  before_update do
    fetch_current_information if status_cd_changed? && active?
  end

  def instance_name
    profile_name.presence || instance_id.presence || super
  end

  def number_formated
    return nil if phone_number.blank?

    "+#{phone_number[0..1]} (#{phone_number[2..3]}) #{phone_number[4..8]}-#{phone_number[9..]}"
  end

  # ============================================================================
  # Lifecycle Methods
  # ============================================================================

  def activate
    setup_webhooks!
    self.status = :pending
    save!
  end

  def deactivate
    self.status = :inactive
    save!
  end

  def setup_webhooks!
    update_webhook('update-webhook-received', inbound_url(:zapi_message_received, id))
    update_webhook('update-webhook-received-delivery', inbound_url(:zapi_message_received, id))
    update_webhook('update-webhook-send', inbound_url(:zapi_message_send, id))
    update_webhook('update-webhook-disconnected', inbound_url(:zapi_disconnected, id))
    update_webhook('update-webhook-connected', inbound_url(:zapi_connected, id))
  end

  def fetch_current_information
    response = api_request(:get, 'device')
    return unless response

    self.phone_number = response['phone']
    self.profile_name = response['displayName']

    profile_response = api_request(:get, 'profile-picture')
    self.profile_picture_url = profile_response['link'] if profile_response
  end

  # ============================================================================
  # Messaging Methods
  # ============================================================================

  def send_text_message(phone, message, _chat = nil, delay: nil, delay_typing: nil, reply_to_external_id: nil)
    return not_connected if closed?

    payload = { phone: sanitize_phone(phone), message: message }
    payload[:delayMessage] = delay if delay
    payload[:delayTyping] = delay_typing if delay_typing
    payload[:messageId] = reply_to_external_id if reply_to_external_id.present?

    response = api_request(:post, 'send-text', body: payload)
    @retry_count = 0

    Rails.logger.info("[ZApi] Message sent to #{phone}: #{message[0..50]}...")
    response.try(:dig, 'messageId')
  rescue StandardError => e
    Rails.logger.error("[ZApi] Failed to send text message: #{e.message}")
    handle_retry(e) do
      send_text_message(phone, message, nil, delay: delay, delay_typing: delay_typing, reply_to_external_id: reply_to_external_id)
    end
  end

  def send_image_message(phone, image_url, caption: nil, view_once: false)
    return not_connected if closed?

    payload = {
      phone: sanitize_phone(phone),
      image: image_url,
      viewOnce: view_once
    }
    payload[:caption] = caption if caption

    response = api_request(:post, 'send-image', body: payload)
    response.try(:dig, 'messageId')
  rescue StandardError => e
    Rails.logger.error("[ZApi] Failed to send image message: #{e.message}")
    nil
  end

  # Mesmo contrato dos outros conectores.
  def send_media_message(phone, media_dto, _chat = nil)
    url = media_dto.media_url
    caption = media_dto.caption.presence

    case media_dto.media_type.to_s
    when 'video' then send_video_message(phone, url, caption: caption)
    when 'document', 'file' then send_document_message(phone, url, file_name: media_dto.file_name)
    else send_image_message(phone, url, caption: caption)
    end
  end

  def send_audio_message_by_url(phone, audio_url, _chat = nil)
    send_audio_message(phone, Media::Storage.public_url(audio_url))
  end

  def mark_read_message(phone, message_id)
    mark_as_read(phone, message_id)
  end

  def send_presence(phone, presence)
    update_presence(phone, presence)
  end

  def zapi_provider?
    true
  end

  def zapi_get_qr_code_image
    api_request(:get, 'qr-code/image')
  end

  # Instância própria: não há assinatura de integrador nem conversa para migrar.
  def sign_zapi_instance; end

  def migrate_chats; end

  def reload_instance = true

  def logout_instance
    deactivate
  end

  def send_audio_message(phone, audio_url, waveform: true, view_once: false)
    return not_connected if closed?

    payload = {
      phone: sanitize_phone(phone),
      audio: audio_url,
      viewOnce: view_once,
      waveform: waveform
    }

    response = api_request(:post, 'send-audio', body: payload)
    response.try(:dig, 'messageId')
  rescue StandardError => e
    Rails.logger.error("[ZApi] Failed to send audio message: #{e.message}")
    nil
  end

  def send_document_message(phone, document_url, file_name: nil)
    return not_connected if closed?

    ext = detect_extension(document_url, file_name)

    payload = {
      phone: sanitize_phone(phone),
      document: document_url
    }
    payload[:fileName] = file_name if file_name

    response = api_request(:post, "send-document/#{ext}", body: payload)
    response.try(:dig, 'messageId')
  rescue StandardError => e
    Rails.logger.error("[ZApi] Failed to send document message: #{e.message}")
    nil
  end

  def send_video_message(phone, video_url, caption: nil, view_once: false)
    return not_connected if closed?

    payload = {
      phone: sanitize_phone(phone),
      video: video_url,
      viewOnce: view_once
    }
    payload[:caption] = caption if caption

    response = api_request(:post, 'send-video', body: payload)
    response.try(:dig, 'messageId')
  rescue StandardError => e
    Rails.logger.error("[ZApi] Failed to send video message: #{e.message}")
    nil
  end

  def mark_as_read(phone, message_id)
    payload = { phone: sanitize_phone(phone), messageId: message_id }
    api_request(:post, 'read-message', body: payload)
    true
  rescue StandardError => e
    Rails.logger.error("[ZApi] Failed to mark as read: #{e.message}")
    false
  end

  def update_presence(phone, presence_status, duration: 1200)
    allowed = %w[unavailable available composing recording paused]
    presence_status = presence_status.to_s.downcase

    raise ArgumentError, "Status de presença inválido: #{presence_status}" unless allowed.include?(presence_status)

    url = "#{base_uri}/chat/updatePresence?number=#{sanitize_phone(phone)}"
    payload = { presence: presence_status, delay: duration }

    HTTParty.put(url, headers: default_headers, body: payload.to_json, timeout: 5)
    true
  rescue StandardError => e
    Rails.logger.error("[ZApi] Failed to update presence: #{e.message}")
    false
  end

  # ============================================================================
  # Media Methods
  # ============================================================================

  # Baixa para um arquivo temporário e devolve o caminho, como os outros conectores.
  def download_media(media_url)
    content = retrieve_media(media_url)
    return nil if content.blank?

    file_path = Rails.root.join('tmp', "zapi-#{SecureRandom.hex}.bin")
    File.binwrite(file_path, content)
    file_path
  end

  def retrieve_media(media_url)
    response = HTTParty.get(media_url, timeout: 20)
    return response.body if response.code == 200

    Rails.logger.error("[ZApi] Failed to retrieve media: HTTP #{response.code}")
    nil
  rescue StandardError => e
    Rails.logger.error("[ZApi] Error retrieving media: #{e.message}")
    nil
  end

  # ============================================================================
  # Private Methods
  # ============================================================================

  private

  # Contrato de envio: id externo ou nil. `errors.add` sozinho devolveria o objeto de erro.
  def not_connected
    errors.add(:not_connected, 'não conectado')
    nil
  end

  def base_uri
    @base_uri ||= "#{BASE_URL}/instances/#{instance_id}/token/#{token}"
  end

  def default_headers
    headers = { 'Content-Type' => 'application/json' }
    headers['Client-Token'] = account_token if account_token.present?
    headers
  end

  def api_request(method, endpoint, body: nil)
    url = "#{base_uri}/#{endpoint}"

    response = HTTParty.send(
      method,
      url,
      headers: default_headers,
      body: body&.to_json,
      timeout: 15
    )

    if response.success?
      response.parsed_response
    else
      Rails.logger.error("[ZApi] API Error: HTTP #{response.code} - #{response.body}")
      raise ZApiError, "Falha na requisição Z-API (HTTP #{response.code})"
    end
  end

  def update_webhook(endpoint, url)
    api_request(:put, endpoint, body: { value: url })
    Rails.logger.info("[ZApi] Webhook updated: #{endpoint} -> #{url}")
  rescue StandardError => e
    Rails.logger.error("[ZApi] Failed to update webhook #{endpoint}: #{e.message}")
  end

  def sanitize_phone(phone)
    phone.to_s.gsub(/\D/, '')
  end

  def detect_extension(url, file_name)
    name = file_name || File.basename(URI.parse(url).path)
    ext = File.extname(name).to_s.delete('.')
    ext.presence || 'pdf'
  rescue StandardError
    'pdf'
  end

  def handle_retry(error, max_retries: 2, &block)
    @retry_count ||= 0
    @retry_count += 1

    if @retry_count <= max_retries
      Rails.logger.warn("[ZApi] Retry #{@retry_count}: #{error.message}")
      sleep 1
      block.call
    else
      @retry_count = 0
      raise error
    end
  end

  # Classe de erro personalizada
  class ZApiError < StandardError; end
end
