module FlowRuntime
  module Nodes
    # Espera o contato falar. A primeira visita suspende, e a próxima segue com a mensagem, que continua nova para o
    # bloco de IA seguinte.
    class WaitForMessage < Base
      def call
        return received if context.node_state(node_id)["waiting"] && context.fresh_message?

        context.update_node_state(node_id, "waiting" => true)
        suspend(:wait_for_message, log: { input: {}, output: { waiting: true, node_id: node_id } })
      end

      private

      def received
        context.update_node_state(node_id, {})
        saved = data["save_to"].present? ? { data["save_to"].to_s => answer_text } : {}

        continue(default_next_node_id, variables: saved, log: { input: {}, output: { received: answer_text } })
      end
    end
  end
end
