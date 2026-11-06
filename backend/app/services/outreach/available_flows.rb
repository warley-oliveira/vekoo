module Outreach
  # Os fluxos que a tela de campanha oferece em "quem responde". Substitui `available_organizations`
  # da origem, que listava os assistentes.
  #
  # `Flow` é do domínio automation, que ainda não existe aqui. Ele preenche este método, mantendo
  # a forma { id:, name: }; até lá a lista é vazia, e a campanha funciona sem fluxo.
  module AvailableFlows
    module_function

    # @return [Array<Hash>] { id:, name: }
    def for(_organization)
      []
    end
  end
end
