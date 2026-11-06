module FlowRuntime
  module Nodes
    class Condition < Base
      OPERATORS = %w[equals not_equals contains not_contains starts_with ends_with greater_than less_than is_empty is_not_empty exists not_exists in not_in].freeze

      def call
        rules = Array(data["rules"])
        match_mode = (data["match"] || "all").to_s
        evaluations = rules.map { |rule| [ rule, evaluate(rule) ] }
        passed = match_mode == "any" ? evaluations.any? { |_, value| value } : evaluations.all? { |_, value| value }

        handle = passed ? "true" : "false"
        next_id = next_node_id(handle: handle) || default_next_node_id

        continue(next_id, log: {
                   input: { rules: rules, match: match_mode },
                   output: { passed: passed, evaluations: evaluations.map { |rule, value| { rule: rule, value: value } } }
                 })
      end

      private

      def evaluate(rule)
        operator = rule["operator"].to_s
        left = resolve_field(rule["field"])
        right = interpolate(rule["value"].to_s)

        case operator
        when "equals" then left.to_s == right
        when "not_equals" then left.to_s != right
        when "contains" then left.to_s.include?(right)
        when "not_contains" then !left.to_s.include?(right)
        when "starts_with" then left.to_s.start_with?(right)
        when "ends_with" then left.to_s.end_with?(right)
        when "greater_than" then left.to_f > right.to_f
        when "less_than" then left.to_f < right.to_f
        when "is_empty" then left.to_s.strip.empty?
        when "is_not_empty" then !left.to_s.strip.empty?
        when "exists" then !left.nil?
        when "not_exists" then left.nil?
        when "in" then Array(rule["values"]).map(&:to_s).include?(left.to_s)
        when "not_in" then !Array(rule["values"]).map(&:to_s).include?(left.to_s)
        else false
        end
      end

      def resolve_field(field)
        return nil if field.blank?

        ExecutionContext::Templating.dig_value(context.scope_for_template, field.to_s.split("."))
      end
    end
  end
end
