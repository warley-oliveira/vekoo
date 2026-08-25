# Criar conta cria a organização, e quem cria entra como dono — é essa
# organização que vai receber as pessoas convidadas mais adiante, e todo
# carrossel nasce dentro dela.
#
# Devolve a sessão já aberta: quem acabou de se cadastrar não deveria precisar
# entrar de novo.
class SignUp
  Result = Struct.new(:session, :error, keyword_init: true) do
    def success? = error.nil?
  end

  # Erro de negócio, com o **campo do formulário** que a tela deve destacar.
  # A organização e a conta têm as duas um atributo `name`; quem vê a tela vê
  # dois campos diferentes ("Seu nome" e "Nome da conta"), então o da
  # organização sai como `organizationName`.
  Error = Struct.new(:code, :field, :details, :message, keyword_init: true)

  FIELD_NAMES = {
    account: { name: "name", email: "email", password: "password" },
    organization: { name: "organizationName" }
  }.freeze

  def initialize(name:, email:, password:, organization_name:, user_agent: nil, ip_address: nil)
    @name = name
    @email = email
    @password = password
    @organization_name = organization_name
    @user_agent = user_agent
    @ip_address = ip_address
  end

  def call
    organization = Organization.new(name: @organization_name)
    account = Account.new(
      organization: organization,
      name: @name,
      email: @email,
      password: @password,
      role: "owner"
    )

    # Os dois `valid?` rodam sempre: a tela mostra tudo que está errado de uma
    # vez, não um campo por tentativa.
    organization_ok = organization.valid?
    account_ok = account.valid?
    return invalid(organization, account) unless organization_ok && account_ok

    session = nil
    Organization.transaction do
      organization.save!
      account.organization = organization
      account.save!
      welcome(organization)
      session = Session.start!(account, user_agent: @user_agent, ip_address: @ip_address)
    end

    Result.new(session: session)
  rescue ActiveRecord::RecordNotUnique
    # Duas pessoas se cadastrando com o mesmo e-mail ao mesmo tempo: quem
    # chegou depois recebe o mesmo recado de e-mail já cadastrado.
    taken_email
  end

  private

  def taken_email
    Result.new(error: Error.new(code: "emailTaken", field: "email"))
  end

  def invalid(organization, account)
    # E-mail repetido tem código próprio — a tela oferece "que tal entrar?".
    return taken_email if account.errors.of_kind?(:email, :taken)

    details = collect(account, :account).merge(collect(organization, :organization))
    full_messages = account.errors.full_messages + organization.errors.full_messages

    Result.new(error: Error.new(
      code: "unprocessable",
      field: details.keys.first,
      details: details,
      message: full_messages.first
    ))
  end

  def collect(record, kind)
    record.errors.group_by(&:attribute).each_with_object({}) do |(attribute, errors), acc|
      field = FIELD_NAMES.dig(kind, attribute)
      acc[field] = errors.map(&:message) if field
    end
  end

  # O primeiro aviso da conta: os créditos grátis já estão lá.
  def welcome(organization)
    organization.notifications.create!(key: "welcome", notified_at: Time.current)
  end
end
