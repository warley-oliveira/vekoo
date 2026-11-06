# Associações de `Chat` com o domínio "outreach". Ficam aqui, e não em Chat, para cada
# domínio evoluir sem disputar o mesmo arquivo.
module ChatRelations
  module Outreach
    extend ActiveSupport::Concern

    included do
      # O fluxo que deve responder a esta conversa, escolhido na campanha que a alcançou. Na
      # origem a campanha trocava o assistente da conversa. Quem lê é `Flows::InboundDispatcher`,
      # sempre conferindo a organização: é um id guardado, sem garantia de ainda existir.
      field :outreach_flow_id, type: String
    end
  end
end
