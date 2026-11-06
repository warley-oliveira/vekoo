module Pipelines
  # Base dos quadros: a mesma permissão para tudo, a organização sempre da sessão e o fuso dela.
  class BaseController < PlatformController
    require_permission :pipelines

    # Valores de campo e descrição do editor: as chaves são dados, e não viram snake_case.
    self.opaque_params += %w[custom_field_values description_json card_custom_field_values]

    around_action :use_organization_time_zone

    # Duas requisições passam juntas pela validação de unicidade (mesma etiqueta, mesma meta). Quem
    # chega depois ouve um 422, não um 500.
    rescue_from ActiveRecord::RecordNotUnique do
      render_error(status: :unprocessable_content, code: "conflict", message: t("pipelines.conflict"))
    end

    rescue_from Reorder::TooManyIds do
      render_error(status: :unprocessable_content, code: "tooManyIds", message: t("pipelines.too_many_ids", max: Reorder::MAX_IDS))
    end

    private

    # "Hoje", "este mês" e a meta do mês valem no fuso da organização, e não no UTC do processo.
    def use_organization_time_zone(&block)
      Time.use_zone(Pipelines.time_zone_for(current_organization), &block)
    end

    # O envelope precisa ser um objeto. `{ "card": "x" }` é o mesmo que não ter mandado, e não um 500
    # no `permit`.
    def envelope(key)
      value = params.require(key)
      raise ActionController::ParameterMissing.new(key) unless value.respond_to?(:permit)

      value
    end

    def set_board
      @board = current_organization.pipeline_boards.find(params[:board_id])
    end

    def visibility_for(board)
      (@card_visibilities ||= {})[board.id] ||= CardVisibility.new(board, current_account)
    end

    def visible_cards
      visibility_for(@board).scope(@board.cards)
    end

    def set_card
      @card = visible_cards.find(params[:card_id])
    end

    # Apagar etapa ou quadro levaria junto cards que a pessoa não enxerga.
    def require_full_card_access!
      render_forbidden unless visibility_for(@board).unrestricted?
    end

    # A API aceita o prazo como vem a data na resposta (milissegundos) ou em texto ISO 8601.
    def normalize_time(value)
      return value if value.blank?
      return Time.zone.at(value.to_f / 1000) if value.is_a?(Numeric) || value.to_s.match?(/\A\d+\z/)

      value
    end

    def ordered_ids
      Array(params[:ordered_ids]).map(&:to_s)
    end

    # Só arquivo de verdade: um texto qualquer seria lido como id assinado de um blob e estouraria.
    def real_files(files)
      Array(files).select { |file| file.respond_to?(:read) }
    end
  end
end
