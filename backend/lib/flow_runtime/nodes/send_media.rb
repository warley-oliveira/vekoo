module FlowRuntime
  module Nodes
    # Envia um anexo da organização (`attachment_id`) ou o que estiver numa URL (`media_url`, `media_type`). Bom para a
    # imagem que `catalog_search` achou: `{{vars.produtos.0.image}}`.
    class SendMedia < Base
      TYPES = %w[image audio video document].freeze

      def call
        media = attachment_media || url_media
        return skip("no_attachment") unless media

        message = dispatcher.send_media(media, sender_name: data["sender_name"].presence)
        failed = message.respond_to?(:status) && message.status == "failed"
        continue(default_next_node_id, log: {
                   input: { attachment_id: data["attachment_id"], media_url: media.media_url, caption: media.caption },
                   output: { status: failed ? "failed" : "sent", error: failed ? message.status_message : nil }.compact
                 })
      end

      private

      def caption
        interpolate(data["caption"].to_s).presence
      end

      # O anexo é buscado dentro da organização do fluxo: id de outra simplesmente não existe.
      def attachment_media
        attachment = Media::AttachmentLookup.find(data["attachment_id"], organization_id: organization.id)
        return nil unless attachment

        MediaMessageDto.new(attachment.media_type, attachment.file_name || attachment.name, nil, attachment.id, caption, media_url: attachment.file_url)
      end

      def url_media
        url = interpolate(data["media_url"].to_s).presence
        return nil unless url

        type = TYPES.include?(data["media_type"].to_s) ? data["media_type"].to_s : "image"
        MediaMessageDto.new(type, interpolate(data["file_name"].to_s).presence || file_name_of(url), nil, nil, caption, media_url: url)
      end

      def file_name_of(url)
        File.basename(URI.parse(url).path.to_s).presence || "arquivo"
      rescue URI::InvalidURIError
        "arquivo"
      end
    end
  end
end
