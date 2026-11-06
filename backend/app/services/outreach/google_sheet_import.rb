module Outreach
  # Baixa uma aba do Google Sheets como CSV e devolve cabeçalhos e linhas, para a tela mapear as
  # colunas. Não grava nada: quem importa é `import-csv-contacts`, depois do mapeamento.
  #
  # O token é da pessoa que está na tela, vindo do login do Google no navegador, e não fica guardado.
  class GoogleSheetImport
    MAX_ROWS = 50_000
    TIMEOUT = 30
    # Sem isto, um id montado subiria de caminho dentro de docs.google.com com o token da pessoa.
    FILE_ID_FORMAT = /\A[A-Za-z0-9_-]{1,128}\z/
    SHEET_GID_FORMAT = /\A\d{1,20}\z/
    STATUS_CODES = { 401 => "googleTokenExpired", 403 => "googleForbidden", 404 => "googleSheetNotFound" }.freeze

    Result = Struct.new(:headers, :rows, keyword_init: true)

    def initialize(file_id:, sheet_gid:, access_token:)
      @file_id = file_id.to_s.strip
      @sheet_gid = sheet_gid.to_s.strip
      @access_token = access_token.to_s.strip
    end

    # @raise [RefusedError]
    # @return [Result]
    def call
      validate!
      parse(download)
    rescue CSV::MalformedCSVError
      raise RefusedError, "googleSheetInvalid"
    end

    private

    attr_reader :file_id, :sheet_gid, :access_token

    def validate!
      raise RefusedError, "googleSheetsNotConfigured" unless Capabilities.google_sheets?
      raise RefusedError.new("googleSheetParamsRequired", field: "fileId") unless file_id.match?(FILE_ID_FORMAT)
      raise RefusedError.new("googleSheetParamsRequired", field: "sheetGid") unless sheet_gid.match?(SHEET_GID_FORMAT)
      raise RefusedError.new("googleSheetParamsRequired", field: "accessToken") if access_token.blank?
    end

    def download
      response = HTTParty.get(
        "https://docs.google.com/spreadsheets/d/#{file_id}/export?format=csv&gid=#{sheet_gid}",
        headers: { "Authorization" => "Bearer #{access_token}" },
        timeout: TIMEOUT
      )
      raise RefusedError, STATUS_CODES.fetch(response.code, "googleSheetFailed") unless response.success?

      response.body.to_s.dup.force_encoding("UTF-8").scrub
    rescue SocketError, SystemCallError, OpenSSL::SSL::SSLError, HTTParty::Error => e
      Rails.logger.warn("[Outreach::GoogleSheetImport] #{e.class}: #{e.message}")
      raise RefusedError, "googleSheetFailed"
    end

    def parse(body)
      table = CSV.parse(body, headers: true, liberal_parsing: true)
      raise RefusedError, "googleSheetEmpty" if table.headers.blank? || table.size.zero?
      raise RefusedError, "googleSheetTooLarge" if table.size > MAX_ROWS

      Result.new(headers: table.headers, rows: table.map { |row| row.to_h.transform_values(&:to_s) })
    end
  end
end
