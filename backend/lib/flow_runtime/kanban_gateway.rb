module FlowRuntime
  # Executa operações de Pipelines para os blocos do fluxo, pela extensão `kanban` do motor de scripts: mesmas regras e
  # mesmo formato de resposta das funções `kanban.*` que quem escreve script usa.
  #
  # **Desligado até a integração com o domínio pipelines.** Os blocos já estão no catálogo e respondem "Pipelines ainda
  # não disponível". Para ligar, troque `available?`: precisa de `MiniRacerEngine::Workers::Kanban#call_operation` e de
  # `Pipelines::Card`. Ver docs/migration/api/automation.md.
  class KanbanGateway
    UNAVAILABLE = "pipelines_unavailable".freeze

    def self.available?
      false
    end

    def initialize(context)
      @context = context
    end

    def call(operation, *args)
      return { ok: false, error: UNAVAILABLE } unless self.class.available?
      return { ok: false, error: "no_chat" } unless context.chat

      MiniRacerEngine::Workers.const_get(:Kanban).new.call_operation(worker, operation, *args)
    end

    private

    attr_reader :context

    def worker
      session = MiniRacerEngine::SessionContext.new
      session.set(:chat, context.chat)
      session.set(:organization, context.organization)
      MiniRacerEngine::Worker.new(session)
    end
  end
end
