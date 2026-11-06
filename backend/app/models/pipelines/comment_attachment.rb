module Pipelines
  class CommentAttachment < ApplicationRecord
    belongs_to :comment, class_name: "Pipelines::Comment", foreign_key: :pipeline_comment_id, inverse_of: :attachments

    has_one_attached :file

    validates :file, presence: true
    validate :file_within_limit

    before_save :set_file_metadata

    # Caminho sem host, como nas mensagens: a tela prefixa com a URL da API.
    def file_url
      Media::Storage.path_for(file.blob) if file.attached?
    end

    private

    def set_file_metadata
      return unless file.attached?

      self.file_name = file.blob.filename.to_s if file_name.blank?
      self.content_type = file.blob.content_type
      self.file_size = file.blob.byte_size
    end

    def file_within_limit
      return unless file.attached? && file.blob.byte_size.to_i > Pipelines::MAX_UPLOAD_BYTES

      errors.add(:file, :too_large, count: Pipelines::MAX_UPLOAD_BYTES / 1.megabyte)
    end
  end
end
