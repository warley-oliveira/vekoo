module Hooks
  # O que veio pelo webhook. A entrada já respondeu: quem chamou não espera nada disto.
  #
  # Sem nova tentativa: as ações não são idempotentes (enviam mensagem, chamam outra API). Falha vai para o log e para o alerta.
  class ProcessRequestJob < ApplicationJob
    queue_as :default

    # @param capture_json [String] o que veio de Hooks::Capture
    def perform(hook_id, organization_id, capture_json)
      hook = Hook.scoped(organization_id, hook_id)
      return unless hook

      capture = JSON.parse(capture_json)

      hook.count_request!
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      elapsed = -> { ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round(2) }

      return record(hook, capture, "skipped", elapsed.call) if hook.inactive?

      if hook.test?
        hook.store_capture!(Capture.for_log(capture))
        return record(hook, capture, "success", elapsed.call)
      end

      run_actions(hook, capture, elapsed)
    end

    private

    def record(hook, capture, status, elapsed_ms, error_message: nil)
      HookLog.record(
        hook: hook,
        capture: Capture.for_log(capture),
        status: status,
        error_message: error_message,
        processing_time_ms: elapsed_ms
      )
    end

    def run_actions(hook, capture, elapsed)
      log = record(hook, capture, "success", nil)

      ActionPipeline.new(hook, capture, log_id: log&.id&.to_s).run
      log&.set(processing_time_ms: elapsed.call)
    rescue StandardError => e
      Rails.logger.error("[Hooks::ProcessRequestJob] #{hook.id} #{e.class}: #{e.message}")
      log&.set(status: "error", status_code: 500, error_message: e.message.truncate(2_000), processing_time_ms: elapsed.call)
      hook.alert_failure!(e.message)
    end
  end
end
