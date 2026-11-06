module Chats
  # Apaga uma conversa de verdade, com tudo o que é dela.
  #
  # O `dependent: :destroy` de `Chat#chat_messages` passa pelo default_scope de ChatMessage::Base
  # (`active: true`, sem partes, sem notas): notas, partes e mensagens de antes de uma limpeza de
  # contexto ficariam órfãs, com a mídia junto. Por isso as mensagens saem aqui, sem escopo, antes
  # do destroy.
  module Remover
    BATCH_SIZE = 500

    module_function

    def call(chat)
      chat.dispatch_removal!
      destroy_messages(chat)
      CustomFieldValue.where(chat_id: chat.id).delete_all
      chat.destroy
    end

    # Um a um por causa do callback que apaga o arquivo da mensagem, mas só os que têm arquivo:
    # uma conversa longa não pode virar milhares de ida e volta na thread do Puma.
    def destroy_messages(chat)
      scope = ChatMessage::Base.unscoped.where(chat_id: chat.id)

      scope.where(:media_blob_id.ne => nil).batch_size(BATCH_SIZE).each(&:destroy)
      scope.delete_all
    end
  end
end
