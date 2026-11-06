module Products
  # Encerra importações que morreram com o processo (deploy, reinício da máquina). O job
  # que voltar da fila não recomeça, porque a importação já está em `processing`, e sem
  # esta varredura ela ficaria "em andamento" para sempre e não daria para excluí-la.
  # Recorrente (config/schedule/products.yml).
  class SweepStaleImportsJob < ApplicationJob
    queue_as :low

    def perform
      Import.stale.find_each do |import|
        message = I18n.t("products.imports.interrupted")
        import.mark_failed!(message)
        ProductImportChannel.broadcast_event(
          import.organization_id, "error", { importId: import.id, code: "importInterrupted", message: message }
        )
      end
    end
  end
end
