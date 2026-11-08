# O perfil de quem está logado. Nome, telefone, idioma, foto e senha são da pessoa (`User`) e
# valem em todas as organizações dela. O e-mail não muda por aqui, como na origem: é o login.
#
# A resposta é o vínculo da aba (`AccountSerializer`), que já traz a identidade: a tela troca
# `session.account` pelo que recebe.
class ProfileController < PlatformController
  include ImageUploadable

  def show
    render_profile
  end

  def update
    fields = params.expect(profile: %i[name phone locale current_password password password_confirmation])
    attributes = fields.slice(:name, :phone, :locale)
    changing_password = fields[:password].present?

    if changing_password
      return render_wrong_current_password unless current_user.authenticate(fields[:current_password].to_s)

      attributes = attributes.merge(fields.slice(:password, :password_confirmation))
    end

    return render_invalid(current_user) unless current_user.update(attributes)

    # Quem estava com a senha antiga em outro aparelho precisa entrar de novo; quem acabou
    # de trocar continua onde está.
    current_user.end_sessions!(except: current_session) if changing_password
    render_profile
  end

  def upload_avatar
    render_profile if attach_image(current_user.avatar)
  end

  def destroy_avatar
    current_user.avatar.purge if current_user.avatar.attached?
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
