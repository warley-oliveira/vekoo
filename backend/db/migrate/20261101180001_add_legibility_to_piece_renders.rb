class AddLegibilityToPieceRenders < ActiveRecord::Migration[8.1]
  def change
    # O pior contraste do texto sobre foto na lâmina desenhada e se passou do
    # mínimo — o aviso de leitura do editor.
    add_column :piece_renders, :legibility, :jsonb
  end
end
