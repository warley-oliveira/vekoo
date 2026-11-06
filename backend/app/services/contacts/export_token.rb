module Contacts
  # O link de download de uma exportação: assinado, de uma pessoa e por tempo limitado. Vai sem
  # sessão, porque quem abre é o navegador, num link.
  module ExportToken
    TTL = 1.hour
    PURPOSE = :contacts_export_download

    class Invalid < StandardError; end
    class Expired < StandardError; end

    module_function

    def generate(blob_id:, account_id:, organization_id:)
      verifier.generate(
        { blob_id: blob_id.to_s, account_id: account_id.to_s, organization_id: organization_id.to_s, expires_at: TTL.from_now.iso8601 },
        purpose: PURPOSE
      )
    end

    # @return [Hash] { blob_id:, account_id:, organization_id: }, com chaves em símbolo
    # @raise [Invalid, Expired]
    def verify(token)
      data = verifier.verify(token.to_s, purpose: PURPOSE).symbolize_keys
      raise Expired if Time.zone.parse(data[:expires_at].to_s) < Time.current

      data
    rescue ActiveSupport::MessageVerifier::InvalidSignature
      raise Invalid
    end

    def download_path(token)
      "/contacts/download-export?token=#{CGI.escape(token)}"
    end

    def verifier
      Rails.application.message_verifier(:contacts_export)
    end
    private_class_method :verifier
  end
end
