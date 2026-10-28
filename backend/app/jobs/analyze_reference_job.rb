# A análise de uma referência pelo modelo de visão, em segundo plano: leva
# dezenas de segundos. O card pode ter sido arquivado (ou já analisado por um
# clique duplo) enquanto esperava na fila.
class AnalyzeReferenceJob < ApplicationJob
  queue_as :default

  def perform(card_id)
    card = ReferenceCard.find_by(id: card_id)
    return unless card&.analysis_status == "pending"

    References::Analyze.new(card).call
  end
end
