module Tools
  # "Testar função": roda o script na fila `scripts` e guarda o resultado para a tela consultar.
  class TestRunJob < ApplicationJob
    queue_as :scripts

    # Script não é idempotente, e aqui o erro já é a resposta que a tela espera.
    discard_on StandardError do |job, error|
      Rails.logger.error("[Tools::TestRunJob] #{job.arguments.second} #{error.class}: #{error.message}")
      TestRuns.finish(job.arguments.first, job.arguments.second, job.arguments.third, { "status" => "failed", "error" => I18n.t("automation.tools.errors.test_failed") })
    end

    def perform(organization_id, tool_id, run_id, args = {}, chat_id = nil)
      organization = Organization.find_by(id: organization_id)
      tool = ToolFunction::MiniRacer.scoped(organization_id, tool_id)
      return unless organization && tool

      chat = chat_id.present? ? Chat.scoped(organization_id, chat_id) : nil
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      events = []

      response = tool.invoke(args, organization: organization, chat: chat) do |name, payload|
        events << { "name" => name.to_s, "output" => FlowRuntime::Limits.clip(payload[:output], 4.kilobytes) } if events.length < 100
      end

      TestRuns.finish(organization_id, tool_id, run_id, {
        "status" => "done", "response" => response, "events" => events, "durationMs" => elapsed_ms(started)
      })
    rescue ::MiniRacer::Error, MiniRacerEngine::Error => e
      TestRuns.finish(organization_id, tool_id, run_id, {
        "status" => "failed", "error" => e.message.truncate(2_000), "durationMs" => elapsed_ms(started)
      })
    end

    private

    def elapsed_ms(started)
      started ? ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round : nil
    end
  end
end
