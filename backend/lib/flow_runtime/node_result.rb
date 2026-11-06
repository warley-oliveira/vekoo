module FlowRuntime
  # O que um bloco devolve ao motor.
  class NodeResult
    KINDS = %i[continue suspend complete failure].freeze

    attr_reader :kind, :next_node_id, :variables, :log_payload, :reason, :error_message, :resume_in

    def self.continue(next_node_id, variables: {}, log: {}, fresh_steps: false)
      new(:continue, next_node_id: next_node_id, variables: variables, log: log, fresh_steps: fresh_steps)
    end

    # @param reason [Symbol] :wait_for_message, ou :scheduled com `resume_in` e `next_node_id`
    def self.suspend(reason, log: {}, resume_in: nil, next_node_id: nil)
      new(:suspend, reason: reason, log: log, resume_in: resume_in, next_node_id: next_node_id)
    end

    def self.complete(log: {}, variables: {})
      new(:complete, log: log, variables: variables)
    end

    def self.failure(message, log: {})
      new(:failure, error_message: message, log: log)
    end

    def initialize(kind, next_node_id: nil, variables: {}, log: {}, reason: nil, error_message: nil, resume_in: nil, fresh_steps: false)
      raise ArgumentError, "invalid kind #{kind}" unless KINDS.include?(kind)

      @kind = kind
      @next_node_id = next_node_id
      @variables = variables || {}
      @log_payload = (log || {}).to_h.deep_stringify_keys
      @reason = reason
      @error_message = error_message
      @resume_in = resume_in
      @fresh_steps = fresh_steps
    end

    def continue? = kind == :continue
    def suspend? = kind == :suspend
    def complete? = kind == :complete
    def failure? = kind == :failure
    def fresh_steps? = @fresh_steps
  end
end
