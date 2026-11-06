module FlowRuntime
  module Nodes
    # O assistente: conversa com o contato, com ferramentas, e sai por uma das saídas quando a condição dela é atendida.
    class AiAssistant < AiBase
      MAX_TURNS_HANDLE = "maxTurns".freeze
      PLAYGROUND_HISTORY = 30
      ENTRY_INSTRUCTION = "(Instrução interna) A conversa acabou de chegar nesta etapa, vinda de outra etapa do atendimento. " \
                          "Inicie esta etapa agora, conforme suas instruções, sem repetir cumprimentos nem o que já foi dito.".freeze
      # A API exige que a última mensagem seja do contato.
      CONTINUE_PROMPT = "(Instrução interna) Continue o atendimento.".freeze
      CHAT_START = "(Início da conversa.)".freeze

      # Quem usa ferramenta roda JavaScript de cliente: precisa do processo de scripts. Sem ferramenta, nem passa por lá.
      def self.script_process?(node, context)
        data = node["data"] || {}
        return false if data["mode"].to_s == "processing" || Array(data["tool_ids"]).compact_blank.empty?

        ToolRegistry.for(organization: context.organization, tool_ids: data["tool_ids"]).any?
      end

      def call
        return process_synchronous if data["mode"].to_s == "processing"

        run_interactive
      end

      private

      def process_synchronous
        outputs = connected_outputs
        return fail_or_error_branch("no_connected_outputs") if outputs.empty?

        verdict = llm.structured(
          system: [ system_prompt, I18n.t("automation.flows.prompts.pick_output") ].compact_blank.join("\n\n"),
          prompt: decision_prompt(outputs),
          schema: enum_schema("decision", outputs.map { |output| output["id"].to_s }),
          size: model_size,
          effort: model_size == "fast" ? "low" : "medium"
        )

        match = outputs.map { |output| output["id"].to_s }.find { |id| id == verdict["decision"].to_s } ||
                outputs.find { |output| output["default"] }&.dig("id") ||
                outputs.first["id"]

        next_id = next_node_id(handle: match) || error_handle_target
        return fail_or_error_branch("no_target_for_#{match}") if next_id.nil?

        continue(next_id, log: { input: { text: last_user_text }, output: { decision: match } })
      rescue *rescued_errors => e
        fail_or_error_branch(failure_reason(e))
      end

      def decision_prompt(outputs)
        lines = outputs.map { |output| "- #{output['id']}: #{output['when'].presence || output['label']}" }.join("\n")
        history = history_messages.map { |message| "#{message[:role]}: #{message[:content]}" }.join("\n")

        "Conversa:\n#{history}\n\nSaídas:\n#{lines}"
      end

      # Modo conversa, com três papéis separados:
      #   1. Turno de entrada: o bloco foi alcançado com uma mensagem que outro bloco de IA já RESPONDEU. Fala primeiro
      #      (sem poder sair) e espera. Se o bloco anterior só decidiu sair, a mensagem continua nova e este bloco a trata.
      #   2. Juiz (ExitJudge): a cada mensagem NOVA do contato, decide ficar ou sair.
      #   3. Conversa: se fica, a IA responde. Ela não tem ferramentas de saída, então nunca "responde e sai" nem "sai sem
      #      responder" por conta própria.
      #
      # Sem nenhuma mensagem ainda (início do teste), só espera o contato falar.
      def run_interactive
        return suspend_for_first_turn if context.last_message.nil?
        return entry_turn unless context.fresh_message?

        context.record_user_message!
        turns = context.node_state(node_id)["turns"].to_i + 1
        context.update_node_state(node_id, "turns" => turns)

        judge = exit_judge(turns)
        decision = judge.call
        report_decision(decision, turns)
        return take_exit(decision, turns) if decision.exit?

        if turn_limit_reached?(turns) && (target = next_node_id(handle: MAX_TURNS_HANDLE))
          return leave(target, turns, decision: MAX_TURNS_HANDLE, reason: I18n.t("automation.flows.judge.turn_limit", count: turns))
        end

        context.consume_message!
        reply(hint: missing_hint(decision), judged: judge.called_model?, log: { decision: decision.output_id, reason: decision.reason, turn: turns })
      rescue *rescued_errors => e
        fail_or_error_branch(failure_reason(e))
      end

      def entry_turn
        context.update_node_state(node_id, "turns" => 0)
        reply(instruction: ENTRY_INSTRUCTION, log: { entry_turn: true })
      rescue *rescued_errors => e
        fail_or_error_branch(failure_reason(e))
      end

      def reply(instruction: nil, hint: nil, judged: false, log: {})
        text = converse(reply_messages, [ instruction, hint, widget_context ].compact_blank.join("\n\n").presence, judged)

        if text.present?
          delivery = dispatcher.send_text(text, sender_name: data["sender_name"].presence, generated: true, usage: llm.conversation_usage)
          context.append_playground_message("assistant", text) if context.playground?
        end

        suspend(:wait_for_message, log: { input: { messages: reply_messages.length }, output: log.merge(reply: text, **(delivery ? delivery.to_log : {})) })
      end

      # Conversa com as ferramentas que o bloco escolheu. O juiz já cobrou a chamada dele, e a rodada não paga duas vezes.
      def converse(messages, instruction, judged)
        registry = ToolRegistry.for(organization: organization, tool_ids: data["tool_ids"])

        llm.converse(
          system: system_prompt,
          messages: messages,
          tools: registry.definitions,
          size: model_size,
          instruction: instruction,
          cost: judged ? Llm.cost_of(model_size) - Llm.cost_of("fast") : nil
        ) do |name, input|
          tool = registry.find(name)
          next { error: "Tool not found" } unless tool

          invoke_tool(tool, input)
        end
      end

      def invoke_tool(tool, input)
        tool.invoke(input, organization: organization, chat: chat)
      rescue ::MiniRacer::Error, MiniRacerEngine::Error => e
        { error: e.message.truncate(500) }
      end

      def exit_judge(turns)
        ExitJudge.new(
          llm: llm,
          outputs: connected_outputs,
          history: history_messages,
          turns: turns,
          min_turns: data["min_turns"] || 1
        )
      end

      def take_exit(decision, turns)
        next_id = next_node_id(handle: decision.output_id)
        return fail_or_error_branch("no_target_for_#{decision.output_id}") if next_id.nil?

        leave(next_id, turns, decision: decision.output_id, reason: decision.reason, data: decision.data)
      end

      def leave(next_id, turns, decision:, reason:, data: {})
        context.update_node_state(node_id, {})
        continue(next_id,
                 variables: data,
                 log: { input: { last_user: last_user_text }, output: { decision: decision, reason: reason, data: data, turn: turns } })
      end

      def turn_limit_reached?(turns)
        limit = data["max_turns"].to_i
        limit.positive? && turns >= limit
      end

      def missing_hint(decision)
        return nil if decision.missing.blank?

        I18n.t("automation.flows.prompts.missing_data", fields: decision.missing.join(", "))
      end

      # No teste, cada decisão aparece na aba de execução, com o motivo.
      def report_decision(decision, turns)
        label = output_handles.find { |output| output["id"].to_s == decision.output_id }&.dig("label")
        dispatcher.report_decision(nodeId: node_id, decision: decision.output_id, label: label, reason: decision.reason, turn: turns)
      end

      # Só as saídas ligadas a um bloco viram opção para a IA: uma saída solta levaria a um caminho que não existe.
      def connected_outputs
        output_handles.reject { |output| [ "onError", MAX_TURNS_HANDLE ].include?(output["id"].to_s) }
                      .select { |output| next_node_id(handle: output["id"]).present? }
      end

      def suspend_for_first_turn
        suspend(:wait_for_message, log: { input: {}, output: { waiting_for_first_user_message: true } })
      end

      # Com `onError` ligado, segue por ele. Senão, a execução para com o motivo: nunca cai em silêncio numa decisão.
      def fail_or_error_branch(reason)
        if (target = error_handle_target)
          continue(target, log: { input: data, output: { error: reason } })
        else
          NodeResult.failure(failure_message(reason), log: { input: data, output: { error: reason } })
        end
      end

      def failure_message(reason)
        case reason.to_s
        when "no_connected_outputs"
          I18n.t("automation.flows.errors.no_connected_outputs")
        when /\Ano_target_for_(.+)\z/
          label = output_handles.find { |output| output["id"].to_s == Regexp.last_match(1) }&.dig("label")
          I18n.t("automation.flows.errors.output_not_connected", label: label || Regexp.last_match(1))
        else
          reason.to_s
        end
      end

      def history_messages
        return context.playground_messages.last(PLAYGROUND_HISTORY).map(&:symbolize_keys) if context.playground?

        messages = data.fetch("use_history", true) ? chat_messages : []
        messages << { role: "user", content: last_user_text } if messages.last&.dig(:role) != "user" && last_user_text.present?
        messages
      end

      # O que a API aceita: nada vazio, começa e termina com o contato.
      def reply_messages
        @reply_messages ||= begin
          messages = history_messages.select { |message| message[:content].present? }
          messages = [ { role: "user", content: CHAT_START } ] + messages unless messages.first&.dig(:role).to_s == "user"
          messages << { role: "user", content: CONTINUE_PROMPT } unless messages.last&.dig(:role).to_s == "user"
          messages
        end
      end

      # A página em que o visitante do widget está, quando a conversa veio de lá.
      def widget_context
        widget = chat&.widget_context.to_h
        return nil if widget.blank?

        I18n.t("automation.flows.prompts.widget_context", context: widget.to_json.truncate_bytes(4_000))
      end
    end
  end
end
