# `partial_analysis`: o card saiu de um vídeo (reels) e a análise viu só a capa
# e a legenda — o modelo não lê vídeo. Melhoria futura: analisar o vídeo pelo
# Gemini no Vertex.
#
# E um post do Instagram vira no máximo um card: índice único no id da mídia
# guardado na fonte.
class AddPartialAnalysisToReferenceCards < ActiveRecord::Migration[8.1]
  def change
    add_column :reference_cards, :partial_analysis, :boolean, null: false, default: false
    add_index :reference_cards, "(source->>'igMediaId')", unique: true, where: "source ? 'igMediaId'",
      name: "index_reference_cards_on_ig_media_id"
  end
end
