module Engines
  # Manifesto que não passa na validação: o motor não entra no catálogo e o
  # boot avisa alto — um motor quebrado não pode aparecer como opção na tela.
  class InvalidManifest < StandardError; end
end
