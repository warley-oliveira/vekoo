# Reprocessa um status do webhook WABA que chegou antes de a mensagem existir no banco.
#
# O envio cria a mensagem sem `message_id` e só grava o wamid depois do retorno da
# Meta, então há uma janela em que o webhook de `sent` chega e não encontra nada. Como o
# webhook responde 2xx incondicionalmente, a Meta nunca reentrega: sem este job o status
# seria perdido em definitivo.
#
# Idempotente: a trava de ordenação de `WabaStatusUpdateService` torna a reexecução
# inócua. O backoff é do próprio service, que reagenda com RETRY_DELAYS e para ao esgotar.
class WabaStatusRetryJob < ApplicationJob
  queue_as :default

  def perform(connector_id, status, phone_number_id, attempt)
    connector = Connector::WhatsappCloud.where(id: connector_id).take
    return Rails.logger.error("[WabaStatusRetryJob] Conector #{connector_id} não encontrado") unless connector

    WabaStatusUpdateService.new(connector, status, phone_number_id, attempt: attempt).call
  end
end
