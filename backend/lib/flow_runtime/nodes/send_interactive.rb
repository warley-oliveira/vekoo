module FlowRuntime
  module Nodes
    # Botões ou lista. Nenhum canal daqui tem mensagem interativa nativa, então as opções vão numeradas no texto, e a
    # resposta vale pelo número ou pelo título. A saída é o `id` do botão, e sem conexão segue a padrão.
    class SendInteractive < Base
      def call
        return replied if context.node_state(node_id)["sent"] && context.fresh_message?

        text = interpolate(data["text"].to_s)
        list = buttons

        if context.playground?
          dispatcher.emit_event("interactive_sent", text: text, buttons: list)
        else
          delivery = dispatcher.send_text(with_options(text, list), sender_name: data["sender_name"].presence)
        end

        context.update_node_state(node_id, "sent" => true)
        suspend(:wait_for_message, log: { input: data, output: { sent: text, buttons: list.length, **(delivery ? delivery.to_log : {}) } })
      end

      private

      def buttons
        Array(data["buttons"]).map { |button| { "id" => button["id"].to_s, "title" => interpolate(button["title"].to_s) } }
      end

      def with_options(text, list)
        return text if list.empty?

        [ text, *list.each_with_index.map { |button, index| "#{index + 1}. #{button['title']}" } ].compact_blank.join("\n")
      end

      def replied
        choice = match_choice(buttons)
        return ask_again if choice.nil? && data["invalid_text"].present?

        context.update_node_state(node_id, {})
        saved = { "last_choice" => choice ? choice["id"] : answer_text }
        saved[data["save_to"].to_s] = saved["last_choice"] if data["save_to"].present?
        target = (choice && next_node_id(handle: choice["id"])) || default_next_node_id

        continue(target, variables: saved, log: { input: { reply: answer_text }, output: { choice: choice&.dig("id") } })
      end

      def match_choice(list)
        reply = normalized(answer_text)
        number = reply.to_i if reply.match?(/\A\d+\z/)
        return list[number - 1] if number&.between?(1, list.length)

        list.find { |button| normalized(button["title"]) == reply }
      end

      def normalized(text)
        ActiveSupport::Inflector.transliterate(text.to_s).downcase.strip
      end

      def ask_again
        delivery = dispatcher.send_text(interpolate(data["invalid_text"].to_s), sender_name: data["sender_name"].presence)
        suspend(:wait_for_message, log: { input: { reply: answer_text }, output: { invalid: true, **delivery.to_log } })
      end
    end
  end
end
