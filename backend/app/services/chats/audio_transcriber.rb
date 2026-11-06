module Chats
  # Transcrição do áudio recebido (Whisper), para os fluxos terem o que ler. Como na origem,
  # só roda com a automação da conversa ligada e com crédito na organização, sem debitar.
  # Falhou ou não rodou: a mensagem segue sem texto, nunca se perde por causa disso.
  module AudioTranscriber
    ENDPOINT = "https://api.openai.com/v1/audio/transcriptions".freeze

    module_function

    # @return [String, nil]
    def call(path, chat)
      token = ENV["OPENAI_ACCESS_TOKEN"]
      return nil if token.blank? || !chat.automation_enabled
      return nil unless chat.organization&.credits_left.to_i.positive?

      File.open(path, "rb") do |file|
        response = HTTParty.post(
          ENDPOINT,
          multipart: true,
          body: { model: "whisper-1", file: file },
          headers: { "Authorization" => "Bearer #{token}" },
          timeout: 120
        )

        raise "Whisper HTTP #{response.code}" unless response.code == 200

        response.parsed_response["text"]
      end
    rescue StandardError => e
      Rails.logger.error("[Chats::AudioTranscriber] #{e.class}: #{e.message}")
      nil
    end
  end
end
