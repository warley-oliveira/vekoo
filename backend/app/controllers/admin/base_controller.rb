# A área da Vekoo (`/admin/*`): curadoria do banco de referências. Só para
# pessoa `staff` (`User#staff`), em qualquer organização dela: o curador gravado é o vínculo da
# aba (`X-Account`), como em toda rota da plataforma.
#
# Quem não é staff — inclusive sem sessão — recebe **404**, não 401 nem 403:
# a resposta tem que ser a mesma de uma rota que não existe, para a área não
# se anunciar a quem está de fora.
module Admin
  class BaseController < ApplicationController
    include Authenticatable

    skip_before_action :require_session
    skip_before_action :require_account
    before_action :require_staff

    private

    # Antes de olhar o vínculo: quem não é staff recebe o 404 de rota inexistente, nunca o
    # `accountRequired` que contaria que a área existe.
    def require_staff
      return render_not_found unless signed_in? && current_user.staff?

      current_session.touch_usage!
      require_account
    end
  end
end
