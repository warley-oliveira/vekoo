module Media
  # Onde a mídia das conversas fica guardada: blobs do Active Storage, sem tabela própria.
  #
  # Na origem cada mídia recebida virava um `ChatAttachment`/`AudioAttachment`, que aqui são
  # do domínio inbox (anexos escolhidos pela pessoa). A mídia recebida de um provedor não é
  # anexo de ninguém: é só o arquivo daquela mensagem, e morre com ela
  # (`ChatMessage::Base#media_blob_id`).
  module Storage
    module_function

    # @return [ActiveStorage::Blob]
    def store_file(path, filename:, content_type: nil)
      File.open(path, "rb") { |file| store_io(file, filename: filename, content_type: content_type) }
    end

    # Sem `content_type` o Active Storage identifica pelo conteúdo.
    def store_io(io, filename:, content_type: nil)
      ActiveStorage::Blob.create_and_upload!(
        io: io,
        filename: filename.to_s.presence || "arquivo",
        content_type: content_type.presence,
        identify: content_type.blank?
      )
    end

    # Caminho da rota proxy, sem host: é ele que fica guardado na mensagem, para continuar
    # válido mesmo se o domínio da API mudar (mesma regra de UploadSerializer). A tela
    # prefixa com a URL da API.
    def path_for(blob)
      Rails.application.routes.url_helpers.rails_storage_proxy_url(blob, only_path: true)
    end

    # URL absoluta, para quem está fora: o provedor que vai baixar a mídia que enviamos.
    def public_url(url_or_path)
      value = url_or_path.to_s
      return nil if value.blank?
      return value if value.match?(%r{\Ahttps?://}i)

      "#{backend_url}#{value.start_with?('/') ? '' : '/'}#{value}"
    end

    def backend_url
      ENV.fetch("BACKEND_URL") { "http://localhost:#{ENV.fetch('RAILS_PORT', 3000)}" }.chomp("/")
    end

    def purge(blob_id)
      return if blob_id.blank?

      ActiveStorage::Blob.find_by(id: blob_id)&.purge_later
    end
  end
end
