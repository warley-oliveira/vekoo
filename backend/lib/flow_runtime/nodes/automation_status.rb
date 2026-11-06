module FlowRuntime
  module Nodes
    # `pause_automation`, opcionalmente por um período (`period`: minutes, hours ou days, e `amount`), e
    # `resume_automation`. Sem período, pausa até alguém religar.
    class AutomationStatus < Base
      def call
        return skip("no_chat") unless chat

        case action
        when "pause"
          chat.disable_automation_to(data["period"], data["amount"])
          done(automation_enabled: false)
        when "resume"
          chat.update(automation_enabled: true, active_job_id: nil, automation_resume_at: nil)
          done(automation_enabled: true)
        else
          skip("invalid_action")
        end
      end

      private

      def action
        return data["action"].to_s if data["action"].present?

        { "pause_automation" => "pause", "resume_automation" => "resume" }[node["type"]]
      end

      def done(output)
        continue(default_next_node_id, log: { input: data, output: output })
      end
    end
  end
end
