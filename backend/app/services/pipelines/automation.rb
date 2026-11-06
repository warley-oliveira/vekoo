module Pipelines
  # A porta de entrada para quem automatiza fora de um script: os blocos `kanban_*` dos fluxos. É o
  # mesmo código de `kanban.*`, então valem as mesmas regras e o mesmo retorno.
  #
  #   Pipelines::Automation.call(:create_card, board_id, stage_id, { "title" => "Novo" }, organization:, chat:)
  #   # => { ok: true, data: { id: "...", title: "Novo", kanban_column_id: "...", ... } }
  #   # => { ok: false, error: "not_found: Board 'x' not found" }
  #
  # A operação e os argumentos estão na seção "API Ruby" de docs/migration/api/pipelines.md.
  module Automation
    module_function

    # @param source [String] quem assina os comentários que a operação criar
    # @raise [MiniRacerEngine::Error] conversa de outra organização
    def call(operation, *args, organization:, chat: nil, source: "flow")
      session = MiniRacerEngine::SessionContext.new
      session.set(:organization, organization)
      session.set(:chat, chat)
      session.set(MiniRacerEngine::Workers::Kanban::COMMENT_SOURCE_KEY, source)
      session.validate!

      MiniRacerEngine::Workers::Kanban.new.call_operation(MiniRacerEngine::Worker.new(session), operation, *args)
    end
  end
end
