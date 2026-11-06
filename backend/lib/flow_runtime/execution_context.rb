module FlowRuntime
  # O que um bloco enxerga: a execução, a conversa e a mensagem atual.
  class ExecutionContext
    attr_reader :execution, :flow, :flow_version, :organization, :chat, :contact, :last_message

    def initialize(execution:, last_message: nil)
      @execution = execution
      @flow = execution.flow
      @flow_version = execution.flow_version
      @organization = execution.organization
      @chat = execution.chat
      @contact = @chat&.contact
      @last_message = last_message
    end

    def variables
      execution.variables.dup
    end

    def playground?
      execution.playground?
    end

    # A mensagem atual do contato é "nova" até ser avaliada por uma conversa de IA. Um bloco interativo alcançado depois
    # (a mesma mensagem já foi usada por outro bloco) não a reprocessa: faz o turno de entrada e espera a próxima.
    def fresh_message?
      last_message.present? && message_seq > execution.context["consumed_seq"].to_i
    end

    def consume_message!
      update_execution_context("consumed_seq" => message_seq)
    end

    # Registra a mensagem do contato no histórico do teste uma única vez, mesmo que vários blocos a avaliem.
    def record_user_message!
      return unless playground? && last_message.present?
      return if execution.context["recorded_seq"].to_i >= message_seq

      append_playground_message("user", last_message.content)
      update_execution_context("recorded_seq" => message_seq)
    end

    def message_seq
      execution.context["message_seq"].to_i
    end

    # Estado por bloco na visita atual (ex.: trocas feitas no bloco de IA).
    def node_state(node_id)
      execution.context.dig("node_state", node_id.to_s) || {}
    end

    def update_node_state(node_id, state)
      all = execution.context["node_state"] || {}
      update_execution_context("node_state" => all.merge(node_id.to_s => state))
    end

    def update_execution_context(values)
      execution.update!(context: execution.context.merge(values))
    end

    def playground_messages
      execution.context["playground_messages"] || []
    end

    def append_playground_message(role, content)
      return unless playground?

      history = playground_messages.last(Limits::MAX_PLAYGROUND_MESSAGES - 1) + [ { "role" => role.to_s, "content" => content.to_s } ]
      update_execution_context("playground_messages" => history)
    end

    def find_node(id)
      flow_version.find_node(id)
    end

    def outgoing_edges(node_id)
      flow_version.outgoing_edges(node_id)
    end

    def edge_target(node_id, source_handle: nil)
      edges = outgoing_edges(node_id)
      # Sem handle = saída padrão ("próximo"). Não pode cair numa aresta nomeada (ex.: `onError`) só por ela vir primeiro.
      match = if source_handle
        edges.find { |edge| edge["sourceHandle"].to_s == source_handle.to_s }
      else
        edges.find { |edge| edge["sourceHandle"].blank? || edge["sourceHandle"] == "next" }
      end
      match && match["target"]
    end

    def interpolate(template)
      return template unless template.is_a?(String)

      Templating.render(template, scope_for_template)
    end

    def scope_for_template
      {
        "contact" => contact_attrs,
        "chat" => chat_attrs,
        "vars" => variables,
        "message" => last_message_attrs
      }
    end

    private

    def contact_attrs
      return {} unless chat

      {
        "id" => contact.id.to_s,
        "name" => contact.name,
        "phone" => contact.phone,
        "custom_attributes" => chat.custom_attributes || {}
      }
    end

    def chat_attrs
      return {} unless chat

      {
        "id" => chat.id.to_s,
        "status" => chat.status,
        "custom_attributes" => chat.custom_attributes || {}
      }
    end

    def last_message_attrs
      return {} unless last_message

      { "text" => last_message.content, "role" => last_message.role }
    end

    module Templating
      INTERPOLATION = /\{\{\s*([\w.-]+)\s*\}\}/

      def self.render(template, scope)
        template.gsub(INTERPOLATION) { to_text(dig_value(scope, Regexp.last_match(1).split("."))) }
      end

      # `vars.itens.0.titulo`: número atravessa lista. Caminho que não existe vira vazio.
      def self.dig_value(scope, keys)
        keys.reduce(scope) do |current, key|
          case current
          when Hash then current[key].nil? ? current[key.to_sym] : current[key]
          when Array then key.match?(/\A\d+\z/) ? current[key.to_i] : nil
          end
        end
      end

      def self.to_text(value)
        value.is_a?(Hash) || value.is_a?(Array) ? value.to_json : value.to_s
      end
    end
  end
end
