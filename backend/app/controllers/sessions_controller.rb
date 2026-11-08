# POST /login, DELETE /logout e GET /me — a sessão de quem está usando.
#
# A sessão é da pessoa. `/me` vale fora de qualquer organização (a tela de escolher organização
# usa) e, com `X-Account`, traz também o vínculo, a organização e o saldo daquela aba.
class SessionsController < AuthenticatedController
  skip_before_action :require_session, only: :create
  skip_account_requirement

  # A única porta da API que aceita palpite. Sem limite, adivinhar senha é só
  # questão de tempo — e `SignIn` distingue de propósito "e-mail não existe" de
  # "senha errada", o que também torna a lista de contas varrível.
  #
  # Por IP **e** por e-mail: só por IP, quem tem várias saídas de rede passa;
  # só por e-mail, um alvo derruba a conta de quem está tentando entrar.
  rate_limit to: 10, within: 3.minutes, only: :create,
    with: -> { render_too_many_requests }
  rate_limit to: 5, within: 3.minutes, only: :create,
    by: -> { params.dig(:session, :email).to_s.strip.downcase },
    name: "por-email",
    with: -> { render_too_many_requests }

  def create
    result = SignIn.new(
      email: session_params[:email],
      password: session_params[:password],
      user_agent: request.user_agent,
      ip_address: request.remote_ip
    ).call

    if result.success?
      account = result.session.user.memberships.limit(2).to_a.then { |found| found.one? ? found.first : nil }
      render json: SessionSerializer.one(result.session, account: account), status: :created
    else
      render_error(
        status: :unauthorized,
        code: result.error.code,
        field: result.error.field,
        message: t("auth.#{result.error.code.underscore}")
      )
    end
  end

  # Quem está aí? É o que a tela pergunta ao abrir, com o token guardado. Com `X-Account`, o
  # vínculo pedido precisa valer (mesmos erros de qualquer rota); sem ele, vem o único vínculo da
  # pessoa, ou nenhum.
  def show
    return require_account if requested_account_hashid && current_account.nil?

    current_account&.update_column(:last_seen_at, Time.current)
    render json: SessionSerializer.one(current_session, account: current_account)
  end

  # O WebSocket é conferido só ao conectar: sem isto, o de um aparelho que ficou aberto continuaria
  # recebendo depois de sair. Os das outras sessões voltam sozinhos.
  def destroy
    user = current_user
    current_session.destroy!
    user.reconnect_realtime
    head :no_content
  end

  private

  def session_params
    params.require(:session).permit(:email, :password)
  end
end
