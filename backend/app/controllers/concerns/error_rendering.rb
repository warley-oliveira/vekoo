# Um único formato de erro para a API inteira:
#
#   { "error": { "code": "wrongPassword", "field": "password", "message": "…" } }
#
# `code` é o contrato de máquina — é dele que a tela decide o que fazer (o
# front já trabalha assim, com `AuthErrorCode`). `message` é a mesma coisa dita
# em gente, já no idioma da requisição, para quando a tela não conhecer o
# código.
module ErrorRendering
  extend ActiveSupport::Concern

  included do
    rescue_from ActiveRecord::RecordNotFound, with: :render_not_found
    rescue_from ActiveRecord::RecordInvalid, with: :render_record_invalid
    rescue_from ActionController::ParameterMissing, with: :render_parameter_missing
  end

  private

  def render_error(status:, code:, field: nil, message: nil, details: nil)
    fallback = t("errors.#{code.to_s.underscore}", default: t("errors.unprocessable"))
    error = { code: code, message: message.presence || fallback }
    error[:field] = field if field
    error[:details] = details if details

    render json: { error: error }, status: status
  end

  def render_not_found(_exception = nil)
    render_error(status: :not_found, code: "notFound", message: t("errors.not_found"))
  end

  def render_unauthorized
    render_error(status: :unauthorized, code: "unauthorized", message: t("errors.unauthorized"))
  end

  def render_record_invalid(exception)
    render_invalid(exception.record)
  end

  # Erros de validação viram um mapa campo → mensagens, com o primeiro campo
  # inválido em destaque (é nele que a tela põe o foco).
  def render_invalid(record)
    details = record.errors.group_by(&:attribute).transform_values { |errors|
      errors.map(&:message)
    }

    render_error(
      status: :unprocessable_entity,
      code: "unprocessable",
      field: camelize(details.keys.first),
      message: record.errors.full_messages.first || t("errors.unprocessable"),
      details: details.transform_keys { |key| camelize(key) }
    )
  end

  def render_parameter_missing(exception)
    render_error(
      status: :bad_request,
      code: "parameterMissing",
      field: camelize(exception.param),
      message: t("errors.parameter_missing", param: exception.param)
    )
  end

  def camelize(key)
    key.to_s.camelize(:lower)
  end
end
