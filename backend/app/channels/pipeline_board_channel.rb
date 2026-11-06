# Tempo real de um quadro. Só leitura: tudo que muda passa pela API.
#
#   { channel: "PipelineBoardChannel", boardId: "..." }
#
# Cada evento chega como `{ event: "card_moved", data: { ...camelCase... } }`. Ver
# docs/migration/api/pipelines.md.
#
# Duas streams: a do quadro, com eventos estruturais (etapas, campos), e a de cards, cujo conteúdo é
# restrito. O nome da stream de cards muda junto com a regra de visibilidade: quem ficou com a
# assinatura antiga deixa de receber, em vez de continuar vendo cards a que perdeu acesso. Por isso,
# ao receber `card_visibility_changed`, a tela refaz a assinatura.
class PipelineBoardChannel < ApplicationCable::Channel
  # Melhor esforço, como nos outros domínios: um soluço no Redis não pode desfazer a gravação do card.
  # Quem perdeu o aviso relê o quadro ao reconectar.
  def self.broadcast_board_event(board, event:, data:)
    deliver(board, board_stream(board.id), event: event, data: data)
  end

  def self.broadcast_card_event(board, assignee_id:, event:, data:)
    deliver(board, full_card_stream(board), event: event, data: data)
    broadcast_personal_card_event(board, assignee_id, event: event, data: data)
  end

  # Só para o responsável: o card que entrou ou saiu do campo de visão dele.
  def self.broadcast_personal_card_event(board, account_id, event:, data:)
    return unless account_id && board.card_visibility_restricted?

    deliver(board, personal_card_stream(board.id, account_id), event: event, data: data)
  end

  def self.card_stream_for(board, account)
    return full_card_stream(board) if Pipelines::CardVisibility.new(board, account).unrestricted?

    personal_card_stream(board.id, account.id)
  end

  def self.board_stream(board_id)
    "pipeline-board:#{board_id}"
  end

  def self.full_card_stream(board)
    mode = board.card_visibility_restricted? ? Digest::SHA256.hexdigest(board.card_visibility_bypass_role_ids.join("-")) : "all"
    "pipeline-board:#{board.id}:cards:#{mode}"
  end

  def self.personal_card_stream(board_id, account_id)
    "pipeline-board:#{board_id}:cards:account:#{account_id}"
  end

  def self.deliver(board, stream, payload)
    ActionCable.server.broadcast(organization_stream(board.organization_id, stream), payload)
  rescue StandardError => e
    Rails.logger.warn("[PipelineBoardChannel] transmissão perdida: #{e.class}: #{e.message}")
  end
  private_class_method :deliver

  def subscribed
    # Mesma regra da API: sem o recurso `pipelines`, os eventos também não chegam.
    return reject unless current_account.can?(:pipelines)

    board = current_organization.pipeline_boards.find_by(id: params[:boardId] || params[:board_id])
    return reject unless board

    stream_from organization_stream(self.class.board_stream(board.id))
    stream_from organization_stream(self.class.card_stream_for(board, current_account))
  end

  def unsubscribed
    stop_all_streams
  end
end
