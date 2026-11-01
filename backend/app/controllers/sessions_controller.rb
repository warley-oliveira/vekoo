# POST /login, DELETE /logout e GET /me — a sessão de quem está usando.
class SessionsController < AuthenticatedController
  skip_before_action :require_session, only: :create

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
      render json: SessionSerializer.one(result.session), status: :created
    else
      render_error(
        status: :unauthorized,
        code: result.error.code,
        field: result.error.field,
        message: t("auth.#{result.error.code.underscore}")
      )
    end
  end

  # Quem está aí? É o que a tela pergunta ao abrir, com o token guardado.
  def show
    render json: SessionSerializer.one(current_session)
  end

  def destroy
    current_session.destroy!
    head :no_content
  end

  # PATCH /me/organization — staff entra numa organização interna (as marcas
  # de teste) ou volta à da conta (`organizationId` nulo). Para quem não é
  # staff a rota não existe, como as do /admin.
  def organization
    return render_not_found unless current_account.staff?

    id = params[:organizationId].presence
    target = id && current_session.organizations.find { |org| org.id == id }
    return render_error(status: :unprocessable_entity, code: "unprocessable", field: "organizationId", message: t("errors.unprocessable")) if id && target.nil?

    current_session.update!(acting_organization: target == current_account.organization ? nil : target)
    render json: SessionSerializer.one(current_session.reload)
  end

  private

  def session_params
    params.require(:session).permit(:email, :password)
  end
end
