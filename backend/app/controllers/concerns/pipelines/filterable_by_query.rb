module Pipelines
  # Resolve o filtro avançado de uma leitura de cards (`GET /cards`, `GET /boards/:id`). Ordem de
  # precedência: `savedFilterId`, `presetKey` e `filter` (JSON em texto). Quem inclui tem `@board`.
  module FilterableByQuery
    extend ActiveSupport::Concern

    class FilterResolutionError < StandardError
      attr_reader :code

      def initialize(code)
        @code = code
        super(code.to_s)
      end
    end

    included do
      rescue_from FilterResolutionError do |error|
        if error.code == :invalid_filter
          render_error(status: :unprocessable_content, code: "invalidFilter", message: t("pipelines.filters.errors.invalid_json"))
        else
          render_not_found
        end
      end

      rescue_from CardQuery::InvalidDefinitionError, RelativeDate::InvalidToken do |error|
        render_error(
          status: :unprocessable_content,
          code: "invalidFilter",
          message: error.message,
          details: error.respond_to?(:details) ? error.details : nil
        )
      end
    end

    private

    def filter_requested?
      params[:saved_filter_id].present? || params[:preset_key].present? || params[:filter].present?
    end

    # @return [Hash] a definição do filtro
    # @raise [FilterResolutionError] 404 ou 422, quando não dá para resolver
    def resolve_card_filter!
      if params[:saved_filter_id].present?
        resolve_saved_filter
      elsif params[:preset_key].present?
        resolve_preset
      else
        parse_inline_filter
      end
    end

    def resolve_saved_filter
      filter = SavedFilter.for_board(@board).visible_to(current_account).find_by(id: params[:saved_filter_id].to_s)
      return filter.definition if filter

      raise FilterResolutionError, :not_found
    end

    def resolve_preset
      PresetFilters.definition_for(params[:preset_key]) || raise(FilterResolutionError, :not_found)
    end

    def parse_inline_filter
      parsed = params[:filter].is_a?(String) ? JSON.parse(params[:filter]) : nil
      raise FilterResolutionError, :invalid_filter unless parsed.is_a?(Hash)

      parsed
    rescue JSON::ParserError
      raise FilterResolutionError, :invalid_filter
    end

    def applied_filter_meta
      if params[:saved_filter_id].present?
        { savedFilterId: params[:saved_filter_id].to_s }
      elsif params[:preset_key].present?
        { presetKey: params[:preset_key].to_s }
      elsif params[:filter].present?
        { inline: true }
      end
    end
  end
end
