# `Engines::GenerationError` como resposta da API: o código é o contrato
# (`refPending`, `brandNotPublished`…), a mensagem já nomeia o fato que
# barrou, no idioma da requisição.
module PieceErrors
  extend ActiveSupport::Concern

  included do
    rescue_from Engines::GenerationError, with: :render_generation_error
  end

  private

  def render_generation_error(error)
    return render_values_invalid(error.details[:errors]) if error.code == "valuesInvalid"

    details = error.details.transform_keys(&:to_s)
    render_error(
      status: :unprocessable_entity,
      code: error.code,
      field: details["field"],
      message: t("pieces.errors.#{error.code.underscore}", fact: details["factLabel"], default: t("pieces.errors.render_failed")),
      details: details
    )
  end

  def render_values_invalid(errors)
    details = Array(errors).each_with_object({}) do |(path, code), map|
      (map[path] ||= []) << t("errors.messages.#{code}", default: t("errors.unprocessable"))
    end

    render_error(
      status: :unprocessable_entity,
      code: "unprocessable",
      field: details.keys.first,
      message: t("pieces.errors.values_invalid"),
      details: details
    )
  end
end
