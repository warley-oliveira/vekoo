module FlowRuntime
  # As funções que um bloco escolheu, da organização dele: as nativas do Vekoo (`native`, por grupo, em Ruby) e as
  # personalizadas (`tool_ids`, em JavaScript). Id de outra organização simplesmente não aparece, e função de ferramenta
  # desligada também não: a credencial dela não pode passar.
  class ToolRegistry
    def self.for(organization:, tool_ids: nil, native: nil, chat: nil, playground: false)
      new(organization: organization, tool_ids: tool_ids, native: native, chat: chat, playground: playground)
    end

    def initialize(organization:, tool_ids: nil, native: nil, chat: nil, playground: false)
      @organization = organization
      @tool_ids = Array(tool_ids).map(&:to_s).compact_blank
      @native = NativeTools.new(organization: organization, chat: chat, groups: native, playground: playground)
    end

    attr_reader :native

    # Nativas primeiro. Personalizada com o mesmo nome de uma nativa fica de fora: a API recusa nome repetido.
    def tools
      @tools ||= begin
        natives = native.tools
        taken = natives.map(&:name)
        natives + custom.reject { |tool| taken.include?(tool.name) }
      end
    end

    # Sem nada escolhido, nada: quem escolhe é o bloco. Na origem, vazio dava todas as do workspace ao modelo.
    def custom
      @custom ||= load_custom
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

    def load_custom
      return [] if tool_ids.empty?

      ToolFunction::MiniRacer.for_organization(organization.id).where(:_id.in => tool_ids)
                             .to_a.select(&:runnable?).uniq(&:name)
    end
  end
end
