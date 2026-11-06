module ChatMessage
  class Image < ChatMessage::Base
    field :image_url, type: String
    field :caption, type: String
    field :media_type, type: String, default: "image"

    def type_element
      "image"
    end

    def media_url(**_args)
      image_url
    end
  end
end
