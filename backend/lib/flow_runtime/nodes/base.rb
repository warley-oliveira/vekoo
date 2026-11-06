module FlowRuntime
  module Nodes
    # Um bloco. Recebe o bloco da definição (`node`) e o contexto, e devolve um `NodeResult`.
    class Base
      attr_reader :node, :context

      # Este bloco roda JavaScript de cliente? Então precisa do processo da fila `scripts`.
      def self.script_process?(_node, _context)
        false
      end

      def initialize(node, context)
        @node = node
        @context = context
      end

      def call
        raise NotImplementedError, "#{self.class.name} must implement #call"
      end

      protected

      def data
        node["data"] || {}
      end

      def node_id
        node["id"]
      end

      def chat
        context.chat
      end

      def organization
        context.organization
      end

      def next_node_id(handle: "next")
        context.edge_target(node_id, source_handle: handle)
      end

      def default_next_node_id
        next_node_id(handle: nil) || next_node_id(handle: "next")
      end

      def continue(next_id, **opts)
        next_id ||= default_next_node_id
        return NodeResult.complete(log: opts[:log] || {}, variables: opts[:variables] || {}) if next_id.nil?

        NodeResult.continue(next_id, variables: opts[:variables] || {}, log: opts[:log] || {}, fresh_steps: opts[:fresh_steps] || false)
      end

      def suspend(reason, log: {})
        NodeResult.suspend(reason, log: log)
      end

      def fail_with(message, log: {})
        NodeResult.failure(message, log: log)
      end

      def skip(reason)
        continue(default_next_node_id, log: { input: data, output: { skipped: reason } })
      end

      def interpolate(value)
        context.interpolate(value)
      end

      def deep_interpolate(value)
        case value
        when String then interpolate(value)
        when Hash then value.transform_values { |inner| deep_interpolate(inner) }
        when Array then value.map { |inner| deep_interpolate(inner) }
        else value
        end
      end

      def variables
        context.variables
      end

      def dispatcher
        @dispatcher ||= MessageDispatcher.new(context.execution)
      end

      # Parâmetros de bloco: conta de pessoa ou departamento precisa ser da organização do fluxo.
      def own_account(id)
        return nil if id.blank?

        organization.accounts.active.find_by(id: id)
      end

      def own_team(id)
        return nil if id.blank?

        organization.teams.find_by(id: id)
      end

      # O que a pessoa respondeu no bloco anterior a esta espera.
      def answer_text
        context.last_message&.content.to_s
      end
    end
  end
end
