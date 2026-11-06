module MiniRacerEngine
  # O que o script pode alcançar. Duas chaves têm significado para o núcleo:
  #
  #   :organization  a `Organization` dona da execução. Sem ela, tudo que é da organização
  #                  falha fechado: nada de "todas as organizações".
  #   :chat          a conversa, quando houver.
  #
  # Mais `:tool_credentials`, que vira `credentials` no JS, e o que as extensões quiserem
  # guardar durante a execução.
  class SessionContext
    attr_accessor :data

    def initialize
      @data = {}.with_indifferent_access
    end

    def set(key, value)
      data[key] = value
    end

    def get(key)
      data[key]
    end

    def organization
      get(:organization)
    end

    def organization_id
      organization&.id&.to_s
    end

    def chat
      get(:chat)
    end

    # Uma conversa de outra organização no contexto daria ao script dados que não são
    # dele, seja qual for a extensão que os leia. Conferido uma vez, antes de rodar.
    def validate!
      return if chat.nil? || chat.organization_id.to_s == organization_id

      raise Error, "Chat does not belong to the organization in context"
    end
  end
end
