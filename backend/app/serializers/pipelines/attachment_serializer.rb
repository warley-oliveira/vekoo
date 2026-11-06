module Pipelines
  # Anexo de card. `url` é caminho relativo à API, como `mediaUrl` das mensagens: a tela prefixa.
  class AttachmentSerializer < ApplicationSerializer
    def self.one(attachment)
      blob = attachment.file.attached? ? attachment.file.blob : nil

      {
        id: attachment.id,
        fileName: attachment.file_name || blob&.filename&.to_s,
        contentType: blob&.content_type,
        fileSize: blob&.byte_size,
        url: attachment.file_url,
        createdAt: epoch_ms(attachment.created_at),
        uploadedBy: PersonPayload.json(attachment.uploaded_by)
      }
    end
  end
end
