# Caminho da imagem na rota proxy do Active Storage, como em `UploadSerializer`: não
# expira, passa pelo CORS do front e não amarra a resposta ao domínio de hoje. O front
# prefixa com a URL da API, do mesmo jeito que faz com as imagens do editor.
module StoredImagePath
  def self.for(attachment, variant)
    return nil unless attachment.attached?

    Rails.application.routes.url_helpers.rails_storage_proxy_url(attachment.variant(variant), only_path: true)
  end
end
