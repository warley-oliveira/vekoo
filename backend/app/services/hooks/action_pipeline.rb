module Hooks
  # Roda as ações de um webhook em ordem: a do contato primeiro, porque é ela quem acha a conversa, depois
  # "iniciar fluxo", depois as demais pela ordem de criação (como na origem). Quem precisa de script para o
  # pipeline ali: `Hooks::CodeRunnerJob` roda o JavaScript na fila `scripts` e chama de volta com o resto.
  class ActionPipeline
    FIRST = %w[HookAction::ContactHandling HookAction::StartFlow].freeze

    # @param hook [Hook]
    # @param capture [Hash] o que veio de Hooks::Capture
    # @param log_id [String, nil] o log onde o desfecho de um script vai ser anotado
    def initialize(hook, capture, log_id: nil)
      @hook = hook
      @capture = capture
      @log_id = log_id
      @payload = SlimJsonPath.fetch_all_slim(Capture.payload_of(capture))
    end

    # @param action_ids [Array<String>, nil] quais ações, quando retoma depois de um script
    # @param chat [Chat, nil] a conversa, quando retoma
    # @param clean [Boolean] nenhum script anterior falhou
    # @return [Boolean] true se foi até o fim; false se o resto ficou com um script, que retoma depois
    def run(action_ids: nil, chat: nil, clean: true)
      actions = ordered_actions(action_ids)

      actions.each_with_index do |action, index|
        if action.script?
          hand_over_to_scripts(action, chat, actions.drop(index + 1), clean)
          return false
        end

        chat = perform(action, chat)
      end

      # A entrega inteira deu certo: o alerta de uma falha anterior deixa de valer.
      hook.resolve_failure_alert! if clean && !hook.alerted?
      true
    end

    private

    attr_reader :hook, :capture, :log_id, :payload

    def ordered_actions(action_ids)
      actions = hook.hook_actions.to_a
      actions = actions.select { |action| action_ids.map(&:to_s).include?(action.id.to_s) } if action_ids
      actions.sort_by.with_index { |action, index| [ FIRST.index(action.type) || FIRST.size, index ] }
    end

    def perform(action, chat)
      if action.is_a?(HookAction::StartFlow)
        action.perform(payload, chat, request: Capture.for_log(capture).slice("body", "query"))
      else
        action.perform(payload, chat)
      end
      action.current_chat || chat
    end

    def hand_over_to_scripts(action, chat, remaining, clean)
      CodeRunnerJob.perform_later(hook.id, hook.organization_id, action.id, chat&.id&.to_s, capture, remaining.map(&:id), log_id, clean && !hook.alerted?)
    end
  end
end
