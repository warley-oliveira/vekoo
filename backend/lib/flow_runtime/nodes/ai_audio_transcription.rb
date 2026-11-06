module FlowRuntime
  module Nodes
    # Transcreve um áudio. O áudio recebido já chega transcrito (`Chats::AudioTranscriber`, no recebimento), e aí não há
    # nada a pagar. Com `audio_url`, baixa e transcreve, por 1 crédito.
    class AiAudioTranscription < AiBase
      COST = 1
      MAX_BYTES = 25.megabytes
      DEFAULT_SAVE_TO = "last_transcription".freeze
      PLAYGROUND_TEXT = "[transcrição de teste]".freeze

      def call
        url = interpolate(data["audio_url"].to_s).presence
        text = url ? transcribe_url(url) : transcribed_message
        return leave_by_error("no_audio") if text.nil?

        continue(default_next_node_id, variables: { save_var => text }, log: { input: { audio_url: url }, output: { text: text } })
      rescue Llm::NoCredits, SafeHttp::Refused, Timeout::Error, SocketError, SystemCallError, OpenSSL::SSL::SSLError => e
        leave_by_error(e.is_a?(Llm::NoCredits) ? e : e.message.truncate(300))
      end

      private

      def save_var
        data["save_to"].presence || DEFAULT_SAVE_TO
      end

      # O que a mensagem atual diz: é a transcrição, nas de áudio.
      def transcribed_message
        return PLAYGROUND_TEXT if context.playground?

        text = context.last_message&.content.to_s
        Chats::MessageText::NOTHING.include?(text.strip) ? nil : text
      end

      def transcribe_url(url)
        return PLAYGROUND_TEXT if context.playground?
        raise Llm::NoCredits unless organization.consume_credits(COST)

        begin
          text = download_and_transcribe(url)
        rescue StandardError
          organization.refund_credits!(COST)
          raise
        end

        organization.refund_credits!(COST) if text.blank?
        text.presence
      end

      def download_and_transcribe(url)
        response = SafeHttp.request(url, max_bytes: MAX_BYTES)
        return nil unless response.success?

        Tempfile.create([ "flow-audio", File.extname(URI.parse(url).path.to_s).presence || ".ogg" ], binmode: true) do |file|
          file.write(response.body)
          file.flush
          Chats::AudioTranscriber.call(file.path, chat)
        end
      end
    end
  end
end
