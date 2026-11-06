module Products
  # Baixa uma imagem externa do catálogo para o nosso storage.
  #
  # Espelhar é o que torna a entrega no WhatsApp confiável: a imagem passa a ser servida
  # por nós, sem depender do host do cliente continuar de pé.
  #
  # Falha é o caso comum aqui (link quebrado, formato estranho), e não tem o que tentar
  # de novo: a imagem só continua externa, e o `source_url` segue valendo.
  class MirrorImageJob < ApplicationJob
    queue_as :low

    def perform(image_id)
      image = Image.find_by(id: image_id)
      return if image.nil? || image.hosted?

      remote = RemoteImage.fetch(image.source_url, max_bytes: Image::MAX_BYTES)
      return unless Image::ALLOWED_CONTENT_TYPES.include?(remote.content_type)

      image.file.attach(
        io: StringIO.new(remote.body),
        filename: Image.filename_for(image.product_item_id, remote.content_type),
        content_type: remote.content_type
      )
    rescue StandardError => e
      Rails.logger.warn("[Products::MirrorImageJob] #{image_id}: #{e.class}: #{e.message}")
    end
  end
end
