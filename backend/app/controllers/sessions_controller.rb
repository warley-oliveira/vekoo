# POST /login, DELETE /logout e GET /me — a sessão de quem está usando.
class SessionsController < AuthenticatedController
  skip_before_action :require_session, only: :create

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

  private

  def session_params
    params.require(:session).permit(:email, :password)
  end
end
