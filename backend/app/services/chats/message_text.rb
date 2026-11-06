module Chats
  # O texto que um modelo de linguagem lê no lugar de uma mensagem.
  #
  # Áudio sem transcrição guarda "-" em `content`, e imagem sem legenda guarda vazio. Entregue assim, o
  # modelo entende que a pessoa respondeu "-": foi o que o copiloto disse da Fernanda ao rodar de verdade.
  # A mídia vira um rótulo, para ele saber que há algo ali que não consegue ler.
  module MessageText
    NOTHING = [ "", "-" ].freeze
    KINDS = %w[audio image media].freeze

    module_function

    def for(message, limit: 400)
      labeled(message.content, message.type_element)[0, limit]
    end

    # Para a prévia que fica na conversa (`last_message_content`, `last_message_type`).
    def preview(content, type, limit: 200)
      labeled(content, type)[0, limit]
    end

    def labeled(content, type)
      text = content.to_s.strip
      kind = KINDS.include?(type.to_s) ? type.to_s : nil
      return I18n.t("inbox.copilot.message_kinds.#{kind || 'unknown'}_empty") if NOTHING.include?(text)
      return text unless kind

      "#{I18n.t("inbox.copilot.message_kinds.#{kind}")} #{text}"
    end
    private_class_method :labeled
  end
end
