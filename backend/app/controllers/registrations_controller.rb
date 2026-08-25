# POST /signup — criar conta.
class RegistrationsController < ApplicationController
  def create
    result = SignUp.new(
      name: registration_params[:name],
      email: registration_params[:email],
      password: registration_params[:password],
      organization_name: registration_params[:organizationName],
      user_agent: request.user_agent,
      ip_address: request.remote_ip
    ).call

    if result.success?
      render json: SessionSerializer.one(result.session), status: :created
    else
      render_error(
        status: :unprocessable_entity,
        code: result.error.code,
        field: result.error.field,
        message: message_for(result.error),
        details: result.error.details
      )
    end
  end

  private

  def message_for(error)
    return t("auth.#{error.code.underscore}") if error.code == "emailTaken"

    error.message.presence || t("errors.unprocessable")
  end

  def registration_params
    params.require(:account).permit(:name, :email, :password, :organizationName)
  end
end
