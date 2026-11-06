# frozen_string_literal: true

class ZapiClient
  # MIME type mappings for file extensions
  module MimeTypes
    EXTENSION_TO_MIME = {
      '.png' => 'image/png',
      '.jpg' => 'image/jpeg',
      '.jpeg' => 'image/jpeg',
      '.gif' => 'image/gif',
      '.webp' => 'image/webp',
      '.mp4' => 'video/mp4',
      '.mpeg' => 'video/mpeg',
      '.mpg' => 'video/mpeg',
      '.mov' => 'video/quicktime',
      '.pdf' => 'application/pdf',
      '.doc' => 'application/msword',
      '.docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls' => 'application/vnd.ms-excel',
      '.xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt' => 'application/vnd.ms-powerpoint',
      '.pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.mp3' => 'audio/mpeg',
      '.wav' => 'audio/wav',
      '.ogg' => 'audio/ogg; codecs=opus',
      '.oga' => 'audio/ogg; codecs=opus',
      '.aac' => 'audio/aac',
      '.txt' => 'text/plain'
    }.freeze

    MIME_TO_EXTENSION = {
      'application/pdf' => '.pdf',
      'application/msword' => '.doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => '.docx',
      'text/plain' => '.txt'
    }.freeze

    DEFAULT_MIME = 'application/octet-stream'

    # Returns the MIME type for a given file extension
    # @param extension [String] File extension (with or without dot)
    # @return [String] MIME type
    def self.mime_for_extension(extension)
      ext = extension.to_s.downcase
      ext = ".#{ext}" unless ext.start_with?('.')
      EXTENSION_TO_MIME[ext] || DEFAULT_MIME
    end

    # Returns the file extension for a given MIME type
    # @param mime_type [String] MIME type
    # @return [String, nil] File extension or nil if not found
    def self.extension_for_mime(mime_type)
      MIME_TO_EXTENSION[mime_type]
    end
  end
end
