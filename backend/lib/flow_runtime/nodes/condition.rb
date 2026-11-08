module FlowRuntime
  module Nodes
    # Compara um valor da conversa e segue por `true` ou `false`.
    #
    # Texto é comparado como a pessoa lê: sem diferença de maiúscula, de acento e de espaço nas pontas. Quem escreve
    # "sim" na regra espera que "Sim " do contato case, e na origem não casava. Número aceita vírgula decimal ("14,90").
    class Condition < Base
      OPERATORS = %w[equals not_equals contains not_contains starts_with ends_with greater_than less_than is_empty is_not_empty exists not_exists in not_in].freeze

      def self.normalize(value)
        ActiveSupport::Inflector.transliterate(value.to_s).downcase.squish
      end

      # "14,90", "1.234,56" e "1234.56" viram número; o que não é número vira nil.
      def self.number(value)
        text = value.to_s.strip
        text = text.delete(".").tr(",", ".") if text.match?(/\A-?\d{1,3}(\.\d{3})*(,\d+)?\z/) || text.match?(/\A-?\d+,\d+\z/)
        Float(text)
      rescue ArgumentError, TypeError
        nil
      end

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
        raw_left = resolve_field(rule["field"])
        left = self.class.normalize(raw_left)
        right = self.class.normalize(interpolate(rule["value"].to_s))

        case operator
        when "equals" then left == right
        when "not_equals" then left != right
        when "contains" then left.include?(right)
        when "not_contains" then !left.include?(right)
        when "starts_with" then left.start_with?(right)
        when "ends_with" then left.end_with?(right)
        when "greater_than" then compare(raw_left, rule["value"]) { |a, b| a > b }
        when "less_than" then compare(raw_left, rule["value"]) { |a, b| a < b }
        when "is_empty" then left.empty?
        when "is_not_empty" then !left.empty?
        when "exists" then !raw_left.nil?
        when "not_exists" then raw_left.nil?
        when "in" then options(rule).include?(left)
        when "not_in" then !options(rule).include?(left)
        else false
        end
      end

      # Sem número de um dos lados, a regra não vale: "abc" não é maior que 3.
      def compare(raw_left, raw_right)
        a = self.class.number(raw_left)
        b = self.class.number(interpolate(raw_right.to_s))
        return false if a.nil? || b.nil?

        yield(a, b)
      end

      def options(rule)
        Array(rule["values"]).map { |value| self.class.normalize(interpolate(value.to_s)) }
      end

      def resolve_field(field)
        return nil if field.blank?

        path = field.to_s.gsub(/[{}\s]/, "")
        ExecutionContext::Templating.dig_value(context.scope_for_template, path.split("."))
      end
    end
  end
end
