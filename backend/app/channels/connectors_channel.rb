# Tempo real da conexão de um canal: QR code, escaneou, expirou. O id vem de fora, mas a
# busca parte da organização da sessão: conector de outra organização é recusado.
class ConnectorsChannel < ApplicationCable::Channel
  def subscribed
    @connector = find_connector
    return reject unless @connector && current_account.can?(:core_settings)

    stream_from @connector.stream_name

    qrcode_base64 = Rails.cache.read("qrcode.base64.#{@connector.id}")
    # O código de pareamento vai junto: quem assina depois do webhook não pode ficar sem ele.
    transmit({ status: "qr_updated", base64: qrcode_base64, pairCode: Rails.cache.read("pair_code.#{@connector.id}") }) if qrcode_base64
  end

  def unsubscribed
    stop_all_streams
  end

  def unsubscribe
    stop_all_streams
  end

  private

  def find_connector
    id = params[:connectorId] || params[:connector_id]
    return nil if id.blank?

    Connector::Base.scoped(current_organization.id, id.to_s)
  end
end
