# GET /admin/instagram/status — o estado do token do Meta (vale, vence logo,
# venceu), para o aviso no topo da curadoria. Uma consulta ao Meta por hora.
module Admin
  class InstagramController < BaseController
    def status
      render json: InstagramGraph::TokenStatus.call
    end
  end
end
