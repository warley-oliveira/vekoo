module Funnels
  # Tira das conversas a posição que deixou de existir: o funil inteiro, ou só as etapas apagadas.
  # Quem lê nem depende disto, porque o quadro trata id desconhecido como "Sem etapa". É limpeza, para
  # o mapa não acumular lixo em cada documento: por isso a fila `low`, e a varredura limitada à
  # organização, que é o prefixo do índice.
  class CleanupChatsJob < ApplicationJob
    queue_as :low

    def perform(organization_id, funnel_id, stage_ids = nil)
      key = "funnel_stages.#{funnel_id}"
      condition = stage_ids ? { "$in" => Array(stage_ids).map(&:to_s) } : { "$exists" => true }

      Chat.collection.update_many(
        { organization_id: organization_id.to_s, key => condition },
        { "$unset" => { key => "" } }
      )
    end
  end
end
