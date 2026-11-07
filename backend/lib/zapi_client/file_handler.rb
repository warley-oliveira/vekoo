# frozen_string_literal: true

class ZapiClient
  # Handles file preparation and conversion for API requests
  module FileHandler
    module_function

    # Prepares a file parameter for sending (image, audio, video, document).
    # If it's a URL or Data URI, returns as-is; if it's a local file path, reads and converts to Base64.
    # @param file_or_url [String, File] URL, Data URI, file path, or File object
    # @param param_name [String] Parameter name for error messages
    # @return [String] URL or Base64 data URI
    # @raise [ZapiClient::Error] If local file is not found
    def prepare_file_param(file_or_url, param_name)
      if file_or_url.is_a?(String)
        stripped = file_or_url.strip
        return stripped if url_or_data_uri?(stripped)
      end

      filepath = extract_filepath(file_or_url)
      validate_file_exists!(filepath, param_name, file_or_url)

      convert_to_base64_data_uri(filepath)
    end

    # Extracts document extension from various input types
    # @param document [String, File] Document URL, Data URI, or file path
    # @param file_name [String, nil] Optional file name
    # @return [Array<String, String>] Tuple of [extension, file_name]
    def extract_document_info(document, file_name = nil)
      ext = nil

      if document.is_a?(String) && document.strip.start_with?("http")
        ext, file_name = extract_from_url(document, file_name)
      elsif document.is_a?(String) && document.strip.start_with?("data:")
        ext = extract_from_data_uri(document)
      elsif document.is_a?(String) || document.respond_to?(:path)
        ext, file_name = extract_from_filepath(document, file_name)
      end

      ext = normalize_extension(ext)
      [ ext, file_name ]
    end

    # Checks if the string is a URL or Data URI
    # @param str [String] String to check
    # @return [Boolean]
    def url_or_data_uri?(str)
      str.start_with?("http://", "https://", "data:")
    end

    # Extracts file path from various input types
    # @param file_or_url [String, File] Input to extract path from
    # @return [String, nil] File path or nil
    def extract_filepath(file_or_url)
      if file_or_url.is_a?(String)
        file_or_url
      elsif file_or_url.respond_to?(:path)
        file_or_url.path
      end
    end

    # Validates that a file exists
    # @param filepath [String, nil] File path to validate
    # @param param_name [String] Parameter name for error message
    # @param original_input [Object] Original input for error message
    # @raise [ZapiClient::Error] If file is not found
    def validate_file_exists!(filepath, param_name, original_input)
      return if filepath && File.exist?(filepath)

      raise ZapiClient::Error, "#{param_name} file not found: #{original_input}"
    end

    # Converts a local file to Base64 data URI format
    # @param filepath [String] Path to the file
    # @return [String] Base64 data URI
    def convert_to_base64_data_uri(filepath)
      ext = File.extname(filepath).downcase
      mime_type = MimeTypes.mime_for_extension(ext)
      file_content = File.binread(filepath)
      base64_data = Base64.strict_encode64(file_content)

      "data:#{mime_type};base64,#{base64_data}"
    end

    private_class_method def self.extract_from_url(document, file_name)
      uri = begin
        URI.parse(document.strip)
      rescue StandardError
        nil
      end

      file_name ||= File.basename(uri.path) if uri && !uri.path.empty?

      ext = File.extname(file_name).downcase if file_name
      [ ext, file_name ]
    end

    private_class_method def self.extract_from_data_uri(document)
      return nil unless document =~ /data:([^;]+);base64/

      mime = Regexp.last_match(1)
      MimeTypes.extension_for_mime(mime) || ""
    end

    private_class_method def self.extract_from_filepath(document, file_name)
      filepath = document.is_a?(String) ? document : document.path
      file_name ||= File.basename(filepath) if filepath
      ext = File.extname(filepath).downcase if filepath
      [ ext, file_name ]
    end

    private_class_method def self.normalize_extension(ext)
      ext = ext.to_s.sub(".", "")
      ext.nil? || ext.empty? ? "pdf" : ext
    end
  end
end
