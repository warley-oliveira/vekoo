# GET /render/piece-versions/:id?token= — o que a rota `/render` do front
# precisa para desenhar uma versão no Chromium do export. Sem sessão: vale o
# token de 10 minutos que o próprio servidor gerou para aquela versão.
class PieceRenderPayloadsController < ApplicationController
  def show
    version_id = PieceRenderers.version_from_token(params[:token])
    return head(:not_found) unless version_id && version_id == params[:id]

    render json: PieceRenderers.payload(PieceVersion.find(version_id))
  end
end
