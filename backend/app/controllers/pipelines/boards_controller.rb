module Pipelines
  class BoardsController < BaseController
    include FilterableByQuery

    ARCHIVED_PER_PAGE = 50

    before_action :set_board_from_id, only: %i[show update destroy archive metrics archived_cards]
    before_action :require_full_card_access!, only: :destroy

    # É também o que o menu lateral consome (`usePipelineBoards`): `{ boards: [{ id, name, ... }] }`.
    def index
      scope = current_organization.pipeline_boards
      boards = (params[:archived].to_s == "true" ? scope.archived : scope.active).ordered.to_a
      ids = boards.map(&:id)

      cards_counts = visible_cards_counts(boards, ids)
      stages_counts = Stage.unscoped.where(board_id: ids).group(:board_id).count
      stages_by_board = params[:with_stages].to_s == "true" ? stages_by_board(ids) : nil

      render json: {
        boards: boards.map do |board|
          BoardSerializer.one(
            board,
            viewer: current_account,
            cards_count: cards_counts[board.id] || 0,
            stages_count: stages_counts[board.id] || 0,
            stages: stages_by_board && (stages_by_board[board.id] || [])
          )
        end,
        meta: { total: boards.size }
      }
    end

    def show
      render json: detail_json(@board, filter_requested? ? filtered_card_ids : nil)
    end

    def create
      attributes = envelope(:board).permit(:name, :description, :color, :icon, :board_type, :template_key)

      board = if attributes[:template_key].present?
        BoardFactory.create_from_template(
          template_key: attributes[:template_key],
          organization: current_organization,
          name: attributes[:name],
          board_type: attributes[:board_type]
        )
      else
        BoardFactory.create_blank(
          name: attributes[:name],
          organization: current_organization,
          description: attributes[:description],
          color: attributes[:color],
          icon: attributes[:icon],
          board_type: attributes[:board_type].presence || "standard"
        )
      end

      render json: detail_json(board), status: :created
    end

    def update
      attributes = board_params.to_h
      return if visibility_change_rejected?(attributes)
      return if lead_score_field_rejected?(attributes)

      if @board.update(attributes)
        render json: detail_json(@board)
      else
        render_invalid(@board)
      end
    end

    def destroy
      @board.destroy!
      head :no_content
    end

    # `{ "undo": true }` tira do arquivo.
    def archive
      params[:undo].to_s == "true" ? @board.unarchive! : @board.archive!

      render json: BoardSerializer.one(@board, viewer: current_account)
    end

    def metrics
      render json: BoardMetrics.call(@board, cards: visible_cards)
    end

    def archived_cards
      cards = visible_cards.includes(CardSerializer::PRELOADS)

      cards = case params[:status]
      when "archived" then cards.archived.where(won_at: nil, lost_at: nil)
      when "won" then cards.won
      when "lost" then cards.lost
      else cards.where("pipeline_cards.archived = TRUE OR pipeline_cards.won_at IS NOT NULL OR pipeline_cards.lost_at IS NOT NULL")
      end

      cards = cards.search_by_title(params[:search].to_s) if params[:search].present?

      records, meta = paginate(cards.reorder(updated_at: :desc, id: :desc), per_page: ARCHIVED_PER_PAGE)

      render json: { cards: records.map { |card| CardSerializer.archived(card) }, meta: meta }
    end

    private

    def set_board_from_id
      @board = current_organization.pipeline_boards.find(params[:id])
    end

    def filtered_card_ids
      CardQuery.call(
        board: @board,
        definition: resolve_card_filter!,
        current_account: current_account,
        base_scope: visible_cards.active
      ).unscope(:order).pluck(:id).to_set
    end

    def board_params
      envelope(:board).permit(
        :name, :description, :color, :icon, :board_type,
        :auto_archive_days, :deal_close_behavior, :deal_close_archive_days, :deal_rotting_days,
        :require_fields_on_deal_won, :require_fields_on_deal_lost,
        :lead_score_field_key, :lead_score_low, :lead_score_high,
        :card_visibility, card_visibility_bypass_role_ids: []
      )
    end

    def visible_cards_counts(boards, ids)
      counts = Card.unscoped.where(archived: false).joins(:stage).where(pipeline_stages: { board_id: ids })
      restricted = boards.reject { |board| visibility_for(board).unrestricted? }.map(&:id)

      if restricted.any?
        counts = counts.where(
          "pipeline_stages.board_id NOT IN (:restricted) OR pipeline_cards.assigned_to_id = :account",
          restricted: restricted, account: current_account.id
        )
      end

      counts.group("pipeline_stages.board_id").count
    end

    # Duas travas: quem está restrito não pode se liberar alterando a regra, e ninguém pode salvar uma
    # regra que o tranque para fora da própria configuração.
    def visibility_change_rejected?(attributes)
      return false unless attributes.key?("card_visibility") || attributes.key?("card_visibility_bypass_role_ids")

      was_unrestricted = visibility_for(@board).unrestricted?
      @board.assign_attributes(attributes.slice("card_visibility", "card_visibility_bypass_role_ids"))
      return false unless @board.card_visibility_settings_changed?

      unless was_unrestricted
        render_forbidden
        return true
      end

      @card_visibilities = nil
      return false if @board.invalid? || visibility_for(@board).unrestricted?

      render_error(
        status: :unprocessable_content,
        code: "visibilityLockout",
        field: "cardVisibilityBypassRoleIds",
        message: t("pipelines.boards.visibility_lockout")
      )
      true
    end

    def lead_score_field_rejected?(attributes)
      key = attributes["lead_score_field_key"]
      return false if key.blank? || @board.custom_fields.exists?(key: key, field_type: "number")

      render_error(
        status: :unprocessable_content,
        code: "invalidLeadScoreField",
        field: "leadScoreFieldKey",
        message: t("pipelines.boards.invalid_lead_score_field")
      )
      true
    end

    # As etapas, sem cards, de vários quadros numa consulta só: para seletores, como os dos fluxos, que
    # não precisam do quadro inteiro.
    def stages_by_board(ids)
      Stage.unscoped
           .where(board_id: ids)
           .order(:board_id, :position)
           .pluck(:board_id, :id, :name, :position)
           .group_by(&:first)
           .transform_values { |rows| rows.map { |_, id, name, position| { id: id, name: name, position: position } } }
    end

    def detail_json(board, matching_ids = nil)
      stages = board.stages.to_a
      cards = visibility_for(board).scope(board.cards).active.includes(CardSerializer::PRELOADS).to_a
      cards = cards.select { |card| matching_ids.include?(card.id) } if matching_ids

      BoardSerializer.detail(
        board,
        viewer: current_account,
        stages: stages,
        cards_by_stage: cards.group_by(&:stage_id),
        batch: CardBatch.new(cards, viewer: current_account),
        applied_filter: applied_filter_meta
      )
    end
  end
end
