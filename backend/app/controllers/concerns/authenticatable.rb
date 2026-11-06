# Sessão por token portador: `Authorization: Bearer <token>`.
#
# Hoje o token viaja no cabeçalho porque é o que um SPA em outro domínio
# consegue fazer sem cookie de terceiros. Quando front e API dividirem o mesmo
# domínio, troca-se por cookie httpOnly aqui dentro — nenhuma tela muda.
module Authenticatable
  extend ActiveSupport::Concern

  included do
    before_action :require_session
  end

  private

  def current_session
    @current_session ||= Session.authenticate(bearer_token)
  end

  def current_account
    current_session&.account
  end

  def current_organization
    current_account&.organization
  end

  def signed_in?
    current_session.present?
  end

  def require_session
    return render_no_session unless signed_in?

    current_session.touch_usage!
  end

  # Quem tinha sessão e perdeu o acesso ouve o motivo, não um "não autorizado" qualquer.
  # Só quem tem o token chega aqui, então isto não revela nada a mais ninguém.
  def render_no_session
    Session.revoked_token?(bearer_token) ? render_access_revoked : render_unauthorized
  end

  def bearer_token
    header = request.headers["Authorization"].to_s
    header[/\ABearer (.+)\z/, 1]
  end
end
