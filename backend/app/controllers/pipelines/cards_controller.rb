module Pipelines
  class CardsController < BaseController
    include FilterableByQuery

    MAX_BULK_IDS = 500

    before_action :set_board
    before_action :set_card_from_id, only: %i[show update destroy move archive mark_won mark_lost reopen watch unwatch]

    def index
      cards = apply_filters(visible_cards.active.includes(CardSerializer::PRELOADS))

      if filter_requested?
        cards = CardQuery.call(
          board: @board, definition: resolve_card_filter!, current_account: current_account, base_scope: cards
        )
      end

      return render json: { count: cards.count } if params[:count_only].present?

      records, meta = paginate(cards)
      render json: { cards: CardSerializer.many(records, viewer: current_account, chat_summary: true), meta: meta }
    end

    def show
      render json: CardSerializer.detail(@card, viewer: current_account)
    end

    # { card: { stageId, title, ... } }. Com `createFromChat`, título e descrição saem da conversa.
    def create
      stage = find_stage(envelope(:card)[:stage_id])
      attributes = creation_attributes

      card = if attributes[:chat_id].present? && envelope(:card)[:create_from_chat].to_s == "true"
        CardCreatorFromChat.call(
          chat: visible_chat!(attributes[:chat_id]),
          board: @board,
          stage: stage,
          created_by: current_account,
          attributes: attributes.except(:chat_id).to_h.symbolize_keys
        )
      else
        visible_chat!(attributes[:chat_id]) if attributes[:chat_id].present?
        stage ||= @board.stages.first
        raise ActiveRecord::RecordNotFound unless stage

        stage.cards.create!(attributes.merge(created_by: current_account))
      end

      render json: card_json(card.reload), status: :created
    end

    def update
      attributes = card_params
      new_chat = attributes[:chat_id]
      visible_chat!(new_chat) if new_chat.present? && new_chat != @card.chat_id

      Card.transaction do
        @card.update!(attributes.except(:label_ids))
        @card.sync_labels!(attributes[:label_ids]) if attributes.key?(:label_ids)
      end

      render json: card_json(@card.reload)
    end

    def destroy
      @card.destroy!
      head :no_content
    end

    # { stageId, position }. `position` é o índice na lista que a pessoa enxerga, a partir de 1.
    def move
      stage = @board.stages.find(params[:stage_id])
      result = MoveCard.call(card: @card, stage: stage, position: real_position(params[:position].presence&.to_i, stage))
      return render_move_blocked(result) unless result.moved?

      render json: card_json(@card.reload)
    end

    def archive
      if params[:undo].to_s == "true"
        @card.update!(archived: false)
      else
        @card.archive!
      end

      render json: card_json(@card)
    end

    def mark_won
      gate = DealCloseGate.new(@card, :won).call
      return render_deal_close_blocked(gate) unless gate.allowed?

      @card.mark_won!
      render json: card_json(@card)
    end

    # { lostReason }
    def mark_lost
      gate = DealCloseGate.new(@card, :lost).call
      return render_deal_close_blocked(gate) unless gate.allowed?

      @card.mark_lost!(params[:lost_reason].presence&.to_s)
      render json: card_json(@card)
    end

    def reopen
      @card.reopen_deal!
      render json: card_json(@card)
    end

    # { cardIds: [...], assignedToId?, priority?, status?, archived?, tags? }. Tudo ou nada.
    def bulk_update
      ids = Array(params[:card_ids]).map(&:to_s).uniq
      return render_too_many_ids if ids.size > MAX_BULK_IDS

      updates = params.permit(:assigned_to_id, :priority, :status, :archived, tags: []).to_h

      Card.transaction do
        visible_cards.where(id: ids).find_each { |card| card.update!(updates) }
      end

      head :no_content
    end

    # { stageId, orderedIds }. Só para reordenar dentro da etapa: mudar de etapa é `move`, que confere as
    # travas. Na origem, um id de outra etapa passava por aqui e pulava o checklist obrigatório.
    def reorder
      stage = @board.stages.find(params[:stage_id])
      siblings = stage.cards

      if visibility_for(@board).unrestricted?
        Reorder.call(scope: siblings, ordered_ids: ordered_ids, lock_key: stage.id)
      else
        Reorder.among(scope: visibility_for(@board).scope(siblings), ordered_ids: ordered_ids, lock_key: stage.id)
      end

      # A ordem completa da etapa: quem só vê os próprios cards ignora os ids que não conhece.
      PipelineBoardChannel.broadcast_board_event(
        @board, event: "cards_reordered", data: { stageId: stage.id, orderedIds: stage.cards.active.reload.map(&:id) }
      )
      head :no_content
    end

    # Seguir o card: quem segue recebe os avisos de SLA e de gatilho "notificar".
    def watch
      @card.watchers.find_or_create_by!(account: current_account)
      @card.broadcast_progress_change

      render json: { watching: true }
    rescue ActiveRecord::RecordNotUnique
      render json: { watching: true }
    end

    def unwatch
      @card.watchers.where(account: current_account).destroy_all
      @card.broadcast_progress_change

      render json: { watching: false }
    end

    private

    def set_card_from_id
      @card = visible_cards.find(params[:id])
    end

    def find_stage(id)
      id.present? ? @board.stages.find(id) : nil
    end

    def card_params
      raw = envelope(:card)
      attributes = raw.permit(
        :title, :description, :status, :priority, :audience_id, :assigned_to_id, :chat_id,
        :color_label, :deal_value, :deal_probability, :company_name,
        :contact_email, :contact_phone, :lost_reason, :expected_close_date,
        tags: [], label_ids: [], custom_field_values: {}, description_json: {}
      )
      attributes[:due_date] = normalize_time(raw[:due_date]) if raw.key?(:due_date)
      # `permit(description_json: {})` deixa `null` para trás, e é assim que se limpa a descrição.
      attributes[:description_json] = nil if raw.key?(:description_json) && raw[:description_json].nil?
      attributes
    end

    def creation_attributes
      attributes = card_params.except(:label_ids)
      # Sem isto, o card criado por quem só vê os próprios sumiria na hora.
      attributes[:assigned_to_id] = current_account.id if attributes[:assigned_to_id].blank? && !visibility_for(@board).unrestricted?
      attributes
    end

    # A pessoa só liga card a uma conversa que ela enxerga. Fora disso é "não existe", como no chat.
    def visible_chat!(id)
      chat = Chat.visible_to(current_account).where(id: id.to_s).take
      raise ActiveRecord::RecordNotFound unless chat

      chat
    end

    def card_json(card)
      CardSerializer.one(card, batch: CardBatch.new([ card ], viewer: current_account), chat_summary: true, description_json: true)
    end

    # O índice que chega é na lista que a pessoa enxerga. A posição de verdade também conta os cards que
    # não aparecem: os de outras pessoas, em quadro restrito, e os arquivados, que continuam na lista. Na
    # origem, só o primeiro caso era tratado, e soltar um card ao lado de outro numa etapa com arquivados
    # o deixava fora do lugar.
    def real_position(view_position, stage)
      return nil if view_position.nil?

      siblings = visible_cards.active.where(stage_id: stage.id).where.not(id: @card.id).to_a
      return view_position if siblings.empty?

      target = siblings[[ view_position, 1 ].max - 1]
      position = target ? target.position : siblings.last.position + 1
      moving_down = @card.stage_id == stage.id && @card.position < position
      moving_down ? position - 1 : position
    end

    def apply_filters(cards)
      cards = cards.by_priority(params[:priority].to_s) if params[:priority].present?
      cards = by_uuid(cards, :assigned_to_id, params[:assigned_to_id]) if params[:assigned_to_id].present?
      cards = cards.by_tags(Array(params[:tags]).map(&:to_s)) if params[:tags].present?
      cards = cards.by_chat(params[:chat_id].to_s) if params[:chat_id].present?
      cards = cards.search_by_title(params[:search].to_s) if params[:search].present?
      cards = by_due_date(cards) if params[:due_date_from].present? || params[:due_date_to].present?
      cards = cards.overdue if params[:overdue].to_s == "true"
      cards
    end

    # `where(coluna_uuid: "abc")` vira `IS NULL`: um filtro inválido devolveria os cards sem responsável.
    def by_uuid(cards, column, value)
      Pipelines.uuid?(value) ? cards.where(column => value.to_s) : cards.none
    end

    def by_due_date(cards)
      from = parse_day(params[:due_date_from])&.in_time_zone&.beginning_of_day || Time.at(0)
      to = parse_day(params[:due_date_to])&.in_time_zone&.end_of_day || 100.years.from_now

      cards.by_due_date_range(from, to)
    end

    # Data que não é data: fica sem aquele limite, em vez de um 500.
    def parse_day(value)
      value.present? ? Date.parse(value.to_s) : nil
    rescue Date::Error
      nil
    end

    def render_move_blocked(result)
      if result.error == :checklist_incomplete
        render_error(
          status: :unprocessable_content,
          code: "checklistIncomplete",
          message: t("pipelines.cards.checklist_incomplete"),
          details: { pendingItems: result.pending_items }
        )
      else
        render_error(
          status: :unprocessable_content,
          code: "requiredFieldsIncomplete",
          message: t("pipelines.cards.required_fields_incomplete"),
          details: { pendingFields: result.pending_fields }
        )
      end
    end

    # O mesmo código da trava de mover, mais as chaves: é o que a tela usa para saber quais campos pedir.
    def render_deal_close_blocked(gate)
      render_error(
        status: :unprocessable_content,
        code: "requiredFieldsIncomplete",
        message: t("pipelines.cards.required_fields_incomplete"),
        details: { pendingFields: gate.pending_fields, pendingFieldKeys: gate.pending_field_keys }
      )
    end

    def render_too_many_ids
      render_error(status: :unprocessable_content, code: "tooManyIds", message: t("pipelines.too_many_ids", max: MAX_BULK_IDS))
    end
  end
end
