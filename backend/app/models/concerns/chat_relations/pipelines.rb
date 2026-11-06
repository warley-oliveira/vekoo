# Associações de `Chat` com o domínio "pipelines". Ficam aqui, e não em Chat, para cada
# domínio evoluir sem disputar o mesmo arquivo.
module ChatRelations
  module Pipelines
    extend ActiveSupport::Concern

    included do
      # O Postgres não sabe da conversa: quem aponta para ela é um texto. Sem isto, o card ficaria com
      # um `hasChat: true` que não leva a lugar nenhum.
      after_destroy :unlink_pipeline_cards
    end

    # Os cards desta conversa, em qualquer quadro da organização.
    def pipeline_cards
      ::Pipelines::Card.where(organization_id: organization_id, chat_id: id.to_s)
    end

    private

    def unlink_pipeline_cards
      pipeline_cards.unscope(:order).update_all(chat_id: nil)
    rescue StandardError => e
      Rails.logger.error("[Chat##{id}] cards da conversa apagada: #{e.class}: #{e.message}")
    end
  end
end
