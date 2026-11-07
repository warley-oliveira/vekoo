module Flows
  # O que parou de andar sem ninguém ver.
  #
  #   - `running` há muito tempo: o processo caiu no meio de um bloco, e não dá para saber se a mensagem saiu. Repetir poderia
  #     enviar duas vezes, então a execução vira `failed`, com alerta, e o que estava na caixa da conversa segue.
  #   - `waiting` com o prazo vencido: o job agendado sumiu (o Redis caiu). Agenda de novo, com o mesmo token.
  #   - caixa da conversa com o prazo vencido: o job do debounce sumiu (o Redis caiu). Sem isto, o contato ficava sem resposta até
  #     escrever de novo. O job confere o prazo e a caixa, então chegar com ele ainda na fila não entrega duas vezes.
  class SweepStaleExecutionsJob < ApplicationJob
    queue_as :low

    # Uma rodada dura segundos, e a fila de scripts pode atrasar. `locked_at` anda a cada bloco.
    RUNNING_LIMIT = 15.minutes
    LATE_WAIT_LIMIT = 10.minutes
    BATCH = 500

    def perform
      flushed = fail_interrupted
      reschedule_late_waits
      redeliver_forgotten_inboxes(except: flushed)
    end

    private

    # @return [Array<String>] as conversas cuja caixa já foi entregue aqui
    def fail_interrupted
      flushed = []

      FlowExecution.running.where(locked_at: ...RUNNING_LIMIT.ago).limit(BATCH).find_each do |execution|
        next unless FlowExecution.where(id: execution.id, status: "running", run_token: execution.run_token).update_all(
          status: "failed",
          error_message: I18n.t("automation.flows.errors.interrupted"),
          completed_at: Time.current,
          updated_at: Time.current,
          run_token: nil,
          locked_at: nil
        ) == 1

        alert(execution)
        next if execution.playground?

        Flows::InboundDispatcher.flush(execution)
        flushed << execution.chat_id
      end

      flushed
    end

    def reschedule_late_waits
      FlowExecution.where(status: "waiting").where(resume_at: ...LATE_WAIT_LIMIT.ago).limit(BATCH).find_each do |execution|
        ResumeExecutionJob.perform_later(execution.id, execution.organization_id, { "resume_token" => execution.resume_token })
      end
    end

    def redeliver_forgotten_inboxes(except:)
      forgotten = Chat.where(:flow_inbox_deadline.lt => InboundDispatcher::STALE_DEADLINE.ago).limit(BATCH).pluck(:_id, :organization_id)

      forgotten.each do |chat_id, organization_id|
        DebouncedDispatchJob.perform_later(chat_id.to_s, organization_id) unless except.include?(chat_id.to_s)
      end
    end

    def alert(execution)
      execution.alert!("flow_execution_failed", I18n.t("automation.flows.errors.execution_failed", name: execution.flow.name, reason: I18n.t("automation.flows.errors.interrupted")))
    end
  end
end
