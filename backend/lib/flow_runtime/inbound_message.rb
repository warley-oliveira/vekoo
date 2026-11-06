module FlowRuntime
  # A mensagem do contato, do jeito que os blocos leem: pode ser mais de uma, juntas pelo debounce, e viaja entre jobs.
  # No teste do editor não existe mensagem de verdade, e é esta mesma classe (origem: PlaygroundMessage).
  class InboundMessage
    attr_reader :content, :role, :message_id, :media_url

    def self.from_h(hash)
      return nil if hash.blank?

      hash = hash.to_h.with_indifferent_access
      new(hash[:content], role: hash[:role].presence || "user", message_id: hash[:message_id], media_url: hash[:media_url])
    end

    def initialize(content, role: "user", message_id: nil, media_url: nil)
      @content = content.to_s
      @role = role
      @message_id = message_id
      @media_url = media_url
    end

    alias_method :text, :content
    alias_method :body, :content

    def to_h
      { "content" => content, "role" => role, "message_id" => message_id, "media_url" => media_url }.compact
    end
  end
end
