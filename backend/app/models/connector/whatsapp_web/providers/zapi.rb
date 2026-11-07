# frozen_string_literal: true

class Connector::WhatsappWeb
  module Providers
    # Provider for Z-API (https://z-api.io). All work delegates to `ZapiClient`,
    # whose constructor is owned by the facade ([Connector::WhatsappWeb#zapi_client]).
    # Errors from the client are re-raised as `ZapiClient::Error` after being logged.
    module Zapi
      module_function

      # ---- messaging -----------------------------------------------------------

      def send_text_message(connector, to, message, reply_to_external_id: nil)
        phone = sanitize_phone(to)
        Rails.logger.info(
          "[ZapiClient] Sending text to #{phone} (reply_to=#{reply_to_external_id.inspect}): #{message[0..50]}..."
        )

        response = connector.zapi_client.send_text(phone, message, message_id: reply_to_external_id)
        Rails.logger.info(
          "[ZapiClient] Text message sent to #{phone}: #{message[0..50]}...\nResponse: #{response.inspect}"
        )
        response.try(:dig, "messageId")
      rescue ZapiClient::Error => e
        Rails.logger.error("[ZapiClient] Failed to send text: #{e.message}")
        raise e
      end

      def send_media_message(connector, to, media_dto)
        phone      = sanitize_phone(to)
        media_url  = media_dto.media_url
        media_type = media_dto.media_type || "image"
        caption    = media_dto.caption.presence
        file_name  = media_dto.file_name

        Rails.logger.info("[ZapiClient] Sending #{media_type} to #{phone}")

        case media_type.to_s.downcase
        when "image"              then connector.zapi_client.send_image(phone, media_url, caption: caption)
        when "video"              then connector.zapi_client.send_video(phone, media_url, caption: caption)
        when "document", "file"   then connector.zapi_client.send_document(phone, media_url, file_name: file_name)
        else                           connector.zapi_client.send_image(phone, media_url, caption: caption)
        end
      rescue ZapiClient::Error => e
        Rails.logger.error("[ZapiClient] Failed to send media: #{e.message}")
        raise e
      end

      def send_audio_message_by_url(connector, to, audio_url)
        phone = sanitize_phone(to)
        Rails.logger.info("[ZapiClient] Sending audio to #{phone}")

        connector.zapi_client.send_audio(phone, audio_url, waveform: true)
      rescue ZapiClient::Error => e
        Rails.logger.error("[ZapiClient] Failed to send audio: #{e.message}")
        raise e
      end

      def mark_read_message(connector, remote_jid, message_id)
        phone = sanitize_phone(remote_jid)
        Rails.logger.info("[ZapiClient] Marking message #{message_id} as read for #{phone}")

        connector.zapi_client.mark_as_read(phone, message_id)
      rescue ZapiClient::Error => e
        Rails.logger.error("[ZapiClient] Failed to mark as read: #{e.message}")
        false
      end

      def send_presence(connector, number, presence)
        phone = sanitize_phone(number)
        Rails.logger.info("[ZapiClient] Updating presence to #{presence} for #{phone}")

        connector.zapi_client.update_presence(phone, presence)
      rescue ZapiClient::Error => e
        Rails.logger.error("[ZapiClient] Failed to update presence: #{e.message}")
        false
      end

      def retriever_media_message(connector, _id, msg_type = :audio, base64 = false, payload = nil)
        download_url = extract_media_url(payload)
        unless download_url.present?
          Rails.logger.warn("[ZapiClient] retrieve_media requires a URL for Z-API")
          return nil
        end

        Rails.logger.info("[ZapiClient] Downloading media from: #{download_url}")
        content = connector.zapi_client.retrieve_media(download_url)
        return Base64.strict_encode64(content) if base64

        file_path = Rails.root.join("tmp", "#{SecureRandom.hex}.#{Base.file_extension_for(msg_type)}")
        File.write(file_path, content, mode: "wb")
        file_path
      rescue ZapiClient::Error => e
        Rails.logger.error("[ZapiClient] Failed to retrieve media: #{e.message}")
        nil
      end

      # ---- instance lifecycle --------------------------------------------------

      def activate(connector)
        create_instance(connector, "#{connector.organization&.name} - #{connector.id}")
        connector.status = :pending
        connector.save!
      end

      def create_instance(connector, name, **options)
        account_token = connector.zapi_account_token
        raise ZapiClient::Error, "Z-API account token is required" unless account_token.present?

        return if connector.zapi_instance_id.present? && connector.zapi_token.present?

        Rails.logger.info("[ZapiClient] Creating new instance: #{name}")

        default_callbacks = {
          delivery_callback_url: connector.inbound_url(:zapi_message_send, connector.id),
          received_callback_url: connector.inbound_url(:zapi_message_received, connector.id),
          disconnected_callback_url: connector.inbound_url(:zapi_disconnected, connector.id),
          connected_callback_url: connector.inbound_url(:zapi_connected, connector.id)
        }

        result = ZapiClient.create_instance(name, account_token: account_token, **default_callbacks.merge(options))

        connector.zapi_instance_id = result["id"]
        connector.zapi_token       = result["token"]
        connector.save!

        connector.zapi_client.update_notify_sent_by_me(enabled: true)

        Rails.logger.info("[ZapiClient] Instance created successfully: #{connector.zapi_instance_id}")
        result
      rescue ZapiClient::Error => e
        Rails.logger.error("[ZapiClient] Failed to create instance: #{e.message}")
        raise e
      end

      # ---- lifecycle no-ops ----------------------------------------------------
      # Z-API configures webhooks at instance-creation time (see
      # `create_instance` above), exposes no Evolution-style "reload" or
      # "fetch current information" endpoints, and treats logout as the
      # client's `disconnect`. The methods below exist purely to satisfy the
      # provider contract so the facade can dispatch uniformly.

      def setup_webhook!(_connector)
        Rails.logger.info("[ZapiClient] setup_webhook! is a no-op — webhook callbacks are set at instance creation")
        true
      end

      def reload_instance(_connector)
        Rails.logger.info("[ZapiClient] reload_instance has no Z-API equivalent — no-op")
        nil
      end

      def logout_instance(connector)
        Rails.logger.info("[ZapiClient] Disconnecting instance: #{connector.zapi_instance_id}")
        connector.zapi_client.disconnect
        connector.update(status: :closed)
      rescue ZapiClient::Error => e
        Rails.logger.error("[ZapiClient] Failed to disconnect: #{e.message}")
        raise e
      end

      def fetch_current_information(_connector)
        Rails.logger.info("[ZapiClient] fetch_current_information has no Z-API equivalent — no-op")
        nil
      end

      def retriever_media_message_complete(connector, id, _message, msg_type = :audio, resp_base64 = nil)
        # Z-API receives a direct media URL in the original webhook payload;
        # the "complete" flavor with the inner `message` envelope has no
        # equivalent. Best-effort: defer to `retriever_media_message` with no
        # payload (will return nil unless a URL is supplied via that path).
        retriever_media_message(connector, id, msg_type, resp_base64, nil)
      end

      # ---- helpers -------------------------------------------------------------

      def sanitize_phone(phone)
        sanitized_phone = phone.to_s.remove("@s.whatsapp.net")

        if sanitized_phone.size > 13 && !sanitized_phone.start_with?("55") && !sanitized_phone.include?("@lid")
          return "#{sanitized_phone}@lid"
        end

        Rails.logger.info("[ZapiClient] Sanitized phone for Z-API: `#{phone}` → `#{sanitized_phone}`")
        sanitized_phone
      end

      def extract_media_url(payload)
        return nil unless payload

        audio_url    = payload.dig("audio", "audioUrl")       || payload.dig(:audio, :audioUrl)
        image_url    = payload.dig("image", "imageUrl")       || payload.dig(:image, :imageUrl)
        video_url    = payload.dig("video", "videoUrl")       || payload.dig(:video, :videoUrl)
        document_url = payload.dig("document", "documentUrl") || payload.dig(:document, :documentUrl)

        audio_url || image_url || document_url || video_url
      end
    end
  end
end
