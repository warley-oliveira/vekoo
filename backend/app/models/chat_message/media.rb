module ChatMessage
  # Vídeo, documento, figurinha, enfim toda mídia que não é imagem simples nem áudio.
  # Em `media_type`: o tipo do anexo ('video', 'document', 'sticker') ou o mime type
  # que o provedor informou.
  class Media < ChatMessage::Base
    field :media_type, type: String
    field :media_url, type: String
    field :caption, type: String
    field :media_properties, type: Hash, default: {}

    def type_element
      "media"
    end
  end
end
