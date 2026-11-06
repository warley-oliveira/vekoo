# Progresso das buscas de estabelecimentos da organização. Origem: ApifyExtractionChannel.
#
# Eventos: { action: 'status_update' | 'extraction_completed', data: { id, ... } }. Quem assina
# filtra pelo id que recebeu em POST /place-extractions. Os resultados não vão no evento, como na
# origem: são centenas de lugares indo para todo mundo da organização que estiver na tela. Quem pediu
# busca em GET /place-extractions/:id/results.
class PlaceExtractionChannel < ApplicationCable::Channel
  STREAM = "place_extractions".freeze

  def self.broadcast_status(extraction)
    publish(extraction, "status_update")
  end

  def self.broadcast_completed(extraction)
    publish(extraction, "extraction_completed")
  end

  # Melhor esforço: quem perdeu o aviso lê o estado em GET /place-extractions/:id.
  def self.publish(extraction, action)
    ActionCable.server.broadcast(
      organization_stream(extraction.organization_id, STREAM),
      { action: action, data: Outreach::PlaceExtractionSerializer.event(extraction) }
    )
  rescue StandardError => e
    Rails.logger.warn("[PlaceExtractionChannel] transmissão perdida (#{action}): #{e.class}: #{e.message}")
  end
  private_class_method :publish

  def subscribed
    return reject unless current_account.can?(:campaigns)

    stream_from organization_stream(STREAM)
  end

  def unsubscribed
    stop_all_streams
  end
end
