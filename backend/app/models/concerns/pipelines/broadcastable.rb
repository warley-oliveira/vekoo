module Pipelines
  # Transmite o que acontece com o card para quem está no quadro. Sempre depois do commit, e o
  # conteúdo sai do `CardSerializer`: sem resumo da conversa, porque o evento vai para todo mundo no
  # quadro e nem todos enxergam a conversa (`Chat.visible_to`).
  module Broadcastable
    extend ActiveSupport::Concern

    included do
      attr_accessor :suppress_broadcast

      before_save :capture_broadcast_context
      after_create_commit :broadcast_card_created
      after_update_commit :broadcast_card_updated
      before_destroy :capture_destroy_data
      after_destroy_commit :broadcast_card_destroyed
    end

    def broadcast_json
      CardSerializer.one(self)
    end

    # O card em si não mudou, mas o que o quadro mostra dele sim: progresso do checklist, observadores.
    def broadcast_progress_change
      return if suppress_broadcast || destroyed?

      broadcast_to_board("card_updated", broadcast_json)
    end

    private

    # Antes do save, enquanto o dirty tracking é confiável. Um segundo save na mesma transação (o
    # `insert_at` depois da troca de etapa) não pode apagar a mudança de etapa já vista. Nascer numa
    # etapa não é mudar de etapa: sem o `persisted?`, a primeira edição depois de criar o card, na mesma
    # instância, sairia como `card_moved`.
    def capture_broadcast_context
      if persisted? && will_save_change_to_stage_id?
        @broadcast_stage_moved = true
        @broadcast_prev_stage_id = stage_id_in_database
      else
        @broadcast_stage_moved ||= false
      end

      return unless persisted? && will_save_change_to_assigned_to_id? && !defined?(@broadcast_prev_assignee_id)

      @broadcast_prev_assignee_id = assigned_to_id_in_database
    end

    def broadcast_card_created
      return if suppress_broadcast
      return if stage.blank?

      broadcast_to_board("card_created", broadcast_json)
    end

    def broadcast_card_updated
      return if suppress_broadcast
      return if stage.blank?

      json = broadcast_json
      broadcast_assignee_change(json)

      if @broadcast_stage_moved
        broadcast_to_board("card_moved", json.merge(previousStageId: @broadcast_prev_stage_id))
      else
        broadcast_to_board("card_updated", json)
      end
    ensure
      @broadcast_stage_moved = false
      @broadcast_prev_stage_id = nil
      remove_instance_variable(:@broadcast_prev_assignee_id) if defined?(@broadcast_prev_assignee_id)
    end

    # Em quadro restrito, o card precisa sumir da tela do ex-responsável e surgir na do novo: sem
    # isso, cada um só veria a mudança ao recarregar.
    def broadcast_assignee_change(json)
      return unless defined?(@broadcast_prev_assignee_id)

      previous_id = @broadcast_prev_assignee_id
      return if previous_id == assigned_to_id

      PipelineBoardChannel.broadcast_personal_card_event(
        board, previous_id, event: "card_deleted", data: { id: id, stageId: stage_id }
      )
      return if archived

      PipelineBoardChannel.broadcast_personal_card_event(board, assigned_to_id, event: "card_created", data: json)
    end

    def capture_destroy_data
      @destroyed_card_data = { id: id, stage_id: stage_id, board: board, assignee_id: assigned_to_id }
    end

    def broadcast_card_destroyed
      return if @destroyed_card_data&.dig(:board).blank?

      PipelineBoardChannel.broadcast_card_event(
        @destroyed_card_data[:board],
        assignee_id: @destroyed_card_data[:assignee_id],
        event: "card_deleted",
        data: { id: @destroyed_card_data[:id], stageId: @destroyed_card_data[:stage_id] }
      )
    end

    def broadcast_to_board(event, data)
      current_board = board
      return unless current_board

      PipelineBoardChannel.broadcast_card_event(current_board, assignee_id: assigned_to_id, event: event, data: data)
    end
  end
end
