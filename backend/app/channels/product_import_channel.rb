# Progresso da importação de catálogo. O stream é da organização, e o job publica
# { action: 'progress' | 'completed' | 'error', data: { importId, ... } }: quem assina
# filtra pelo `importId` que recebeu em POST /products/imports.
#
# SOMENTE LEITURA: quem dispara a importação é POST /products/imports/:id/start. Expor
# também uma ação no canal daria duas portas para a mesma coisa.
class ProductImportChannel < ApplicationCable::Channel
  STREAM = "product_imports"

  def self.broadcast_event(organization_id, action, data)
    ActionCable.server.broadcast(organization_stream(organization_id, STREAM), { action: action, data: data })
  end

  def subscribed
    # Mesma regra da API: sem o recurso `catalog`, o progresso também não chega.
    return reject unless current_account.can?(:catalog)

    stream_from organization_stream(STREAM)
  end

  def unsubscribed
    stop_all_streams
  end
end
