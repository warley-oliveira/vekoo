module Products
  # Limpa o que uma importação pode deixar para trás. Recorrente (config/schedule/products.yml).
  #
  #  - A que morreu com o processo (deploy, reinício da máquina): o job que voltar da fila
  #    não recomeça, porque ela já está em `processing`, e sem esta varredura ela ficaria
  #    "em andamento" para sempre, sem poder ser excluída.
  #  - A que foi abandonada na tela de mapeamento: nunca começou, e o arquivo cru ficaria
  #    ocupando o storage.
  class SweepStaleImportsJob < ApplicationJob
    queue_as :low

    def perform
      Import.stale.find_each { |import| fail_interrupted(import) }
      Import.abandoned.find_each(&:destroy!)
    end

    private

    def fail_interrupted(import)
      message = I18n.t("products.imports.interrupted")
      import.mark_failed!(message)
      ProductImportChannel.broadcast_event(
        import.organization_id, "error", { importId: import.id, code: "importInterrupted", message: message }
      )
    end
  end
end
