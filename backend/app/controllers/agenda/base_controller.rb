module Agenda
  # Base do calendário: a mesma permissão para tudo, e a organização sempre da sessão. Id de outra
  # organização não acha nada: 404, sem dizer que existe.
  class BaseController < PlatformController
    require_permission :calendar

    rescue_from TimeInput::Invalid do
      render_error(status: :unprocessable_entity, code: "invalidTime", message: t("agenda.errors.invalid_time"))
    end

    # Duas requisições passam juntas pela validação de unicidade (dois cliques em "Inscrever").
    # Quem chega depois ouve um 422, não um 500.
    rescue_from Mongo::Error::OperationFailure do |error|
      raise error unless error.code == 11_000

      render_error(status: :unprocessable_entity, code: "conflict", message: t("agenda.errors.conflict"))
    end

    private

    # O envelope precisa ser um objeto. `{ "calendar": "x" }` é o mesmo que não ter mandado.
    def envelope(key)
      value = params.require(key)
      raise ActionController::ParameterMissing.new(key) unless value.respond_to?(:permit)

      value
    end

    def set_calendar
      @calendar = Calendar.scoped(current_organization.id, params[:calendar_id])
      render_not_found unless @calendar
    end

    def set_class_group
      @class_group = @calendar.class_groups.where(id: params[:class_group_id]).take
      render_not_found unless @class_group
    end

    # Lista de regras: `null` é "apagar todas", e não deixar como está. O `permit` tira a chave
    # nula, por isso a conferência é no que chegou.
    def rule_list(permitted, received, key)
      permitted[key] = [] if received.key?(key) && received[key].nil?
      permitted
    end
  end
end
