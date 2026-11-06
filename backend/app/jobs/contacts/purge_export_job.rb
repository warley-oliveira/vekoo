module Contacts
  # Apaga o arquivo da exportação depois que o link venceu: é a lista de contatos da organização, e
  # não fica guardada à toa. Só depois do prazo do link, com folga.
  class PurgeExportJob < ApplicationJob
    queue_as :low

    def perform(blob_id)
      Media::Storage.purge(blob_id)
    end
  end
end
