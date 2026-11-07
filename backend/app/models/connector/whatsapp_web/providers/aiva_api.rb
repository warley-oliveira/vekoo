# frozen_string_literal: true

class Connector::WhatsappWeb
  module Providers
    # Provider for the in-house "AIVA" Evolution-style WhatsApp HTTP API.
    # All requests go through HTTParty against `connector.base_url`, with
    # the instance-scoped path `/<endpoint>/<instance_name>` and the apikey
    # header from `connector.headers`.
    module AivaApi
      module_function

      # ---- messaging -----------------------------------------------------------

      def send_text_message(connector, to, message, reply_to_external_id: nil)
        _ = reply_to_external_id # not supported on this provider yet

        to = "#{to}@s.whatsapp.net" unless to.end_with?('@s.whatsapp.net')
        payload = {
          number: to,
          textMessage: { text: message },
          options: { delay: 0, presence: 'available' }
        }

        Base.with_retry(label: 'Send Text Message', idempotent: false) do
          response = HTTParty.post(
            "#{connector.base_url}/message/sendText/#{connector.instance_name}",
            body: payload.to_json,
            headers: connector.headers
          )
          Rails.logger.info("HTTParty Response (send_text_message): #{response.body}")

          raise "Failed to send message: #{response.body}" unless (200..299).cover?(response.code)

          # Tolera 2xx sem corpo: levantar aqui faria `with_retry` reenviar o que já saiu.
          Connectors::ExternalId.from(response)
        end
      end

      def send_media_message(connector, to, media_dto)
        file_name = (media_dto.file_name || 'image.jpg').unicode_normalize(:nfkd).gsub(/[^\x00-\x7F]/, '')

        Base.with_retry(label: 'Send Media Message', idempotent: false) do
          if media_dto.attachment.present?
            send_local_attachment(connector, to, media_dto, file_name)
          else
            send_remote_media(connector, to, media_dto, file_name)
          end
        end
      end

      def send_audio_message_by_url(connector, to, audio_url)
        payload = {
          number: to,
          audioMessage: { audio: audio_url },
          options: { delay: 0 }
        }

        Base.with_retry(label: 'Send Audio', idempotent: false) do
          response = HTTParty.post(
            "#{connector.base_url}/message/sendWhatsAppAudio/#{connector.instance_name}",
            body: payload.to_json,
            headers: connector.headers
          )
          Rails.logger.info("HTTParty Response (send_audio_message_by_url): #{response.body}")

          raise "Failed to send message: #{response.body}" unless [200, 201].include?(response.code)

          response
        end
      end

      def mark_read_message(connector, remote_jid, id)
        payload = { readMessages: [{ remoteJid: remote_jid, fromMe: false, id: id }] }

        Base.with_retry(label: 'Mark Read') do
          response = HTTParty.put(
            "#{connector.base_url}/chat/markMessageAsRead/#{connector.instance_name}",
            body: payload.to_json,
            headers: connector.headers
          )
          Rails.logger.info("HTTParty Response (mark_read_message): #{response.body}")

          raise "Failed to send message: #{response.body}" unless [200, 201].include?(response.code)
        end
      end

      def send_presence(connector, number, presence)
        payload = { presence: presence, number: number }

        Base.with_retry(label: 'Send Presence') do
          response = HTTParty.post(
            "#{connector.base_url}/message/sendPresenceUpdate/#{connector.instance_name}",
            body: payload.to_json,
            headers: connector.headers
          )
          Rails.logger.info("HTTParty Response (send_presence): #{response.body}")

          raise "Failed to send message: #{response.body} (#{response.code})" unless [200, 201].include?(response.code)

          response
        end
      end

      def retriever_media_message(connector, id, msg_type = :audio, base64 = nil, payload = nil)
        payload ||= { key: { id: id } }

        Base.with_retry(label: 'Retriever media') do
          res = post_net_http(connector, payload)
          return Base64.strict_encode64(res.body) if base64

          file_path = Rails.root.join('tmp', "#{SecureRandom.hex}.#{Base.file_extension_for(msg_type)}")
          File.write(file_path, res.body, mode: 'wb')
          file_path
        end
      end

      # ---- instance lifecycle --------------------------------------------------

      def activate(connector)
        organization = connector.organization
        connector.instance_name ||= "#{Connector::WhatsappWeb::PREFIX_INSTANCE}#{connector.id}"

        instance_response = HTTParty.post(
          "#{connector.base_url}/instance/create",
          body: {
            instanceName: connector.instance_name,
            syncFullHistory: organization&.features.to_h['sync_message_history'].present?,
            phoneNumberPairing: connector.phone_number_pairing,
            pairingWithCode: connector.phone_number_pairing.present?
          }.to_json,
          headers: connector.headers
        )
        # Só o status: o corpo traz a chave da instância, e o do connect, o código de pareamento.
        Rails.logger.info("HTTParty Response (activate - create): #{instance_response.code}")

        unless [200, 201].include?(instance_response.code)
          Rails.logger.error("Failed to create instance: #{instance_response.body}")
          raise "Failed to create instance: #{instance_response.code}"
        end

        connector.instance_api_key = instance_response.parsed_response.dig('hash', 'apikey')

        setup_webhook!(connector)

        connect_response = HTTParty.get(
          "#{connector.base_url}/instance/connect/#{connector.instance_name}",
          headers: connector.headers
        )
        Rails.logger.info("HTTParty Response (activate - connect): #{connect_response.code}")

        unless [200, 201].include?(connect_response.code)
          Rails.logger.error("Failed to create instance: #{connect_response.body}")
          raise 'Failed to connect instance'
        end

        connector.status = :pending
        connector.save!
      end

      def setup_webhook!(connector)
        webhook_setup_payload = {
          enabled: true,
          url: connector.inbound_url(:evolution, "#{Connector::WhatsappWeb::PREFIX_INSTANCE}#{connector.id}")
        }

        response = HTTParty.post(
          "#{connector.base_url}/webhook/set/#{connector.instance_name}",
          body: webhook_setup_payload.to_json,
          headers: connector.headers
        )
        Rails.logger.info("HTTParty Response (setup_webhook!): #{response.body}")

        return if [200, 201].include?(response.code)

        Rails.logger.error("Failed to create instance: #{response.body}")
        raise 'Failed to connect instance'
      end

      def reload_instance(connector)
        response = HTTParty.get(
          "#{connector.base_url}/instance/reload/#{connector.instance_name}",
          body: {}.to_json,
          headers: connector.headers
        )
        Rails.logger.info("HTTParty Response (reload_instance): #{response.body}")

        raise "Failed to send message: #{response.body}" unless [200, 201].include?(response.code)

        response
      end

      def logout_instance(connector)
        response = HTTParty.delete(
          "#{connector.base_url}/instance/logout/#{connector.instance_name}",
          headers: connector.headers
        )
        Rails.logger.info("HTTParty Response (logout_instance): #{response.body}")

        raise "Failed to send message: #{response.body}" unless [200, 201, 404, 401].include?(response.code)

        connector.update(status: :closed)
        response
      end

      def fetch_current_information(connector)
        connector.instance_name ||= "#{Connector::WhatsappWeb::PREFIX_INSTANCE}#{connector.id}"

        instance_response = HTTParty.get(
          "#{connector.base_url}/instance/fetchInstances",
          body: { instanceName: connector.instance_name }.to_json,
          headers: connector.headers
        )
        Rails.logger.info("HTTParty Response (fetch_current_information): #{instance_response.code}")

        unless [200, 201].include?(instance_response.code)
          Rails.logger.error("Failed to retrieve instance: #{instance_response.body}")
          return
        end

        current_instance =
          instance_response.find { _1.dig('instance', 'instanceName').eql?(connector.instance_name) }&.[]('instance')
        return if current_instance.nil?

        connector.number_id           = current_instance['owner']&.split('@')&.first
        connector.profile_picture_url = current_instance['profilePictureUrl']
        connector.profile_name        = current_instance['profileName']
      end

      def retriever_media_message_complete(connector, id, message, msg_type = :audio, resp_base64 = nil)
        payload = { key: { id: id }, message: message }

        res = post_net_http(connector, payload)
        return Base64.strict_encode64(res.body) if resp_base64

        file_path = Rails.root.join('tmp', "#{SecureRandom.hex}.#{Base.file_extension_for(msg_type)}")
        File.write(file_path, res.body, mode: 'wb')
        file_path
      end

      # ---- private helpers (module-level) --------------------------------------

      def post_net_http(connector, payload)
        uri = URI("#{connector.base_url}/chat/retrieverMediaMessage/#{connector.instance_name}")
        req = Net::HTTP::Post.new(uri)
        req['Content-Type'] = 'application/json'
        req['apikey']       = connector.provider_api_key
        req.body            = payload.to_json
        Rails.logger.info("Retriever Media Payload: #{req.body}")

        res = Net::HTTP.start(uri.hostname, uri.port, use_ssl: uri.scheme == 'https') { |http| http.request(req) }

        unless res.is_a?(Net::HTTPSuccess)
          raise "A requisição falhou com o código de resposta #{res.code}\nRetorno: #{res.body}"
        end

        res
      end
      private_class_method :post_net_http

      def send_local_attachment(connector, to, media_dto, file_name)
        Rails.logger.info("Sending file: #{media_dto.as_json}")

        File.open(media_dto.attachment, 'rb') do |attachment_file|
          payload = build_media_payload(to, attachment_file, media_dto, file_name)

          response = HTTParty.post(
            "#{connector.base_url}/message/sendMediaFile/#{connector.instance_name}",
            multipart: true,
            body: payload,
            headers: { apikey: connector.provider_api_key }
          )
          Rails.logger.info("HTTParty Response (send_media_message - post file): #{response.body}")

          raise "Failed to send message: #{response.body}" unless [200, 201].include?(response.code)

          response
        end
      end
      private_class_method :send_local_attachment

      def send_remote_media(connector, to, media_dto, file_name)
        response = ::Media::RemoteFile.get(media_dto.media_url)
        raise "Failed to fetch remote media: HTTP #{response.status}" unless response.status == 200

        dir = Dir.mktmpdir
        # `basename`: o nome vem de quem subiu o anexo e não pode escolher onde o arquivo cai.
        tempfile_path = File.join(dir, File.basename(file_name || 'image.jpg'))
        File.write(tempfile_path, response.body, mode: 'wb')

        begin
          File.open(tempfile_path, 'rb') do |temp_file|
            payload = build_media_payload(to, temp_file, media_dto, file_name)

            response = HTTParty.post(
              "#{connector.base_url}/message/sendMediaFile/#{connector.instance_name}",
              multipart: true,
              body: payload,
              headers: { apikey: connector.provider_api_key }
            )
            Rails.logger.info("HTTParty Response (send_media_message - post media): #{response.body}")

            raise "Failed to send message: #{response.body}" unless [200, 201].include?(response.code)

            response
          end
        ensure
          FileUtils.remove_entry(dir)
        end
      end
      private_class_method :send_remote_media

      def build_media_payload(to, file_io, media_dto, file_name)
        payload = {
          number: to,
          attachment: file_io,
          mediatype: media_dto.media_type || 'image',
          fileName: file_name
        }.transform_values { |v| v.is_a?(String) ? v.dup.force_encoding(Encoding::UTF_8) : v }

        if media_dto.caption.present? && %w[image video].include?(media_dto.media_type.to_s)
          payload[:caption] = media_dto.caption
        end

        payload
      end
      private_class_method :build_media_payload
    end
  end
end
