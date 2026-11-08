# Sessão por token portador (`Authorization: Bearer <token>`) e o vínculo da aba
# (`X-Account: <hashid>`).
#
# A sessão é da pessoa (`User`). Cada aba do front trabalha numa organização, e manda o hashid
# do vínculo (`Account`) dela em toda requisição. Daqui saem `current_user`, `current_account` e
# `current_organization`; a organização **nunca** vem de id no corpo ou no caminho.
#
#   - sem sessão: 401 `unauthorized` (ou `accessRevoked`, ver abaixo);
#   - hashid que não existe ou é de outra pessoa: 404 `accountNotFound`, a mesma resposta para os
#     dois, que não diz se a organização existe;
#   - vínculo da própria pessoa, revogado: 403 `accountRevoked`;
#   - sem cabeçalho: vale o único vínculo ativo da pessoa; com mais de um, 400 `accountRequired`.
#
# Rotas que valem para a pessoa e não para uma organização (`/me`, `/logout`, `/organizations`,
# suporte) pulam a exigência com `skip_account_requirement`.
#
# Hoje o token viaja no cabeçalho porque é o que um SPA em outro domínio consegue fazer sem
# cookie de terceiros. Quando front e API dividirem o mesmo domínio, troca-se por cookie httpOnly
# aqui dentro — nenhuma tela muda.
module Authenticatable
  extend ActiveSupport::Concern

  ACCOUNT_HEADER = "X-Account".freeze

  included do
    before_action :require_session
    before_action :require_account
  end

  class_methods do
    def skip_account_requirement(**options)
      skip_before_action :require_account, **options
    end
  end

  private

  def current_session
    @current_session ||= Session.authenticate(bearer_token)
  end

  def current_user
    current_session&.user
  end

  def current_account
    return @current_account if defined?(@current_account)

    @current_account = resolve_account
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

  def require_account
    return if current_account

    case @account_refusal
    when :revoked then render_error(status: :forbidden, code: "accountRevoked", message: t("auth.account_revoked"))
    when :required then render_error(status: :bad_request, code: "accountRequired", message: t("auth.account_required"))
    else render_error(status: :not_found, code: "accountNotFound", message: t("errors.not_found"))
    end
  end

  def requested_account_hashid
    request.headers[ACCOUNT_HEADER].to_s.strip.presence
  end

  def resolve_account
    user = current_user
    return nil unless user

    hashid = requested_account_hashid
    account = hashid ? Account.find_by_hashid_for(user, hashid) : implicit_account(user)
    return nil if account.nil?

    # A mesma instância da sessão: o que o perfil grava aparece já no vínculo.
    account.association(:user).target = user
    unless account.usable_by?(user)
      @account_refusal = account.support? ? :not_found : :revoked
      return nil
    end

    note_support_access(account) if account.support?
    account
  end

  # Sem cabeçalho, só quando não há dúvida: um vínculo ativo, e só um. Mantém de pé o cliente
  # que ainda não manda o cabeçalho (o app de carrosséis, um PWA antigo em cache).
  def implicit_account(user)
    candidates = user.memberships.limit(2).to_a
    return candidates.first if candidates.one?

    @account_refusal = candidates.empty? ? :not_found : :required
    nil
  end

  def note_support_access(account)
    SupportAccess.touch!(account, ip_address: request.remote_ip, user_agent: request.user_agent)
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
