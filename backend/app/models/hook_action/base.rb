module HookAction
  # O que um webhook faz quando chega uma requisição. `payload` é o que chegou já achatado
  # (`body.cliente.nome => "Ana"`, ver Hooks::SlimJsonPath), e `{{body.cliente.nome}}` nos textos é trocado
  # pelo valor. Tudo escopado pela organização do webhook: o id de canal, campo ou fluxo que a pessoa salvou
  # é conferido ao salvar e de novo ao executar.
  class Base < ApplicationRecord
    self.table_name = "hook_actions"

    VARIABLE_PATTERN = /\{\{([^}]+)\}\}/

    belongs_to :hook

    attr_reader :current_chat

    delegate :organization, :organization_id, to: :hook

    # Ações fixas não saem do webhook: a tela não oferece excluir.
    def static?
      false
    end

    # @param payload [Hash] achatado
    # @param chat [Chat, nil] a conversa, depois da primeira ação
    # @return [Chat, nil] a conversa, se a ação a encontrou ou criou
    def perform(payload, chat = nil)
      raise NotImplementedError
    end

    # Ação que precisa do processo de scripts: o pipeline a despacha para a fila `scripts`.
    def script?
      false
    end

    def replace_template_variables(template, data)
      template.to_s.gsub(VARIABLE_PATTERN) do |match|
        value = data[Regexp.last_match(1).strip]
        value.nil? ? match : value.to_s
      end.strip
    end
  end
end
