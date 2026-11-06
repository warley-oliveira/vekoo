module HookAction
  # Roda um script. Nunca aqui: `Hooks::ActionPipeline` a manda para `Hooks::CodeRunnerJob`, na fila `scripts`,
  # para o JavaScript da pessoa não dividir processo com quem entrega mensagens. As ações seguintes continuam
  # depois que o script termina, na mesma ordem.
  class CodeRunner < Base
    # Até onde `MiniRacerService` aceita no parâmetro de tempo. Ação de webhook roda em segundo plano.
    TIMEOUT_MS = 15_000

    store_accessor :config, :code

    def script?
      true
    end

    # @return [Object] o resultado do script
    # @raise [::MiniRacer::Error, MiniRacerEngine::Error]
    def run_script(payload, chat)
      MiniRacerService.new(organization, chat).run(code.to_s, payload, timeout_ms: TIMEOUT_MS).result
    end
  end
end
