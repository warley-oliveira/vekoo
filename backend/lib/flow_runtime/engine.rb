module FlowRuntime
  # Executa um fluxo, bloco a bloco, até precisar esperar ou acabar.
  #
  # Quem executa é quem ganhou a linha (`FlowExecution.claim`): dois eventos da mesma conversa nunca rodam o mesmo
  # bloco, e uma execução interrompida no meio de um bloco não é repetida. Fica `running` até
  # `Flows::SweepStaleExecutionsJob` a dar por interrompida: o bloco pode já ter enviado a mensagem, e enviar duas
  # vezes é pior do que parar e avisar.
  #
  # Bloco que roda JavaScript de cliente não roda aqui se este processo não for o de scripts: a execução segue para
  # `Flows::ScriptStepJob`, na fila `scripts`, faz só aquele bloco e volta.
  class Engine
    class << self
      # @return [FlowExecution, nil] nil quando já há uma execução viva deste fluxo nesta conversa
      def start(flow:, chat: nil, last_message: nil, variables: {}, playground: false, version: nil, idempotency_key: nil, event: nil, depth: 0)
        version ||= flow.published_version || flow.draft_version
        raise ArgumentError, "Flow has no usable version" unless version

        # O que o fluxo já coletou nesta conversa é o ponto de partida. O que vem explícito tem prioridade.
        stored = playground ? {} : ChatData.stored_values(chat, flow, version)

        execution = FlowExecution.create!(
          flow: flow,
          flow_version: version,
          organization_id: flow.organization_id,
          chat_id: chat&.id&.to_s,
          contact_id: chat&.external_id,
          status: "running",
          run_token: SecureRandom.hex(8),
          locked_at: Time.current,
          context: {
            "variables" => Limits.bound_variables(stored.merge(variables.to_h.stringify_keys)),
            "message_seq" => last_message ? 1 : 0,
            "event" => event,
            "depth" => depth
          }.compact,
          playground: playground,
          started_at: Time.current,
          current_node_id: version.entry_node_id,
          idempotency_key: idempotency_key
        )
        new(execution).run(last_message: last_message)
      rescue ActiveRecord::RecordNotUnique
        nil
      end

      # Retoma quem estava esperando. Só o primeiro a chegar executa: quem perde devolve nil.
      #
      # @param from [String, Array<String>] de qual estado
      # @param resume_token [String, nil] a espera por tempo só volta com o token dela
      # @return [FlowExecution, nil]
      def resume(execution, last_message: nil, override_node_id: nil, from: "waiting_for_message", resume_token: nil)
        token = FlowExecution.claim(execution.id, from: from, resume_token: resume_token)
        return nil unless token

        execution.reload
        changes = {}
        # Cada mensagem nova do contato ganha um número: os blocos sabem se já foi avaliada (ver #fresh_message?).
        if last_message
          changes[:context] = execution.context.merge(
            "message_seq" => execution.context["message_seq"].to_i + 1,
            "last_message_id" => last_message.message_id
          ).compact
        end
        changes[:current_node_id] = override_node_id if override_node_id
        execution.update!(changes) if changes.any?

        new(execution).run(last_message: last_message)
      end
    end

    # @param script_process [Boolean] este processo é o da fila `scripts`
    def initialize(execution, script_process: false)
      @execution = execution
      @script_process = script_process
      @steps = 0
    end

    def run(last_message: nil)
      @last_message = last_message

      loop do
        return finalize_complete unless execution.current_node_id
        return execution unless still_ours?

        node = execution.flow_version.find_node(execution.current_node_id)
        return finalize_failure(I18n.t("automation.flows.errors.node_missing", id: execution.current_node_id)) unless node
        return finalize_failure(I18n.t("automation.flows.errors.too_many_steps", count: Limits::MAX_STEPS_PER_RUN)) if out_of_steps?

        handler = handler_for(node)
        return finalize_failure(I18n.t("automation.flows.errors.unknown_block", type: node["type"])) unless handler

        ctx = ExecutionContext.new(execution: execution, last_message: @last_message)
        return hand_over_to_scripts if !@script_process && handler.script_process?(node, ctx)

        result = run_node(node, handler, ctx)

        case result.kind
        when :continue
          advance(result)
          return hand_back_from_scripts if @script_process
        when :suspend
          return finalize_suspend(node, result)
        when :complete
          apply_variables(result)
          return finalize_complete
        when :failure
          return finalize_failure(result.error_message)
        end
      end
    rescue Limits::TooLarge, ActiveRecord::RecordInvalid => e
      finalize_failure(e.message)
    end

    private

    attr_reader :execution

    def handler_for(node)
      NodeRegistry.for(node["type"])
    rescue NodeRegistry::UnknownNodeType
      nil
    end

    # Alguém cancelou (teste parado, fluxo arquivado) enquanto o bloco anterior rodava.
    def still_ours?
      FlowExecution.where(id: execution.id, status: "running", run_token: execution.run_token).exists?
    end

    def out_of_steps?
      @steps >= Limits::MAX_STEPS_PER_RUN || execution.context["steps"].to_i >= Limits::MAX_STEPS_PER_EXECUTION
    end

    def run_node(node, handler, ctx)
      broadcast_playground(:node_entered, nodeId: node["id"], nodeType: node["type"])
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      result = handler.new(node, ctx).call
      duration_ms = ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).to_i
      log_node(node, result, duration_ms)
      broadcast_playground(:node_completed, nodeId: node["id"], nodeType: node["type"], status: log_status_for(result), durationMs: duration_ms)
      result
    rescue StandardError => e
      Rails.logger.error("[FlowRuntime] bloco #{node['id']} (#{node['type']}) falhou: #{e.class}: #{e.message}\n#{Array(e.backtrace).first(5).join("\n")}")
      log_failure(node, e)
      broadcast_playground(:node_completed, nodeId: node["id"], nodeType: node["type"], status: "error", error: e.message)
      NodeResult.failure(e.message)
    end

    def advance(result)
      @steps = result.fresh_steps? ? 0 : @steps + 1
      execution.merge_variables!(result.variables) if result.variables.present?

      execution.update!(
        current_node_id: result.next_node_id,
        locked_at: Time.current,
        context: execution.context.merge("steps" => execution.context["steps"].to_i + 1)
      )
      ChatData.new(execution).persist(result.variables) if result.variables.present?
    end

    # O último bloco do fluxo também guarda o que coletou.
    def apply_variables(result)
      return if result.variables.blank?

      execution.merge_variables!(result.variables)
      execution.save!
      ChatData.new(execution).persist(result.variables)
    end

    def log_node(node, result, duration_ms)
      FlowExecutionLog.create!(
        flow_execution: execution,
        node_id: node["id"],
        node_type: node["type"],
        input: Limits.clip_log(result.log_payload["input"]),
        output: Limits.clip_log(result.log_payload["output"]),
        duration_ms: duration_ms,
        status: log_status_for(result),
        error_message: result.error_message
      )
    end

    def log_failure(node, error)
      FlowExecutionLog.create!(
        flow_execution: execution,
        node_id: node["id"],
        node_type: node["type"],
        duration_ms: 0,
        status: "error",
        error_message: error.message.to_s.truncate(2_000)
      )
    end

    def log_status_for(result)
      case result.kind
      when :suspend then "suspended"
      when :failure then "error"
      else "success"
      end
    end

    def hand_over_to_scripts
      Flows::ScriptStepJob.perform_later(execution.id, execution.organization_id, execution.run_token, @last_message&.to_h)
      execution
    end

    def hand_back_from_scripts
      return finalize_complete unless execution.current_node_id

      Flows::ResumeExecutionJob.perform_later(
        execution.id, execution.organization_id, { "run_token" => execution.run_token, "message" => @last_message&.to_h }
      )
      execution
    end

    def finalize_complete
      execution.complete!
      broadcast_playground(:completed)
      after_run
      execution
    end

    def finalize_failure(message)
      execution.fail!(message)
      broadcast_playground(:failed, message: message)
      alert_failure(message)
      after_run
      execution
    end

    def finalize_suspend(node, result)
      if result.reason == :scheduled
        schedule_resume(result)
      else
        execution.update!(status: "waiting_for_message", current_node_id: node["id"], run_token: nil, locked_at: nil)
      end

      broadcast_playground(:suspended, status: execution.status, currentNodeId: execution.current_node_id)
      after_run
      execution
    end

    # A linha é gravada antes de enfileirar: o job da espera sempre encontra o estado que espera encontrar.
    def schedule_resume(result)
      token = SecureRandom.hex(8)
      execution.update!(
        status: "waiting",
        current_node_id: result.next_node_id,
        resume_token: token,
        resume_at: Time.current + result.resume_in,
        run_token: nil,
        locked_at: nil
      )

      Flows::ResumeExecutionJob.set(wait: result.resume_in).perform_later(
        execution.id, execution.organization_id, { "resume_token" => token }
      )
    end

    # Mensagem que chegou enquanto a execução rodava está guardada na conversa, e é agora que ela sai.
    def after_run
      Flows::InboundDispatcher.flush(execution) unless execution.playground?
    end

    def alert_failure(message)
      execution.alert!("flow_execution_failed", I18n.t("automation.flows.errors.execution_failed", name: execution.flow.name, reason: message.to_s.truncate(300)))
    end

    def broadcast_playground(kind, payload = {})
      return unless execution.playground?

      ActionCable.server.broadcast(MessageDispatcher.playground_stream(execution), { kind: kind.to_s, **payload, at: Time.current.iso8601 })
    rescue StandardError => e
      Rails.logger.warn("[FlowRuntime] transmissão falhou: #{e.message}")
    end
  end
end
