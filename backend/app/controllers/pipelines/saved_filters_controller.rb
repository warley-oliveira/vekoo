module Pipelines
  class SavedFiltersController < BaseController
    before_action :set_board
    before_action :set_filter, only: %i[update destroy]

    def index
      favorites = favorite_index
      filters = SavedFilter.for_board(@board).visible_to(current_account).includes(:owner).order(:name, :created_at)

      render json: {
        presets: PresetFilters.all.map { |preset| SavedFilterSerializer.preset(preset, favorite_keys: favorites[:presets]) },
        filters: filters.map { |filter| SavedFilterSerializer.filter(filter, favorite_ids: favorites[:filters], viewer: current_account) }
      }
    end

    def create
      raw = envelope(:saved_filter)
      filter = SavedFilter.new(
        name: raw[:name],
        visibility: raw[:visibility].presence || "private",
        definition: definition_param(raw),
        board: @board,
        organization: current_organization,
        owner: current_account
      )

      if filter.save
        render json: SavedFilterSerializer.filter(filter, favorite_ids: Set.new, viewer: current_account), status: :created
      else
        render_invalid(filter)
      end
    end

    # Só quem criou mexe. O filtro compartilhado os outros só usam.
    def update
      return render_forbidden unless @filter.owned_by?(current_account)

      raw = envelope(:saved_filter)
      attributes = { name: raw[:name], visibility: raw[:visibility] }.compact
      attributes[:definition] = definition_param(raw) if raw.key?(:definition)

      if @filter.update(attributes)
        render json: SavedFilterSerializer.filter(@filter, favorite_ids: favorite_index[:filters], viewer: current_account)
      else
        render_invalid(@filter)
      end
    end

    def destroy
      return render_forbidden unless @filter.owned_by?(current_account)

      @filter.destroy!
      head :no_content
    end

    # { savedFilterId } ou { presetKey }
    def toggle_favorite
      if params[:saved_filter_id].present?
        toggle_saved_filter_favorite
      elsif params[:preset_key].present?
        toggle_preset_favorite
      else
        render_error(
          status: :unprocessable_content,
          code: "unprocessable",
          field: "savedFilterId",
          message: t("pipelines.filters.favorite_target_required")
        )
      end
    end

    private

    def set_filter
      @filter = SavedFilter.for_board(@board).visible_to(current_account).find(params[:id])
    end

    def toggle_saved_filter_favorite
      filter = SavedFilter.for_board(@board).visible_to(current_account).find(params[:saved_filter_id])
      existing = SavedFilterFavorite.find_by(account_id: current_account.id, pipeline_saved_filter_id: filter.id)

      render json: { favorite: toggle_favorite_record(existing, saved_filter: filter, board: @board) }
    end

    def toggle_preset_favorite
      raise ActiveRecord::RecordNotFound unless PresetFilters.key?(params[:preset_key])

      existing = SavedFilterFavorite.find_by(account_id: current_account.id, board_id: @board.id, preset_key: params[:preset_key])

      render json: { favorite: toggle_favorite_record(existing, board: @board, preset_key: params[:preset_key]) }
    end

    # Cria (true) ou remove (false) o favorito de quem pediu.
    def toggle_favorite_record(existing, attributes)
      if existing
        existing.destroy!
        false
      else
        SavedFilterFavorite.create!(attributes.merge(user: current_account))
        true
      end
    end

    def favorite_index
      @favorite_index ||= begin
        records = SavedFilterFavorite.where(account_id: current_account.id, board_id: @board.id)
        {
          filters: records.where.not(pipeline_saved_filter_id: nil).pluck(:pipeline_saved_filter_id).to_set,
          presets: records.where.not(preset_key: nil).pluck(:preset_key).to_set
        }
      end
    end

    # Mapa livre: fica de fora do `permit`, e `FilterDefinition` é quem confere a estrutura.
    def definition_param(raw)
      value = raw[:definition]
      value.respond_to?(:to_unsafe_h) ? value.to_unsafe_h : value
    end
  end
end
