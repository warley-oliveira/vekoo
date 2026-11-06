module Tools
  # A lista curta de funções, para os seletores de `ai_assistant.tool_ids` e `execute_tool.tool_id`, com a ferramenta de
  # origem de cada uma. Sem N+1: duas consultas, por mais que a lista seja longa.
  class FunctionListSerializer
    def self.call(functions)
      list = functions.to_a
      return [] if list.empty?

      tools = preload_tools(list)

      list.map do |function|
        {
          id: function.id.to_s,
          name: function.name,
          description: function.description,
          toolInstallationId: function.tool_installation_id,
          tool: tools[function.tool_installation_id.to_s]
        }
      end
    end

    def self.preload_tools(functions)
      installation_ids = functions.filter_map(&:tool_installation_id).uniq
      return {} if installation_ids.empty?

      installations = ToolInstallation.where(:_id.in => installation_ids).to_a
      tools_by_id = Tool.where(:_id.in => installations.map(&:tool_id).uniq).index_by { |tool| tool.id.to_s }

      installations.each_with_object({}) do |installation, result|
        tool = tools_by_id[installation.tool_id]
        next unless tool

        result[installation.id.to_s] = { id: tool.id.to_s, name: tool.name, slug: tool.slug, icon: tool.icon, color: tool.color, imageUrl: tool.image_url }
      end
    end
  end
end
