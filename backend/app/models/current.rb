# O contexto da requisição (ou do job que o restabelece). A pessoa é o `User` da sessão; o
# vínculo dela com a organização desta aba é a `Account` (cabeçalho `X-Account`), e a
# organização vem dele.
class Current < ActiveSupport::CurrentAttributes
  attribute :user, :account, :organization, :session
end
