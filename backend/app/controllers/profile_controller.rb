# O perfil de quem está logado. O e-mail não muda por aqui, como na origem: é o que
# identifica a conta, e quem altera é quem administra a organização (`/users`).
class ProfileController < PlatformController
  include ImageUploadable

  def show
    render_profile
  end

  def update
    attributes = params.permit(:name, :phone, :locale)
    changing_password = params[:password].present?

    if changing_password
      return render_wrong_current_password unless current_account.authenticate(params[:current_password].to_s)

      attributes = attributes.merge(
        password: params[:password],
        password_confirmation: params[:password_confirmation]
      )
    end

    return render_invalid(current_account) unless current_account.update(attributes)

    # Quem estava com a senha antiga em outro aparelho precisa entrar de novo; quem acabou
    # de trocar continua onde está.
    current_account.end_sessions!(except: current_session) if changing_password
    render_profile
  end

  def upload_avatar
    render_profile if attach_image(current_account.avatar)
  end

  def destroy_avatar
    current_account.avatar.purge if current_account.avatar.attached?
    render_profile
  end

  private

  def render_profile
    render json: AccountSerializer.one(current_account)
  end

  def render_wrong_current_password
    render_error(
      status: :unprocessable_content,
      code: "wrongPassword",
      field: "currentPassword",
      message: t("auth.wrong_password")
    )
  end
end
