# Apoio às specs dos pipelines. Espera um `organization` no contexto de quem chama.
module PipelinesHelpers
  # O caminho base de um quadro.
  def board_path(board, suffix = "")
    "/pipelines/boards/#{board.id}#{suffix}"
  end

  def card_path(card, suffix = "")
    "/pipelines/boards/#{card.stage.board_id}/cards/#{card.id}#{suffix}"
  end

  # Um quadro com etapas, de uma vez. As etapas vêm na ordem pedida.
  def board_with_stages(organization, *names, **attributes)
    board = create(:pipeline_board, organization: organization, **attributes)
    stages = names.map { |name| create(:pipeline_stage, board: board, name: name) }
    [ board, *stages ]
  end

  # Só quem atende, sem grupo: as permissões vêm de `InboxHelpers#member_with`.
  def pipelines_member(target = organization)
    member_with(target, pipelines: "all")
  end
end

RSpec.configure do |config|
  config.include PipelinesHelpers
end
