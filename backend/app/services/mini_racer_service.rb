# Roda um script no contexto de uma organização e, quando houver, de uma conversa. É a porta
# de entrada para os domínios: monta o contexto certo e recusa a conversa de outra
# organização antes de qualquer JavaScript rodar.
#
#   response = MiniRacerService.new(organization, chat).run("return getContactInfo().name;")
#   response.result # => "Maria Souza"
#
# Levanta `MiniRacer::Error` e subclasses. Ver docs/migration/api/script-engine.md.
#
# Na origem esta classe era o laço de chamada de ferramentas da OpenAI, preso às configurações
# do assistente (modelo, temperatura, prompt). Esse laço não veio: os blocos de IA dos fluxos
# ficam sobre a camada `Ai::`.
class MiniRacerService
  attr_reader :session_context

  # @param organization [Organization] obrigatória: sem ela, nada de dado da organização roda
  # @param chat [Chat, nil]
  # @param credentials [Hash, nil] o `credentials` do script: as chaves da ferramenta instalada
  def initialize(organization, chat = nil, credentials: nil)
    raise ArgumentError, "organization é obrigatória" if organization.nil?

    @session_context = MiniRacerEngine::SessionContext.new
    @session_context.set(:organization, organization)
    @session_context.set(:chat, chat)
    @session_context.set(:tool_credentials, credentials) if credentials.present?
    @session_context.validate!
  end

  # @param code [String] corpo de `async function onMessage(params)`
  # @param params [Hash] o `params` do script
  # @param timeout_ms [Integer, nil] tempo total; nil usa `MiniRacerEngine::Limits::DEFAULT_TIMEOUT_MS`
  # @param max_memory [Integer, nil] heap do V8 em bytes; nil usa `DEFAULT_MAX_MEMORY`
  # @param track_caller [Boolean] acrescenta `caller_line` aos eventos, para a tela de testar script
  # @yieldparam name [Symbol] o evento, em geral o método da extensão (`:add_tag`, `:fetch`)
  # @yieldparam payload [Hash] `{ input:, output: }`
  # @return [MiniRacerEngine::Response]
  def run(code, params = {}, timeout_ms: nil, max_memory: nil, track_caller: false, &on_event)
    worker = MiniRacerEngine::Worker.new(@session_context)
    worker.on_event(&on_event) if on_event

    worker.perform(code, params, timeout_ms: timeout_ms, max_memory: max_memory, track_caller: track_caller)
  end
end
