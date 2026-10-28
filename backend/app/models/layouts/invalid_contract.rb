module Layouts
  # Contrato de layout malformado: derruba o boot com a razão, como o
  # manifesto de motor fazia — layout quebrado não pode chegar em produção.
  class InvalidContract < StandardError; end
end
