# O vetor de um card de novo, depois de a curadoria mudar o conteúdo.
class EmbedReferenceJob < ApplicationJob
  queue_as :default

  def perform(card_id)
    card = ReferenceCard.find_by(id: card_id)
    References::Embed.new.call(card) if card
  end
end
