module Hooks
  # Uma ação de webhook não conseguiu rodar por um motivo que a pessoa consegue resolver. A mensagem já vem traduzida:
  # é o que vai para o log e para o alerta.
  class ActionFailed < StandardError; end
end
