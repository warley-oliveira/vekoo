module Pipelines
  class CardAttachment < ApplicationRecord
    belongs_to :card, class_name: "Pipelines::Card", inverse_of: :attachments
    belongs_to :uploaded_by, class_name: "Account", foreign_key: :account_id, optional: true

    has_one_attached :file

    validates :file, presence: true
    validate :file_within_limit

    before_save :remember_file_name

    # Caminho sem host, como nas mensagens: a tela prefixa com a URL da API.
    def file_url
      Media::Storage.path_for(file.blob) if file.attached?
    end

    private

    def remember_file_name
      self.file_name = file.blob.filename.to_s if file.attached? && file_name.blank?
    end

    def file_within_limit
      return unless file.attached? && file.blob.byte_size.to_i > Pipelines::MAX_UPLOAD_BYTES

      errors.add(:file, :too_large, count: Pipelines::MAX_UPLOAD_BYTES / 1.megabyte)
    end
  end
end
