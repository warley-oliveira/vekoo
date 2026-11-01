# A área da Vekoo (`/admin/*`): curadoria do banco de referências. Só para
# conta `staff`.
#
# Quem não é staff — inclusive sem sessão — recebe **404**, não 401 nem 403:
# a resposta tem que ser a mesma de uma rota que não existe, para a área não
# se anunciar a quem está de fora.
module Admin
  class BaseController < ApplicationController
    include Authenticatable

    skip_before_action :require_session
    before_action :require_staff

    private

    def require_staff
      return render_not_found unless signed_in? && current_account.staff?

      current_session.touch_usage!
    end
  end
end
