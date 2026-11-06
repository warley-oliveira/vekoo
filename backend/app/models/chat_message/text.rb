module ChatMessage
  class Text < ChatMessage::Base
    def type_element
      "text"
    end
  end
end
