module Chats
  # "Digitando" do contato. A presença vale poucos segundos (`TTL`), e o provedor a repete enquanto a pessoa digita, em
  # alto volume: transmite só quando muda, e nada de tocar no banco.
  #
  # Na tela, o `contact_presence` chega por `ChatChannel`. Como o aviso de "parou" pode não chegar nunca, a tela apaga o
  # "digitando" sozinha depois de `expiresInMs` e quando a mensagem chega.
  module Presence
    TTL = 10.seconds
    TYPING = %w[composing recording].freeze

    module_function

    def key(chat_id)
      "presence.#{chat_id}"
    end

    # @return [String, nil]
    def read(chat_id)
      Rails.cache.read(key(chat_id))
    end

    def typing?(chat_id)
      TYPING.include?(read(chat_id))
    end

    def update(chat, presence)
      previous = read(chat.id)
      Rails.cache.write(key(chat.id), presence, expires_in: TTL)

      changed = presence != previous
      # `available`, `unavailable`, `paused`: só interessam a quem estava digitando.
      broadcast(chat, presence) if changed && (TYPING.include?(presence) || TYPING.include?(previous))
    end

    def payload(chat_id, presence)
      { event: "contact_presence", chatId: chat_id.to_s, presence: presence, expiresInMs: TTL.in_milliseconds.to_i }
    end

    def broadcast(chat, presence)
      ActionCable.server.broadcast(ChatMessage::Base.stream_for(chat), payload(chat.id, presence))
    end
    private_class_method :broadcast
  end
end
