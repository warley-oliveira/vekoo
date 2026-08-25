# Esqueci a senha.
#
# `create` responde 202 sempre, exista o e-mail ou não: dizer "esse e-mail não
# tem conta" entregaria a lista de quem usa o produto. Quando o envio de e-mail
# entrar, é daqui que ele sai (ActiveJob → Sidekiq).
class PasswordResetsController < ApplicationController
  def create
    account = Account.find_by(email: params.require(:passwordReset)[:email].to_s.strip.downcase)
    reset = account && PasswordReset.open!(account)

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

    account = reset.account
    account.password = params.require(:passwordReset)[:password]

    if account.save
      reset.use!
      account.sessions.destroy_all
      head :no_content
    else
      render_invalid(account)
    end
  end
end
