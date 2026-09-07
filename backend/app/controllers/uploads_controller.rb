# POST /uploads — a imagem que a pessoa escolhe no editor.
#
# Multipart, não JSON: mandar o arquivo em base64 dentro de um corpo JSON
# custaria um terço a mais de banda e memória para nada.
class UploadsController < AuthenticatedController
  def create
    file = params.require(:file)

    return render_unsupported_file(file) unless Upload.acceptable?(file)

    upload = current_organization.uploads.new(
      account: current_account,
      filename: file.original_filename,
      content_type: file.content_type,
      byte_size: file.size
    )
    upload.file.attach(file)

    if upload.save
      measure(upload)
      render json: UploadSerializer.one(upload), status: :created
    else
      render_invalid(upload)
    end
  end

  private

  # A análise do Active Storage é um job. Aqui ela roda na hora: a resposta
  # precisa sair com largura e altura, senão o editor não sabe enquadrar a
  # imagem que a pessoa acabou de escolher.
  def measure(upload)
    upload.file.analyze unless upload.file.analyzed?
    metadata = upload.file.metadata
    upload.update_columns(width: metadata["width"], height: metadata["height"])
  rescue StandardError => e
    # Sem dimensões o editor ainda funciona (cai no enquadramento central);
    # perder o upload inteiro por causa disso, não.
    Rails.logger.warn("upload #{upload.id}: análise falhou (#{e.class})")
  end

  def render_unsupported_file(file)
    too_big = file.size.to_i > Upload::MAX_BYTES

    render_error(
      status: :unprocessable_entity,
      code: "unprocessable",
      field: "file",
      message: too_big ? t("uploads.too_large") : t("uploads.unsupported_type"),
      details: { "file" => [ too_big ? t("uploads.too_large") : t("uploads.unsupported_type") ] }
    )
  end
end
