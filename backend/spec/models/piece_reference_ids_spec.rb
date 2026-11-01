require "rails_helper"

# A peça guarda que cards do banco de referências o agente usou — e isso
# nunca chega ao assinante.
RSpec.describe Piece, "reference_ids" do
  let(:card) { create(:reference_card, :published) }

  it "guarda os ids sem vazio nem repetição" do
    piece = create(:piece, reference_ids: [ card.id, "", card.id ])

    expect(piece.reload.reference_ids).to eq([ card.id ])
  end

  it "nasce vazia" do
    expect(create(:piece).reference_ids).to eq([])
  end

  it "fica de fora do JSON da peça" do
    piece = create(:piece, reference_ids: [ card.id ])

    payload = JSON.generate(PieceSerializer.one(piece))
    expect(payload).not_to include(card.id)
    expect(payload).not_to match(/reference/i)
  end
end
