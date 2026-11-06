# frozen_string_literal: true

class ZapiClient
  # Media sending methods (image, video, audio, document)
  module Media
    # Sends an image to the specified number.
    # @param phone [String] Recipient phone number
    # @param image [String, File] Image URL or local file path (will be converted to Base64)
    # @param caption [String, nil] Optional image caption
    # @param view_once [Boolean] If true, image can only be viewed once
    # @return [Hash] API response
    def send_image(phone, image, caption: nil, view_once: false)
      image_param = FileHandler.prepare_file_param(image, 'image')
      payload = { phone: phone, image: image_param, viewOnce: !!view_once }
      payload[:caption] = caption if caption

      request(:post, 'send-image', body: payload)
    end

    # Sends a video to the specified number.
    # @param phone [String] Recipient phone number
    # @param video [String, File] Video URL or local file path (will be converted to Base64)
    # @param caption [String, nil] Optional video caption
    # @param view_once [Boolean] If true, video can only be viewed once
    # @return [Hash] API response
    def send_video(phone, video, caption: nil, view_once: false)
      video_param = FileHandler.prepare_file_param(video, 'video')
      payload = { phone: phone, video: video_param, viewOnce: !!view_once }
      payload[:caption] = caption if caption

      request(:post, 'send-video', body: payload)
    end

    # Sends an audio file to the specified number.
    # @param phone [String] Recipient phone number
    # @param audio [String, File] Audio URL or local file path (will be converted to Base64)
    # @param waveform [Boolean] If true, sends audio with waveform visualization (voice message style)
    # @param view_once [Boolean] If true, audio can only be played once
    # @return [Hash] API response
    def send_audio(phone, audio, waveform: false, view_once: false)
      audio_param = FileHandler.prepare_file_param(audio, 'audio')
      payload = { phone: phone, audio: audio_param, viewOnce: !!view_once }
      payload[:waveform] = true if waveform

      request(:post, 'send-audio', body: payload)
    end

    # Sends a document (PDF, DOC, etc.) to the specified number.
    # @param phone [String] Recipient phone number
    # @param document [String, File] Document URL or local file path
    # @param file_name [String, nil] Optional file name for the document in WhatsApp
    # @return [Hash] API response
    def send_document(phone, document, file_name: nil)
      ext, file_name = FileHandler.extract_document_info(document, file_name)
      doc_param = FileHandler.prepare_file_param(document, 'document')

      payload = { phone: phone, document: doc_param }
      payload[:fileName] = file_name if file_name

      request(:post, "send-document/#{ext}", body: payload)
    end

    # Downloads received media from its URL.
    # @param media_url [String] URL of the media to download
    # @return [String] Binary content of the media file
    # @raise [ZapiClient::Error] On download failure
    def retrieve_media(media_url)
      response = HTTParty.get(media_url, timeout: 20)
      return response.body if response.code == 200

      Rails.logger.error("Failed to download media: HTTP #{response.code}") if defined?(Rails)
      raise Error, "Failed to download media (HTTP #{response.code})"
    rescue StandardError => e
      Rails.logger.error("Error retrieving media: #{e.message}") if defined?(Rails)
      raise Error, "Error retrieving media: #{e.message}"
    end
  end
end
