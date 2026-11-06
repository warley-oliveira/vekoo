# `file.url` é um caminho relativo à API, como `mediaUrl` das mensagens: a tela prefixa.
class AttachmentSerializer < ApplicationSerializer
  def self.one(attachment)
    {
      id: attachment.id,
      name: attachment.name,
      description: attachment.description,
      private: attachment.private,
      createdAt: epoch_ms(attachment.created_at),
      updatedAt: epoch_ms(attachment.updated_at),
      file: file(attachment)
    }
  end

  def self.file(attachment)
    return nil unless attachment.file.attached?

    blob = attachment.file.blob
    {
      id: blob.id,
      filename: blob.filename.to_s,
      contentType: blob.content_type,
      byteSize: blob.byte_size,
      url: attachment.file_url
    }
  end
end
