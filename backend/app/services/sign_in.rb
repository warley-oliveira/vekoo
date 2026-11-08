# Entrar. Os códigos de erro são os mesmos que a tela já conhece
# (`emailNotFound`, `wrongPassword`) — distinguir os dois é escolha de produto:
# a tela diz "não encontramos esse e-mail" em vez de um "dados inválidos" que
# não ajuda ninguém.
#
# Quem entra é a pessoa (`User`); em qual organização ela vai trabalhar, a tela decide depois.
class SignIn
  Result = Struct.new(:session, :error, keyword_init: true) do
    def success? = error.nil?
  end

  Error = Struct.new(:code, :field, keyword_init: true)

  def initialize(email:, password:, user_agent: nil, ip_address: nil)
    @email = email.to_s.strip.downcase
    @password = password
    @user_agent = user_agent
    @ip_address = ip_address
  end

  def call
    user = User.find_by(email: @email)
    return failure("emailNotFound", "email") if user.nil?
    return failure("wrongPassword", "password") unless user.authenticate(@password)
    # Depois da senha: só quem é a pessoa fica sabendo que o acesso foi cortado. Vale para quem
    # perdeu todas as organizações; com uma ainda ativa, entra e escolhe.
    return failure("accessRevoked", "email") if user.locked_out?

    # Entrar é o único momento garantido em que se toca nas sessões da pessoa:
    # aproveitamos para varrer as vencidas, em vez de deixá-las acumulando para
    # sempre à espera de um agendador que não existe.
    user.sessions.where(expires_at: ...Time.current).delete_all

    Result.new(session: Session.start!(user, user_agent: @user_agent, ip_address: @ip_address))
  end

  private

  def failure(code, field)
    Result.new(error: Error.new(code: code, field: field))
  end
end
