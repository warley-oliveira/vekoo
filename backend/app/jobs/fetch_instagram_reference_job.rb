# As imagens e a legenda dos cards que vieram do Instagram, e a análise de
# cada um — uma leitura do Meta por conta. Só os ids dos cards viajam na fila;
# a legenda nunca passa pelo Redis.
class FetchInstagramReferenceJob < ApplicationJob
  queue_as :default

  def perform(*card_ids)
    cards = ReferenceCard.where(id: card_ids, analysis_status: "pending").to_a
    References::FetchInstagramMedia.new(cards).call if cards.any?
  end
end
