# Associações de `Chat` com o domínio "inbox". Ficam aqui, e não em Chat, para cada
# domínio evoluir sem disputar o mesmo arquivo.
module ChatRelations
  module Inbox
    extend ActiveSupport::Concern

    included do
    end
  end
end
