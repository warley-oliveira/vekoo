# As imagens e a legenda de um card que veio do Instagram, e a análise dele.
# Só o id do card viaja na fila — a legenda nunca passa pelo Redis.
class FetchInstagramReferenceJob < ApplicationJob
  queue_as :default

  def perform(card_id)
    card = ReferenceCard.find_by(id: card_id)
    References::FetchInstagramMedia.new(card).call if card&.analysis_status == "pending"
  end
end
