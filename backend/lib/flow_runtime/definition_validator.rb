module FlowRuntime
  # O que impede de publicar: bloco que o motor não conhece, gatilho faltando ou repetido, conexão para bloco que não
  # existe. Rascunho aceita tudo, porque a pessoa está no meio do desenho.
  class DefinitionValidator
    Issue = Struct.new(:code, :node_id, :edge_id, :type, keyword_init: true) do
      def to_h
        { code: code, nodeId: node_id, edgeId: edge_id, type: type }.compact
      end
    end

    def initialize(version)
      @version = version
    end

    # @return [Array<Issue>]
    def issues
      [ *trigger_issues, *node_issues, *edge_issues ]
    end

    def valid?
      issues.empty?
    end

    private

    attr_reader :version

    def trigger_issues
      triggers = version.nodes.select { |node| node["type"].to_s.start_with?("trigger_") }
      return [ Issue.new(code: "noTrigger") ] if triggers.empty?
      return [] if triggers.one?

      triggers.drop(1).map { |node| Issue.new(code: "multipleTriggers", node_id: node["id"], type: node["type"]) }
    end

    def node_issues
      ids = version.nodes.map { |node| node["id"] }
      duplicated = ids.tally.select { |_, count| count > 1 }.keys

      version.nodes.filter_map do |node|
        if node["id"].blank?
          Issue.new(code: "missingNodeId", type: node["type"])
        elsif !NodeRegistry.known?(node["type"])
          Issue.new(code: "unknownBlock", node_id: node["id"], type: node["type"])
        elsif duplicated.include?(node["id"])
          Issue.new(code: "duplicatedNodeId", node_id: node["id"], type: node["type"])
        end
      end
    end

    def edge_issues
      ids = version.nodes.map { |node| node["id"] }

      version.edges.filter_map do |edge|
        next if ids.include?(edge["source"]) && ids.include?(edge["target"])

        Issue.new(code: "brokenEdge", edge_id: edge["id"])
      end
    end
  end
end
