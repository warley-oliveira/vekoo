# frozen_string_literal: true

class MetaApiClient
  # Low-level HTTP execution layer for Meta Graph and Messaging APIs.
  # All HTTParty calls are centralised here so callers never touch HTTParty directly.
  module HttpClient
    # Executes a POST request with a JSON body and an Authorization Bearer header.
    #
    # @param url     [String]  Full endpoint URL
    # @param headers [Hash]    Request headers
    # @param body    [Hash]    Request body – serialised to JSON internally
    # @param query   [Hash]    Optional URL query parameters
    # @param timeout [Integer] Seconds before the request times out
    # @return [HTTParty::Response]
    def self.post(url, headers:, body: {}, query: {}, timeout: 30)
      options = { headers: headers, timeout: timeout }
      options[:body]  = body.to_json unless body.empty?
      options[:query] = query        unless query.empty?

      HTTParty.post(url, **options)
    end

    # Executes a GET request.
    #
    # @param url     [String]  Full endpoint URL
    # @param query   [Hash]    URL query parameters
    # @param headers [Hash]    Optional extra headers
    # @param timeout [Integer] Seconds before the request times out
    # @return [HTTParty::Response]
    def self.get(url, query: {}, headers: {}, timeout: 30)
      HTTParty.get(
        url,
        query: query,
        headers: headers,
        timeout: timeout
      )
    end

    # Executes a DELETE request.
    #
    # @param url     [String]  Full endpoint URL
    # @param query   [Hash]    URL query parameters
    # @param headers [Hash]    Optional extra headers
    # @param timeout [Integer] Seconds before the request times out
    # @return [HTTParty::Response]
    def self.delete(url, query: {}, headers: {}, timeout: 30)
      HTTParty.delete(
        url,
        query: query,
        headers: headers,
        timeout: timeout
      )
    end

    # Executes a POST request with a form-encoded body (used by Instagram OAuth).
    #
    # @param url     [String]  Full endpoint URL
    # @param body    [Hash]    Form fields
    # @param timeout [Integer] Seconds before the request times out
    # @return [HTTParty::Response]
    def self.post_form(url, body: {}, timeout: 30)
      HTTParty.post(url, body: body, timeout: timeout)
    end

    # Streams a remote file into a temp file and returns its path. Returns +nil+ on failure,
    # without leaving the file behind. On success, deleting the file is up to the caller.
    #
    # `Tempfile.create`, não `.new`: o objeto do `.new` morre ao sair daqui e leva o arquivo
    # junto no primeiro GC do processo, antes de quem recebeu o caminho conseguir ler.
    #
    # @param url     [String]  URL of the file to download
    # @param timeout [Integer] Seconds before the request times out
    # @return [String, nil] Absolute path to the temp file, or nil on failure
    def self.stream_download(url, timeout: 60)
      tmp_file = Tempfile.create(['meta_media_', '.bin'])

      response = HTTParty.get(url, stream_body: true, timeout: timeout) do |fragment|
        tmp_file.write(fragment)
      end
      tmp_file.close

      unless response.success?
        Rails.logger.error "[MetaApiClient::HttpClient] stream_download failed (HTTP #{response.code})"
        File.delete(tmp_file.path)
        return nil
      end

      tmp_file.path
    rescue StandardError => e
      Rails.logger.error "[MetaApiClient::HttpClient] stream_download error: #{e.message}"
      if tmp_file
        tmp_file.close
        File.delete(tmp_file.path) if File.exist?(tmp_file.path)
      end
      nil
    end
  end
end
