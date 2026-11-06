module Pipelines
  # O histórico de execução dos gatilhos é uma linha por evento, e um quadro movimentado gera milhares
  # por mês. A tela só mostra as mais recentes: o resto sai depois de `TriggerExecution::RETENTION`.
  class PurgeTriggerExecutionsJob < ApplicationJob
    queue_as :low
    sidekiq_options retry: false

    BATCH_SIZE = 1_000

    def perform
      TriggerExecution.where("executed_at < ?", TriggerExecution::RETENTION.ago).in_batches(of: BATCH_SIZE).delete_all
    end
  end
end
