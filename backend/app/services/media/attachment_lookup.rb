module Media
  # O único ponto em que este domínio toca em `Attachment` (origem: ChatAttachment), que
  # é do domínio inbox. Enquanto ele não existe, nada resolve e quem chama segue pela URL
  # que já tem. Quando existir, basta manter esta interface:
  #
  #   Attachment.where(organization_id:).find_by(id:)
  #   Attachment.from_file_url(url)
  #   Attachment.where(organization_id:).available
  #   attachment.file_url, attachment.name, attachment.file
  module AttachmentLookup
    module_function

    def available?
      defined?(::Attachment).present?
    end

    def find(id, organization_id: nil)
      return nil if id.blank? || !available?

      scope = organization_id ? ::Attachment.where(organization_id: organization_id) : ::Attachment
      scope.find_by(id: id)
    end

    def from_file_url(url)
      return nil if url.blank? || !available?

      ::Attachment.from_file_url(url)
    end

    def available_for(organization_id)
      return [] unless available?

      ::Attachment.where(organization_id: organization_id).available
    end
  end
end
