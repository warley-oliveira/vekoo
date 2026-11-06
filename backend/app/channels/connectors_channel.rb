# Tempo real da conexão de um canal: QR code, escaneou, expirou. O id vem de fora, mas a
# busca parte da organização da sessão: conector de outra organização é recusado.
class ConnectorsChannel < ApplicationCable::Channel
  def subscribed
    @connector = find_connector
    return reject unless @connector

    stream_from @connector.stream_name

    qrcode_base64 = Rails.cache.read("qrcode.base64.#{@connector.id}")
    transmit({ status: "qr_updated", base64: qrcode_base64, pairCode: nil }) if qrcode_base64
  end

  def unsubscribed
    stop_all_streams
  end

  def unsubscribe
    stop_all_streams
  end

  # Pedido periodicamente pela tela (a cada 8 segundos): o WhatsApp invalida o QR code da
  # Z-API a cada 20 segundos.
  def generate_qr_code
    connector = find_connector
    return unless connector&.try(:zapi_provider?) && connector.pending?

    qr_response = connector.zapi_get_qr_code_image
    return unless qr_response && qr_response["value"].present?

    connector.broadcast_connection(status: "qr_updated", base64: qr_response["value"])
  rescue ZapiClient::Error, Connector::Zapi::ZApiError => e
    Rails.logger.error("[ConnectorsChannel] Failed to generate QR code: #{e.message}")
    connector.broadcast_connection(status: "qr_error", error: e.message)
  rescue StandardError => e
    Rails.logger.error("[ConnectorsChannel] Unexpected error generating QR code: #{e.message}")
  end

  private

  def find_connector
    id = params[:connectorId] || params[:connector_id]
    return nil if id.blank?

    Connector::Base.scoped(current_organization.id, id.to_s)
  end
end
