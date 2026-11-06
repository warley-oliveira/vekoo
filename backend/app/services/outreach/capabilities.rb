module Outreach
  # O que depende de chave externa. Sem elas, o resto das campanhas funciona: a tela lê daqui o que
  # oferecer. Os dados do Google são públicos por natureza (na origem iam embutidos no front): é a
  # conta de quem está na tela que autoriza a leitura da planilha.
  module Capabilities
    module_function

    def apify_token
      ENV["APIFY_API_TOKEN"].presence
    end

    def apify?
      apify_token.present?
    end

    def google_sheets?
      google_client_id.present?
    end

    def google_client_id
      ENV["GOOGLE_SHEETS_CLIENT_ID"].presence
    end

    def as_json
      {
        placeExtractions: { available: apify? },
        googleSheets: {
          available: google_sheets?,
          clientId: google_client_id,
          apiKey: ENV["GOOGLE_SHEETS_API_KEY"].presence,
          appId: ENV["GOOGLE_SHEETS_APP_ID"].presence
        }
      }
    end
  end
end
