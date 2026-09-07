# Entrar. Os códigos de erro são os mesmos que a tela já conhece
# (`emailNotFound`, `wrongPassword`) — distinguir os dois é escolha de produto:
# a tela diz "não encontramos esse e-mail" em vez de um "dados inválidos" que
# não ajuda ninguém.
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
    account = Account.find_by(email: @email)
    return failure("emailNotFound", "email") if account.nil?
    return failure("wrongPassword", "password") unless account.authenticate(@password)

    # Entrar é o único momento garantido em que se toca nas sessões da conta:
    # aproveitamos para varrer as vencidas, em vez de deixá-las acumulando para
    # sempre à espera de um agendador que não existe.
    account.sessions.where(expires_at: ...Time.current).delete_all

    Result.new(session: Session.start!(account, user_agent: @user_agent, ip_address: @ip_address))
  end

  private

  def failure(code, field)
    Result.new(error: Error.new(code: code, field: field))
  end
end
