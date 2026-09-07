class UploadSerializer < ApplicationSerializer
  # `url` aponta para a rota **proxy** do Active Storage, não para uma URL
  # assinada e expirável: ela vai parar dentro do jsonb do carrossel e precisa
  # continuar válida daqui a um ano. O proxy também passa pelo CORS que o front
  # já tem — e disso depende a exportação, que rasteriza a imagem no navegador.
  def self.one(upload)
    {
      id: upload.id,
      name: upload.filename,
      # `only_path` porque o host da API não é o do front: URL absoluta aqui
      # amarraria o documento ao domínio de hoje.
      url: Rails.application.routes.url_helpers.rails_storage_proxy_url(
        upload.file.variant(:display), only_path: true
      ),
      width: upload.width,
      height: upload.height,
      byteSize: upload.byte_size,
      createdAt: epoch_ms(upload.created_at)
    }
  end
end
