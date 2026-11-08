module ApiHelpers
  def json
    JSON.parse(response.body)
  end

  # A sessão é da pessoa (`User`); o vínculo da aba vai em `X-Account`, como o front manda.
  # Recebe o vínculo (o caso comum: "entrar como esta pessoa nesta organização") ou a pessoa, sem
  # organização escolhida.
  def auth_headers(account_or_user, account: nil)
    user = account_or_user.is_a?(Account) ? account_or_user.user : account_or_user
    account ||= account_or_user if account_or_user.is_a?(Account)
    session = Session.start!(user)
    headers = { "Authorization" => "Bearer #{session.token}" }
    headers["X-Account"] = account.hashid if account
    headers
  end
end

RSpec.configure do |config|
  config.include ApiHelpers, type: :request
end
