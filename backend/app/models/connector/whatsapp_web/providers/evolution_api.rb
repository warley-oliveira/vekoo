# frozen_string_literal: true

class Connector::WhatsappWeb
  module Providers
    # Provider for Evolution API v2 (https://doc.evolution-api.com/v2).
    # Shares the apikey-in-header auth model with [AivaApi] but the v2 endpoint
    # paths and JSON payloads differ — most notably:
    #   - `sendText` uses a top-level `text` field (no `textMessage` wrapper)
    #   - `sendMedia` is JSON (not multipart) and accepts URL or base64 inline
    #   - `sendWhatsAppAudio` uses `{ audio, encoding: true }`
    #   - `markMessageAsRead` is POST (was PUT in v1)
    #   - presence moves to `/chat/sendPresence/{instance}` with options.{delay,presence}
    #   - media retrieval moves to `/chat/getBase64FromMediaMessage/{instance}`
    #     and returns JSON `{ base64, mimetype, ... }`
    #   - instance reload moves to `PUT /instance/restart/{instance}`
    #   - instance creation embeds the webhook block; no separate webhook/set call
    #   - the new instance's apikey is returned at the top-level `hash` field
    #     (string in v2, vs `hash.apikey` object in v1)
    module EvolutionApi
      module_function

      # Eventos que a Evolution entrega no webhook de entrada (Inbound::EvolutionController).
      # Na origem eles vinham por RabbitMQ; aqui não há fila nova na infraestrutura.
      WEBHOOK_EVENTS = %w[
        MESSAGES_UPSERT
        MESSAGES_UPDATE
        SEND_MESSAGE
        CONNECTION_UPDATE
        QRCODE_UPDATED
        PRESENCE_UPDATE
        CONTACTS_UPSERT
        CONTACTS_UPDATE
      ].freeze

      # Folga entre o relógio da app e o da Evolution ao procurar a mensagem
      # recém-enviada pelo `messageTimestamp` (ver `recover_sent_message`).
      SENT_MESSAGE_CLOCK_SKEW = 30

      # ---- messaging -----------------------------------------------------------

      def send_text_message(connector, to, message, reply_to_external_id: nil)
        to = "#{to}@s.whatsapp.net" unless to.end_with?('@s.whatsapp.net')
        payload = { number: to, text: message, delay: 0, presence: 'available' }
        payload[:quoted] = quoted_payload(reply_to_external_id, to) if reply_to_external_id.present?

        Base.with_retry(label: 'Send Text Message', idempotent: false) do
          response = HTTParty.post(
            "#{connector.base_url}/message/sendText/#{connector.instance_name}",
            body: payload.to_json,
            headers: connector.headers
          )
          Rails.logger.info("HTTParty Response (send_text_message): #{response.body}")

          raise_if_number_not_found!(response)
          raise "Failed to send message: #{response.body}" unless (200..299).cover?(response.code)

          # Tolera 2xx sem corpo: levantar aqui faria `with_retry` reenviar o que já saiu.
          Connectors::ExternalId.from(response)
        end
      end

      def send_media_message(connector, to, media_dto)
        file_name = (media_dto.file_name || 'image.jpg').unicode_normalize(:nfkd).gsub(/[^\x00-\x7F]/, '')
        media_value = resolve_media_value(media_dto)

        if media_value.blank?
          raise "Failed to send media: no media_url or local attachment available for DTO #{media_dto.as_json}"
        end

        sent_after = Time.current.to_i - SENT_MESSAGE_CLOCK_SKEW

        Base.with_retry(label: 'Send Media Message', idempotent: false) do
          payload = {
            number: to,
            mediatype: media_dto.media_type || 'image',
            media: media_value,
            mimetype: mimetype_for(media_dto),
            fileName: file_name
          }
          payload[:caption] = media_dto.caption if media_dto.caption.present?
          Rails.logger.info("Payload for send_media_message: #{payload}")

          response = HTTParty.post(
            "#{connector.base_url}/message/sendMedia/#{connector.instance_name}",
            body: payload.to_json,
            headers: connector.headers
          )
          Rails.logger.info("HTTParty Response (send_media_message): #{response.body}")

          raise_if_number_not_found!(response)
          raise "Failed to send message: #{response.body}" unless [200, 201].include?(response.code)
          return response if response.body.present?

          recover_sent_message(connector, to, sent_after) || response
        end
      end

      # A Evolution 2.3.7 responde 2xx com corpo VAZIO em boa parte dos sendMedia,
      # embora a mensagem seja enviada e entregue. Sem o corpo não há `key.id`, então
      # buscamos a mensagem mais recente nossa para o JID. Devolve no mesmo formato
      # do corpo de sucesso (`{ 'key' => { 'id' => ... } }`), ou nil se não achar.
      def recover_sent_message(connector, to, sent_after)
        response = HTTParty.post(
          "#{connector.base_url}/chat/findMessages/#{connector.instance_name}",
          body: { where: { key: { remoteJid: jid_for(to), fromMe: true } }, offset: 5 }.to_json,
          headers: connector.headers
        )
        records = Array(response.parsed_response.try(:dig, 'messages', 'records'))
        record = records.find { |r| r['messageTimestamp'].to_i >= sent_after }
        Rails.logger.warn(
          "[EvolutionApi] sendMedia returned empty body for #{to}; recovered id=#{record&.dig('key', 'id').inspect}"
        )
        record&.slice('key')
      rescue StandardError => e
        Rails.logger.warn("[EvolutionApi] Could not recover sent media id for #{to}: #{e.message}")
        nil
      end

      def send_audio_message_by_url(connector, to, audio_url)
        payload = { number: to, audio: audio_url, encoding: true }

        Base.with_retry(label: 'Send Audio', idempotent: false) do
          response = HTTParty.post(
            "#{connector.base_url}/message/sendWhatsAppAudio/#{connector.instance_name}",
            body: payload.to_json,
            headers: connector.headers
          )
          Rails.logger.info("HTTParty Response (send_audio_message_by_url): #{response.body}")

          unless [200, 201].include?(response.code)
            Rails.logger.error("Failed to send audio message with payload: #{payload}")
            raise "Failed to send message: #{response.body} "
          end

          response
        end
      end

      # POST /chat/whatsappNumbers/{instance}. Cada número vai como JID completo
      # de propósito: o `createJid` da Evolution devolve sem alterar o que já tem
      # `@s.whatsapp.net`, então cada forma é consultada exatamente como enviada.
      # Sem o sufixo, a Evolution aplicaria a própria heurística BR (remove o 9
      # para DDD >= 31) e as duas formas virariam a mesma consulta.
      #
      # Resposta: `[{ "jid", "exists", "number", "name"? }]`, com `number`
      # ecoando o que foi enviado.
      def check_whatsapp_numbers(connector, numbers)
        payload = { numbers: numbers.map { |number| jid_for(number) } }

        Base.with_retry(label: 'Check WhatsApp Numbers') do
          response = HTTParty.post(
            "#{connector.base_url}/chat/whatsappNumbers/#{connector.instance_name}",
            body: payload.to_json,
            headers: connector.headers
          )
          Rails.logger.info("HTTParty Response (check_whatsapp_numbers): #{response.body}")

          raise "Failed to check WhatsApp numbers: #{response.body}" unless (200..299).cover?(response.code)

          Array(response.parsed_response)
        end
      end

      # A Evolution valida o destino antes de enviar e, quando o número não tem
      # conta no WhatsApp, responde 400 com `response.message[].exists == false`.
      def raise_if_number_not_found!(response)
        return unless response.code == 400

        body = response.parsed_response
        return unless body.is_a?(Hash)

        entries = Array(body.dig('response', 'message'))
        return unless entries.any? { |entry| entry.is_a?(Hash) && entry['exists'] == false }

        raise WhatsappNumberNotFoundError, "Number not on WhatsApp: #{response.body}"
      end

      def jid_for(number)
        number = number.to_s
        number.end_with?('@s.whatsapp.net') ? number : "#{number}@s.whatsapp.net"
      end

      # `key` descreve a mensagem ALVO — `fromMe` diz se fomos nós que a
      # enviamos, não quem está reagindo. `emoji` vazio remove a reação
      # (convenção do protocolo; a Evolution valida "um emoji ou string vazia").
      def send_reaction(connector, to, external_message_id, from_me, emoji)
        to = "#{to}@s.whatsapp.net" unless to.end_with?('@s.whatsapp.net')
        payload = {
          key: { remoteJid: to, fromMe: from_me, id: external_message_id },
          reaction: emoji.to_s
        }

        Base.with_retry(label: 'Send Reaction', idempotent: false) do
          response = HTTParty.post(
            "#{connector.base_url}/message/sendReaction/#{connector.instance_name}",
            body: payload.to_json,
            headers: connector.headers
          )
          Rails.logger.info("HTTParty Response (send_reaction): #{response.body}")

          raise "Failed to send reaction: #{response.body}" unless [200, 201].include?(response.code)

          Connectors::ExternalId.from(response)
        end
      end

      def mark_read_message(connector, remote_jid, id)
        payload = { readMessages: [{ remoteJid: remote_jid, fromMe: false, id: id }] }

        Base.with_retry(label: 'Mark Read') do
          response = HTTParty.post(
            "#{connector.base_url}/chat/markMessageAsRead/#{connector.instance_name}",
            body: payload.to_json,
            headers: connector.headers
          )
          Rails.logger.info("HTTParty Response (mark_read_message): #{response.body}")

          raise "Failed to send message: #{response.body}" unless [200, 201].include?(response.code)
        end
      end

      def send_presence(connector, number, presence)
        payload = { number: number, delay: 120, presence: presence,
                    options: { delay: 120, presence: presence, number: number } }

        Base.with_retry(label: 'Send Presence') do
          response = HTTParty.post(
            "#{connector.base_url}/chat/sendPresence/#{connector.instance_name}",
            body: payload.to_json,
            headers: connector.headers
          )
          Rails.logger.info("HTTParty Response (send_presence): #{response.body}")

          # raise "Failed to send message: #{response.body} (#{response.code})" unless [200, 201].include?(response.code)

          response
        end
      end

      def retriever_media_message(connector, id, msg_type = :audio, base64 = nil, payload = nil)
        Rails.logger.info("retriever_media_message: id=#{id}, msg_type=#{msg_type}, base64=#{base64}, payload=#{payload}")
        media_url = payload&.dig(:message, :mediaUrl)

        if media_url.present?
          Rails.logger.info("retriever_media_message: using mediaUrl directly — #{media_url}")
          return fetch_media_from_url(media_url, msg_type, base64)
        end

        body = { message: { key: { id: id } }, convertToMp4: false }

        Base.with_retry(label: 'Retriever media') do
          response = HTTParty.post(
            "#{connector.base_url}/chat/getBase64FromMediaMessage/#{connector.instance_name}",
            body: body.to_json,
            headers: connector.headers
          )

          unless [200, 201].include?(response.code)
            raise "A requisição falhou com o código de resposta #{response.code}\nRetorno: #{response.body}"
          end

          base64_content = response.parsed_response['base64']
          return base64_content if base64

          file_path = Rails.root.join('tmp', "#{SecureRandom.hex}.#{Base.file_extension_for(msg_type)}")
          File.write(file_path, Base64.decode64(base64_content), mode: 'wb')
          file_path
        end
      end

      # ---- instance lifecycle --------------------------------------------------

      def activate(connector)
        connector.instance_name = instance_name_for(connector)

        body = {
          instanceName: connector.instance_name,
          # Campo do contrato da Evolution, não o nosso "conector": sem ele a instância não nasce.
          integration: 'WHATSAPP-BAILEYS',
          qrcode: true,
          webhook: {
            enabled: true,
            url: webhook_url_for(connector),
            byEvents: false,
            base64: false,
            events: WEBHOOK_EVENTS
          }
        }
        body[:number] = connector.phone_number_pairing if connector.phone_number_pairing.present?

        instance_response = HTTParty.post(
          "#{connector.base_url}/instance/create",
          body: body.to_json,
          headers: connector.headers
        )
        # Só o status: o corpo traz a chave da instância e o QR code.
        Rails.logger.info("HTTParty Response (activate - create): #{instance_response.code}")

        # Antes de ler o corpo: erro de gateway vem em HTML, e a tela não deve receber QR vazio.
        unless [200, 201].include?(instance_response.code)
          Rails.logger.error("Failed to create instance: #{instance_response.body}")
          raise "Failed to create instance: #{instance_response.code}"
        end

        qrcode_base64 = instance_response.parsed_response.dig('qrcode', 'base64')
        pair_code = instance_response.parsed_response.dig('qrcode', 'pairingCode').presence

        # Armazena o novo QrCode no cache (será usado na próxima vez)
        Rails.cache.write(
          "qrcode.base64.#{connector.id}",
          qrcode_base64,
          expires_at: Time.now + 5.minutes
        )
        # O código de uma tentativa anterior já não vale: não pode reaparecer ao reconectar.
        if pair_code
          Rails.cache.write("pair_code.#{connector.id}", pair_code, expires_in: 15.minutes)
        else
          Rails.cache.delete("pair_code.#{connector.id}")
        end

        connector.broadcast_connection(status: :qr_updated, base64: qrcode_base64, pairCode: pair_code)

        # In v2 the instance apikey is at the top-level `hash` field (string).
        # We fall back to the v1 nested `hash.apikey` shape so a server still
        # running the older response format doesn't break activation.
        hash_value = instance_response.parsed_response['hash']
        connector.instance_api_key = hash_value.is_a?(Hash) ? hash_value['apikey'] : hash_value

        connector.status = :pending
        connector.save!
      end

      # The v2 create-instance payload already embeds the webhook block; this reconfigures it
      # on an existing instance (ex.: the backend URL changed).
      def setup_webhook!(connector)
        response = HTTParty.post(
          "#{connector.base_url}/webhook/set/#{connector.instance_name}",
          body: {
            webhook: { enabled: true, url: webhook_url_for(connector), byEvents: false, base64: false, events: WEBHOOK_EVENTS }
          }.to_json,
          headers: connector.headers
        )
        Rails.logger.info("HTTParty Response (setup_webhook!): #{response.body}")

        raise "Failed to set webhook: #{response.body}" unless [ 200, 201 ].include?(response.code)

        true
      end

      def reload_instance(connector)
        response = HTTParty.put(
          "#{connector.base_url}/instance/restart/#{connector.instance_name}",
          headers: connector.headers
        )
        Rails.logger.info("HTTParty Response (reload_instance): #{response.body}")

        raise "Failed to reload instance: #{response.body}" unless [200, 201].include?(response.code)

        response
      end

      def logout_instance(connector)
        response = HTTParty.delete(
          "#{connector.base_url}/instance/logout/#{connector.instance_name}",
          headers: connector.headers
        )
        Rails.logger.info("HTTParty Response (logout_instance): #{response.body}")

        raise "Failed to logout instance: #{response.body}" unless [200, 201, 404, 401].include?(response.code)

        connector.update(status: :closed)
        response
      end

      def fetch_current_information(connector)
        connector.instance_name = instance_name_for(connector)

        instance_response = HTTParty.get(
          "#{connector.base_url}/instance/fetchInstances?instanceName=#{connector.instance_name}",
          headers: connector.headers
        )
        # Só o status: a listagem da v2 traz o token de cada instância.
        Rails.logger.info("HTTParty Response (fetch_current_information): #{instance_response.code}")

        unless [200, 201].include?(instance_response.code)
          Rails.logger.error("Failed to retrieve instance: #{instance_response.body}")
          return
        end

        # v2 returns a flat array of instance summaries (no nested `instance` key).
        # Tolerate both shapes so the same provider works against transitional
        # servers that still return the v1-style nested response.
        list = instance_response.parsed_response
        return if list.blank?

        current_instance = list.find do |entry|
          name = if entry.is_a?(Hash) && entry['instance'].is_a?(Hash)
                   entry.dig('instance',
                             'instanceName')
                 else
                   entry['name']
                 end
          name.eql?(connector.instance_name)
        end
        return if current_instance.nil?

        current_instance = current_instance['instance'] if current_instance['instance'].is_a?(Hash)

        owner = current_instance['owner'] || current_instance['ownerJid']
        connector.number_id           = owner&.split('@')&.first
        connector.profile_picture_url = current_instance['profilePictureUrl'] || current_instance['profilePicUrl']
        connector.profile_name        = current_instance['profileName']
      end

      def retriever_media_message_complete(connector, id, _message, msg_type = :audio, resp_base64 = nil)
        retriever_media_message(connector, id, msg_type, resp_base64, nil)
      end

      # ---- helpers -------------------------------------------------------------

      # Resolves the `media` value Evolution v2 expects: a publicly reachable URL (the DTO
      # already makes it absolute) or pure base64 of the local `attachment` file path.
      # Returns nil when none is available; the caller raises a clearer error.
      def resolve_media_value(media_dto)
        url = media_dto.media_url
        return url if url.present?

        path = media_dto.respond_to?(:attachment) ? media_dto.attachment : nil
        return Base64.strict_encode64(File.binread(path)) if path.present? && File.exist?(path.to_s)

        nil
      end
      private_class_method :resolve_media_value

      def instance_name_for(connector)
        connector[:instance_name].presence || "#{Connector::WhatsappWeb::PREFIX_INSTANCE}#{connector.id}"
      end
      private_class_method :instance_name_for

      def quoted_payload(message_id, remote_jid)
        {
          key: { remoteJid: remote_jid, fromMe: false, id: message_id }
        }
      end
      private_class_method :quoted_payload

      def fetch_media_from_url(url, msg_type, as_base64)
        response = HTTParty.get(url)
        raise "Failed to fetch media from URL (#{response.code}): #{url}" unless (200..299).cover?(response.code)

        binary = response.body
        return Base64.strict_encode64(binary) if as_base64

        file_path = Rails.root.join('tmp', "#{SecureRandom.hex}.#{Base.file_extension_for(msg_type)}")
        File.write(file_path, binary, mode: 'wb')
        file_path
      end
      private_class_method :fetch_media_from_url

      def mimetype_for(media_dto)
        case media_dto.media_type.to_s.downcase
        when 'image' then 'image/jpeg'
        when 'video' then 'video/mp4'
        when 'audio' then 'audio/ogg'
        when 'document', 'file' then 'application/octet-stream'
        else 'application/octet-stream'
        end
      end
      private_class_method :mimetype_for

      def webhook_url_for(connector)
        connector.inbound_url(:evolution, "#{Connector::WhatsappWeb::PREFIX_INSTANCE}#{connector.id}")
      end
      private_class_method :webhook_url_for
    end
  end
end
