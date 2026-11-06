module FlowRuntime
  # Executa operações de Pipelines para os blocos do fluxo, por `Pipelines::Automation`: mesmas regras e mesmo formato de
  # resposta das funções `kanban.*` que quem escreve script usa. A operação e os argumentos estão em
  # docs/migration/api/pipelines.md.
  class KanbanGateway
    def initialize(context)
      @context = context
    end

    # @return [Hash] `{ ok: true, data: }` ou `{ ok: false, error: }`, com chave símbolo
    def call(operation, *args)
      return { ok: false, error: "no_chat" } unless context.chat

      ::Pipelines::Automation.call(operation, *args, organization: context.organization, chat: context.chat)
    end

    private

    attr_reader :context
  end
end
