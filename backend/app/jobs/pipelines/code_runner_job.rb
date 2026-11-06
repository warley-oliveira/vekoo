module Pipelines
  # Executa o JavaScript de uma ação `run_code` de gatilho.
  #
  # Fila `scripts`: processo próprio (`config/sidekiq_scripts.yml`), para um script não derrubar quem
  # entrega mensagens. Sem nova tentativa: o script não é idempotente, e reexecutar duplicaria o que ele
  # fez (enviar mensagem, criar card, chamar API externa).
  #
  # O que o script alcança: `params` com o card e o evento, `kanban.*` e, se o card tem conversa, as
  # extensões de contato. O que ele muda não dispara outro gatilho, como vale para as outras ações:
  # sem isso, um gatilho de "card movido" cujo código move o card rodaria para sempre.
  class CodeRunnerJob < ApplicationJob
    queue_as :scripts
    sidekiq_options retry: false
    # Qualquer erro já foi tratado em `perform`. Isto é a garantia: nada volta para a fila.
    discard_on StandardError

    MAX_ERROR_LENGTH = 300
    MAX_RESULT_LENGTH = 2_000

    def perform(trigger_id, action_index, card_id, organization_id, event_context_json = "{}")
      organization = Organization.find_by(id: organization_id)
      return if organization.nil?

      trigger = Trigger.joins(:board).where(pipeline_boards: { organization_id: organization.id }).find_by(id: trigger_id)
      card = Card.find_by(id: card_id, organization_id: organization.id)
      return if trigger.nil? || card.nil? || !trigger.active?

      action = Array(trigger.actions)[action_index.to_i]
      # O gatilho pode ter mudado entre enfileirar e rodar.
      return unless action.is_a?(Hash) && action["type"] == "run_code"

      execute(organization, trigger, card, action, event_context_json)
    end

    private

    def execute(organization, trigger, card, action, event_context_json)
      chat = card.chat
      service = MiniRacerService.new(organization, chat)
      service.session_context.set(MiniRacerEngine::Workers::Kanban::SUPPRESS_TRIGGERS_KEY, true)

      response = Time.use_zone(Pipelines.time_zone_for(organization)) do
        service.run(action["code"].to_s, script_params(trigger, card, event_context_json), timeout_ms: timeout_ms(action))
      end

      succeed(trigger, card, response.result)
    rescue MiniRacer::ScriptTerminatedError
      fail_with(trigger, card, chat, I18n.t("pipelines.triggers.failures.code_timeout", ms: timeout_ms(action)))
    rescue MiniRacer::V8OutOfMemoryError
      fail_with(trigger, card, chat, I18n.t("pipelines.triggers.failures.code_memory"))
    rescue MiniRacer::Error, MiniRacerEngine::Error => e
      fail_with(trigger, card, chat, e.message)
    rescue StandardError => e
      Rails.logger.error("[Pipelines::CodeRunnerJob] gatilho #{trigger.id}: #{e.class}: #{e.message}")
      fail_with(trigger, card, chat, I18n.t("pipelines.triggers.failures.code_internal"))
    end

    # Uma conversa ainda não é exigida: card sem contato também roda, e o script lê `params.card`. O
    # formato é o mesmo de `kanban.*`, para quem já escreve script.
    def script_params(trigger, card, event_context_json)
      {
        card: MiniRacerEngine::Workers::Kanban::Payloads.card(card),
        board: { id: trigger.board_id, name: trigger.board.name },
        trigger: { id: trigger.id, name: trigger.name },
        event: JSON.parse(event_context_json.presence || "{}")
      }
    end

    def timeout_ms(action)
      value = action["timeout_ms"].presence&.to_i
      return Trigger::DEFAULT_CODE_TIMEOUT_MS if value.nil? || !value.positive?

      value.clamp(Trigger::MIN_CODE_TIMEOUT_MS, Trigger::MAX_CODE_TIMEOUT_MS)
    end

    def succeed(trigger, card, result)
      log_execution(trigger, card, "success", { type: "run_code", status: "success", result: result.to_json.truncate(MAX_RESULT_LENGTH) })
      trigger.resolve_failure_alert!
    rescue StandardError => e
      Rails.logger.error("[Pipelines::CodeRunnerJob] registro: #{e.class}: #{e.message}")
    end

    def fail_with(trigger, card, chat, message)
      text = message.to_s.truncate(MAX_ERROR_LENGTH)
      Rails.logger.warn("[Pipelines::CodeRunnerJob] gatilho #{trigger.id}: #{text}")

      log_execution(trigger, card, "failure", { type: "run_code", status: "failure", error: text }, text)
      note_in_chat(chat, text)
      trigger.raise_failure_alert!(card)
    rescue StandardError => e
      Rails.logger.error("[Pipelines::CodeRunnerJob] registro da falha: #{e.class}: #{e.message}")
    end

    # A falha fica visível na própria conversa, como na origem. As outras ações do gatilho já rodaram:
    # este job é assíncrono, e nada é levantado de novo.
    def note_in_chat(chat, text)
      return if chat.nil?

      ChatMessage::Text.create(
        role: "base",
        role_base_type: "error",
        content: I18n.t("pipelines.triggers.failures.code_note", message: text),
        chat: chat
      )
    end

    def log_execution(trigger, card, status, outcome, error = nil)
      TriggerExecution.create!(
        trigger: trigger, card: card, status: status, executed_actions: [ outcome ],
        error_message: error, executed_at: Time.current
      )
    end
  end
end
