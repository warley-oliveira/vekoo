module Chats
  # Uma página do histórico, do mais novo para o mais antigo, com cursor. Serve à conversa aberta e
  # à linha do tempo mesclada dos contatos unificados.
  #
  # O cursor é a mensagem mais antiga já carregada. A ordem é (`created_at`, `_id`), e não só
  # `_id`, como na origem: mensagem do provedor chega com a data dele, então a ordem dos dois
  # campos não é a mesma, e comparar só `_id` pulava ou repetia mensagens na virada da página.
  class MessagePage
    DEFAULT_LIMIT = 50
    MAX_LIMIT = 100

    # O cursor não existe nestas conversas.
    class InvalidCursor < StandardError; end

    Page = Struct.new(:messages, :has_more, :oldest_id, keyword_init: true)

    # @param chat_ids [Array<BSON::ObjectId>] sempre com escopo: é o que protege a coleção
    def self.call(chat_ids:, before_id: nil, limit: nil)
      new(chat_ids, before_id, limit).call
    end

    def initialize(chat_ids, before_id, limit)
      @chat_ids = chat_ids
      @before_id = before_id.presence
      @limit = (limit.presence || DEFAULT_LIMIT).to_i.clamp(1, MAX_LIMIT)
    end

    # @return [Page] `messages` em ordem cronológica, como a tela desenha
    # @raise [InvalidCursor]
    def call
      fetched = scope.limit(limit + 1).to_a
      has_more = fetched.size > limit
      fetched = fetched.first(limit)

      Page.new(messages: fetched.reverse, has_more: has_more, oldest_id: fetched.last&.id&.to_s)
    end

    private

    attr_reader :chat_ids, :before_id, :limit

    def base
      ChatMessage::Base.unscoped.visible.where(:chat_id.in => chat_ids)
    end

    def scope
      ordered = base.order_by(created_at: :desc, _id: :desc)
      return ordered unless before_id

      cursor = ChatMessage::Base.unscoped.where(:chat_id.in => chat_ids, id: before_id).only(:_id, :created_at).take
      raise InvalidCursor if cursor.nil?

      ordered.where(
        "$or" => [
          { created_at: { "$lt" => cursor.created_at } },
          { created_at: cursor.created_at, _id: { "$lt" => cursor.id } }
        ]
      )
    end
  end
end
