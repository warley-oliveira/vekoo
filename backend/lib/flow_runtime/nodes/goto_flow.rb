module FlowRuntime
  module Nodes
    # Chama outro fluxo da organização. Como na origem, não espera: se o outro parar numa pergunta, este segue.
    class GotoFlow < Base
      def call
        return skip("no_target") if data["target_flow_id"].blank?

        target = Flow.scoped(organization.id, data["target_flow_id"])
        return skip("flow_not_found") unless target

        depth = context.execution.context["depth"].to_i + 1
        return skip("too_deep") if depth > Limits::MAX_FLOW_DEPTH

        sub = Engine.start(
          flow: target,
          chat: chat,
          last_message: context.last_message,
          variables: variables,
          playground: context.playground?,
          event: "goto_flow",
          depth: depth,
          stream_id: (context.execution.context["playground_stream_id"].presence || context.execution.id if context.playground?)
        )
        return skip("already_running") unless sub

        merged = sub.variables.except(*variables.keys) if data["merge_variables"]
        continue(default_next_node_id, variables: merged || {}, log: { input: data, output: { sub_execution_id: sub.id, status: sub.status } })
      end
    end
  end
end
