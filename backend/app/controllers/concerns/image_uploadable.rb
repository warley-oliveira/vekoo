# Foto de perfil e logo: multipart no campo `file`, JPEG, PNG ou WebP de até 2 MB.
#
# O tipo é conferido pelos bytes, não pelo que o navegador declara: um texto que se diz
# PNG passaria na declaração e estouraria depois, na hora de gerar a variante.
module ImageUploadable
  extend ActiveSupport::Concern

  IMAGE_CONTENT_TYPES = %w[image/jpeg image/png image/webp].freeze
  IMAGE_MAX_BYTES = 2.megabytes
  IMAGE_MAX_LABEL = "2 MB".freeze

  private

  # Devolve true se anexou. Se recusou, a resposta de erro já foi renderizada.
  def attach_image(attachment)
    file = params.require(:file)

    return render_image_refusal(t("uploads.unsupported_type")) unless real_image?(file)
    return render_image_refusal(t("uploads.too_large", max: IMAGE_MAX_LABEL)) if file.size > IMAGE_MAX_BYTES

    attachment.attach(file)
    true
  end

  def real_image?(file)
    return false unless file.respond_to?(:tempfile)

    IMAGE_CONTENT_TYPES.include?(Marcel::MimeType.for(file.tempfile))
  end

  def render_image_refusal(message)
    render_error(
      status: :unprocessable_content,
      code: "unprocessable",
      field: "file",
      message: message,
      details: { "file" => [ message ] }
    )
    false
  end
end
