module ChatMessage
  # Áudio: `content` guarda a transcrição quando houve uma ('-' quando não houve).
  class Audio < ChatMessage::Base
    field :audio_url, type: String

    def type_element
      "audio"
    end

    def media_url(**_args)
      audio_url
    end
  end
end
