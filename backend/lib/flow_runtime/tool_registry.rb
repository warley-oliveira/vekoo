module FlowRuntime
  # As funções que um bloco escolheu, da organização dele. Id de outra organização simplesmente não aparece, e função de
  # ferramenta desligada também não: a credencial dela não pode passar.
  class ToolRegistry
    def self.for(organization:, tool_ids: nil)
      new(organization: organization, tool_ids: tool_ids)
    end

    def initialize(organization:, tool_ids: nil)
      @organization = organization
      @tool_ids = Array(tool_ids).map(&:to_s).compact_blank
    end

    # Sem nada escolhido, nada: quem escolhe é o bloco. Na origem, vazio dava todas as do workspace ao modelo.
    def tools
      @tools ||= load_tools
    end

    def find(name)
      tools.find { |tool| tool.name == name.to_s }
    end

    def any?
      tools.any?
    end

    # O formato da API de mensagens.
    def definitions
      tools.map { |tool| { name: tool.name, description: tool.description, input_schema: tool.input_schema } }
    end

    private

    attr_reader :organization, :tool_ids

    def load_tools
      return [] if tool_ids.empty?

      ToolFunction::MiniRacer.for_organization(organization.id).where(:_id.in => tool_ids)
                             .to_a.select(&:runnable?).uniq(&:name)
    end
  end
end
