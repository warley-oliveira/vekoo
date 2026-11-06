module FlowRuntime
  module Nodes
    # Espera um tempo, por `set(wait:)`. Quem retoma traz um token: cancelar é só trocar o estado da linha.
    class Wait < Base
      UNITS = { "seconds" => 1, "minutes" => 60, "hours" => 3600, "days" => 86_400 }.freeze
      MAX_SECONDS = 30.days.to_i

      def call
        amount = data["amount"].to_i
        unit = data["unit"].to_s
        seconds = [ amount * (UNITS[unit] || 60), MAX_SECONDS ].min
        next_id = default_next_node_id

        return continue(next_id) if seconds <= 0
        # Sem bloco depois, não há o que retomar. Na origem a espera se repetia para sempre.
        return NodeResult.complete(log: { input: { amount: amount, unit: unit }, output: { skipped: "nothing_after" } }) if next_id.nil?

        NodeResult.suspend(
          :scheduled,
          resume_in: seconds,
          next_node_id: next_id,
          log: { input: { amount: amount, unit: unit }, output: { resume_in_seconds: seconds, resume_at: Time.current + seconds } }
        )
      end
    end
  end
end
