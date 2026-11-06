# O contexto da requisição (ou do job que o restabelece). Em Vekoo o workspace é
# a `Organization` e a pessoa é a `Account`.
class Current < ActiveSupport::CurrentAttributes
  attribute :account, :organization, :session
end
