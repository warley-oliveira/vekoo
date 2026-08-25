# Atalhos das specs de request: abrir sessão e ler o corpo JSON.
module ApiHelpers
  def json
    JSON.parse(response.body)
  end

  # Cabeçalho de uma sessão de verdade — as specs entram como a API manda.
  def auth_headers(account)
    session = Session.start!(account)
    { "Authorization" => "Bearer #{session.token}" }
  end
end

RSpec.configure do |config|
  config.include ApiHelpers, type: :request
end
