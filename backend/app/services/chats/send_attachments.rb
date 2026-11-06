module Chats
  # Os arquivos que a pessoa manda por dentro de uma conversa. Cada um vira um anexo privado, fora
  # da galeria (`private`), e uma mensagem. Quem falha não impede os outros.
  #
  # Pausa a automação, como no texto e no áudio: é intervenção humana. A origem só não pausava aqui.
  class SendAttachments
    Result = Struct.new(:messages, :failures, keyword_init: true)

    # @param files [Array<#read>]
    # @return [Result] `failures`: [{ file:, messages: }]
    def self.call(chat:, account:, files:)
      new(chat, account, files).call
    end

    def initialize(chat, account, files)
      @chat = chat
      @account = account
      @files = files
    end

    def call
      chat.updated_by_account = account
      chat.pause_automation_for_human!

      messages = []
      failures = []

      files.each do |file|
        attachment = build_attachment(file)

        if attachment.save
          messages << deliver(attachment, file)
        else
          failures << { file: file.original_filename, messages: attachment.errors.full_messages }
        end
      end

      Result.new(messages: messages, failures: failures)
    end

    private

    attr_reader :chat, :account, :files

    def build_attachment(file)
      chat.organization.attachments.new(name: file.original_filename, file: file, private: true)
    end

    def deliver(attachment, file)
      media = MediaMessageDto.new(attachment.media_type, attachment.name, nil, attachment.id, nil, media_url: attachment.file_url)

      Chats::SendMedia.call(
        chat: chat,
        media: media,
        account: account,
        attributes: { media_properties: { "fileName" => attachment.name, "fileLength" => file.size } }
      )
    end
  end
end
