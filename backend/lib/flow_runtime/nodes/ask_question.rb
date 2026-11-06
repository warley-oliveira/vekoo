module FlowRuntime
  module Nodes
    # Pergunta e espera. A primeira visita envia; a próxima, com a resposta na mão, segue adiante. Na origem o bloco
    # enviava a pergunta de novo a cada resposta, e o fluxo nunca saía dele.
    class AskQuestion < Base
      def call
        return answered if context.node_state(node_id)["asked"] && context.fresh_message?

        text = interpolate(data["text"].to_s)
        dispatcher.ask_question(text, sender_name: data["sender_name"].presence) if text.present?
        context.update_node_state(node_id, "asked" => true)

        suspend(:wait_for_message, log: { input: { text: data["text"] }, output: { asked: text, awaiting_reply: true } })
      end

      private

      def answered
        context.update_node_state(node_id, {})
        saved = data["save_to"].present? ? { data["save_to"].to_s => answer_text } : {}

        continue(default_next_node_id, variables: saved, log: { input: { text: data["text"] }, output: { answer: answer_text } })
      end
    end
  end
end
