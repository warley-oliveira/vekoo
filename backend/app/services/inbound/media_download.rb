module Inbound
  # Baixa a mídia de uma mensagem recebida para um arquivo local, conforme o canal: cada
  # provedor entrega de um jeito (id de mídia, URL pública ou payload da própria mensagem).
  module MediaDownload
    Result = Struct.new(:path, :content_type, :file_size, keyword_init: true)

    module_function

    # Imagem, vídeo e documento.
    def media(connector, reference, message_id:, properties:, raw:)
      if connector.respond_to?(:download_media_object)
        extension = media_extension(properties)
        file = connector.download_media_object(media_id: reference, format: extension)
        Result.new(path: file.file_path, content_type: file.mime_type, file_size: file.file_size)
      elsif connector.respond_to?(:retriever_media_message_with_payload)
        Result.new(path: connector.retriever_media_message_with_payload(message_id, msg_type: :image, payload: raw))
      else
        Result.new(path: connector.download_media(reference))
      end
    end

    def audio(connector, reference, message_id:, raw:)
      path =
        if connector.respond_to?(:retrieve_audio_message)
          connector.retrieve_audio_message(reference)
        elsif connector.respond_to?(:retriever_media_message_with_payload)
          connector.retriever_media_message_with_payload(message_id, payload: raw.presence || audio_payload(reference))
        else
          connector.download_media(reference)
        end

      Result.new(path: with_real_extension(path))
    end

    # A Meta baixa para `.bin`: o tipo real sai do conteúdo.
    def with_real_extension(path)
      return path unless path.present? && File.extname(path.to_s) == ".bin" && File.exist?(path)

      extension = MiniMime.lookup_by_content_type(Marcel::MimeType.for(Pathname.new(path.to_s)))&.extension
      return path if extension.blank? || extension == "bin"

      # Marcel chama de `application/ogg` e o MiniMime devolve `.ogx`, que o Whisper recusa.
      extension = "ogg" if extension == "ogx"

      renamed = "#{path.to_s.delete_suffix('.bin')}.#{extension}"
      File.rename(path, renamed)
      renamed
    end

    def cleanup(path)
      File.delete(path) if path.present? && File.exist?(path)
    rescue StandardError => e
      Rails.logger.error("[Inbound::MediaDownload] Error deleting #{path}: #{e.message}")
    end

    # Sem o payload da mensagem, a URL recebida faz o papel dele.
    def audio_payload(reference)
      { message: { mediaUrl: reference }, audio: { audioUrl: reference } }
    end

    # A extensão do documento vem do nome original e, sem ele, do mime type. Nunca é nil:
    # o arquivo guardado sempre carrega uma extensão usável.
    def media_extension(properties)
      name = properties[:fileName].to_s
      mime_type = properties[:mime_type] || properties[:mimetype]
      return "jpg" if name.blank? && mime_type.to_s.start_with?("image")

      extension = File.extname(name).delete(".").downcase
      return extension if extension.present?

      from_mime = Rack::Mime::MIME_TYPES.key(mime_type)&.delete(".")
      return from_mime if from_mime.present?

      mime_type.to_s.split("/").last.presence || "bin"
    end
  end
end
