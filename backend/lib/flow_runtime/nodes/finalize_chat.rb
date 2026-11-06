module FlowRuntime
  module Nodes
    class FinalizeChat < Base
      def call
        return NodeResult.complete(log: { input: data, output: { skipped: "no_chat" } }) unless chat

        chat.update(status: "closed")
        NodeResult.complete(log: { input: data, output: { closed: true, chat_id: chat.id.to_s } })
      end
    end
  end
end
