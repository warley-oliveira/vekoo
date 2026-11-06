module FlowRuntime
  module Nodes
    class SendText < Base
      def call
        text = interpolate(data["text"].to_s)
        return continue(default_next_node_id, log: { input: { text: data["text"] }, output: { skipped: "empty" } }) if text.blank?

        delivery = dispatcher.send_text(text, sender_name: data["sender_name"].presence)
        continue(default_next_node_id, log: { input: { text: data["text"] }, output: { sent: text, **delivery.to_log } })
      end
    end
  end
end
