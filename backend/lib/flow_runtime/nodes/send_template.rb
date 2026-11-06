module FlowRuntime
  module Nodes
    # Modelo da WABA. A recusa da Meta não levanta: fica no status da mensagem e no log do bloco.
    class SendTemplate < Base
      def call
        name = data["template_name"].to_s
        params = Array(data["parameters"]).map { |param| interpolate(param.to_s) }

        if context.playground?
          dispatcher.emit_event("template_sent", name: name, parameters: params)
          return continue(default_next_node_id, log: { input: data, output: { sent: name, params: params } })
        end

        templates = chat&.connector.respond_to?(:whatsapp_templates) ? chat.connector.whatsapp_templates : nil
        return skip("no_connector_support") unless templates

        template = templates.available.where(name: name).take
        return skip("template_not_found") unless template

        message = Chats::SendTemplate.call(chat: chat, template: template, components: components(params), sender_name: data["sender_name"].presence)
        continue(default_next_node_id, log: { input: data, output: { sent: name, status: message.status, error: message.status_message }.compact })
      end

      private

      def components(params)
        return [] if params.empty?

        [ { "type" => "body", "parameters" => params.map { |text| { "type" => "text", "text" => text } } } ]
      end
    end
  end
end
