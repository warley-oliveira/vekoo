module FlowRuntime
  module Nodes
    # Roda uma função da organização, no processo de scripts. Saídas `success` e `error`.
    class ExecuteTool < Base
      def self.script_process?(_node, _context)
        true
      end

      def call
        return leave_by_error("no_tool_id") if data["tool_id"].blank?

        tool = ToolRegistry.for(organization: organization, tool_ids: [ data["tool_id"] ]).tools.first
        return leave_by_error("tool_not_found") unless tool

        params = deep_interpolate(data["params"].to_h)
        response = tool.invoke(params, organization: organization, chat: chat)
        saved = data["save_response_to"].present? ? { data["save_response_to"].to_s => response } : {}

        continue(next_node_id(handle: "success") || default_next_node_id,
                 variables: saved,
                 log: { input: { tool: tool.name, params: params }, output: { response: response } })
      rescue ::MiniRacer::Error, MiniRacerEngine::Error => e
        leave_by_error(e.message.truncate(500))
      end

      private

      def leave_by_error(error)
        continue(next_node_id(handle: "error") || default_next_node_id, log: { input: data, output: { error: error } })
      end
    end
  end
end
