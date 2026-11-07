# Esqueci a senha.
#
# `create` responde 202 sempre, exista o e-mail ou não: dizer "esse e-mail não
# tem conta" entregaria a lista de quem usa o produto. Quando o envio de e-mail
# entrar, é daqui que ele sai (ActiveJob → Sidekiq).
class PasswordResetsController < ApplicationController
  # O 202 constante já não vaza quem tem conta; o limite impede o resto — usar
  # o envio de e-mail como forma de incomodar alguém.
  rate_limit to: 5, within: 15.minutes, only: :create,
    with: -> { render_too_many_requests }
  # E do outro lado: token é aleatório de 32 bytes, mas não custa fechar a porta
  # para quem quiser tentar mesmo assim.
  rate_limit to: 10, within: 15.minutes, only: :update,
    with: -> { render_too_many_requests }

  def create
    user = User.find_by_login(params.require(:passwordReset)[:email])
    reset = user && PasswordReset.open!(user)

    payload = { status: "accepted" }
    # Sem serviço de e-mail nesta etapa, o token volta na resposta em
    # desenvolvimento — é o que deixa a tela de nova senha ser testada.
    payload[:token] = reset.token if reset && !Rails.env.production?

    render json: payload, status: :accepted
  end

  # PATCH /password-resets/:token — troca a senha e derruba as sessões antigas.
  def update
    reset = PasswordReset.find_usable(params[:token])
    return render_error(status: :not_found, code: "resetTokenInvalid", message: t("auth.reset_token_invalid")) if reset.nil?

    user = reset.user
    user.password = params.require(:passwordReset)[:password]

    if user.save
      reset.use!
      # Os outros pedidos abertos valeriam por até 2 horas, depois de a pessoa já ter trocado a senha.
      user.password_resets.usable.update_all(used_at: Time.current)
      # Inclui o WebSocket: quem estava com a sessão antiga não fica escutando.
      user.end_sessions!
      head :no_content
    else
      render_invalid(user)
    end
  end
end
