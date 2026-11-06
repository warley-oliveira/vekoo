# frozen_string_literal: true

class Connector::WhatsappWeb
  module Providers
    # Abstract contract every provider module honors. Each method here is the
    # public surface the facade ([Connector::WhatsappWeb]) delegates to via
    # `provider.<method>(connector, ...)`. Implementations live in sibling
    # modules under this namespace (e.g. `Providers::AivaApi`, `Providers::Zapi`).
    #
    # New providers add one file under this directory + register the class in
    # `Connector::WhatsappWeb::PROVIDERS`.
    module Base
      module_function

      # ---- messaging -----------------------------------------------------------
      def send_text_message(_connector, _to, _message, reply_to_external_id: nil)
        raise NotImplementedError
      end

      def send_media_message(_connector, _to, _media_dto)
        raise NotImplementedError
      end

      def send_audio_message_by_url(_connector, _to, _audio_url)
        raise NotImplementedError
      end

      def mark_read_message(_connector, _remote_jid, _id)
        raise NotImplementedError
      end

      # Reage a uma mensagem já existente. `external_message_id` e `from_me`
      # descrevem a mensagem ALVO (from_me = nós a enviamos). `emoji` em branco
      # remove a reação. Só a Evolution implementa hoje.
      def send_reaction(_connector, _to, _external_message_id, _from_me, _emoji)
        raise NotImplementedError
      end

      def send_presence(_connector, _number, _presence)
        raise NotImplementedError
      end

      def retriever_media_message(_connector, _id, _msg_type = :audio, _base64 = nil, _payload = nil)
        raise NotImplementedError
      end

      # Consulta quais números têm conta no WhatsApp. Opcional: o facade só chama
      # quando o provider responde a este método (hoje, só a Evolution).
      #
      # @param numbers [Array<String>] números em dígitos
      # @return [Array<Hash>] `{ 'jid', 'exists', 'number' }` por número consultado
      def check_whatsapp_numbers(_connector, _numbers)
        raise NotImplementedError
      end

      # ---- instance lifecycle --------------------------------------------------
      def activate(_connector)
        raise NotImplementedError
      end

      # ---- shared helpers ------------------------------------------------------

      # Erros em que repetir a chamada não muda o resultado.
      PERMANENT_ERRORS = [WhatsappNumberNotFoundError].freeze

      # Wraps a provider HTTP call in the retry pattern the legacy code used:
      # on StandardError, sleep `wait_seconds`, retry up to `max_retries` times,
      # then re-raise the last exception. State is kept in a local counter so
      # multiple calls don't share retry budget. PERMANENT_ERRORS propagate
      # immediately.
      def with_retry(label:, wait_seconds: 1, max_retries: 2)
        tries = 0
        begin
          yield
        rescue *PERMANENT_ERRORS
          raise
        rescue StandardError => e
          raise if Thread.current[:connector_send_once]

          sleep(wait_seconds)
          tries += 1
          Rails.logger.warn("#{label} retry (#{tries}): #{e.message}")
          retry if tries <= max_retries
          raise
        end
      end

      # Dentro do bloco, nenhuma chamada se repete. Quem pede são as campanhas: um timeout de leitura
      # não diz se a mensagem saiu, e repetir o POST mandaria duas vezes para a mesma pessoa.
      def send_once
        previous = Thread.current[:connector_send_once]
        Thread.current[:connector_send_once] = true
        yield
      ensure
        Thread.current[:connector_send_once] = previous
      end

      # Maps a media `msg_type` symbol to the file extension legacy media
      # retrievers expect when persisting to `tmp/`.
      def file_extension_for(msg_type)
        case msg_type
        when :mp3   then 'mp3'
        when :audio then 'ogg'
        when :image then 'jpg'
        else 'bin'
        end
      end
    end
  end
end
