# Uma conta de um lote de importação do Instagram: uma chamada à Business
# Discovery. A conta pode ter saído do lote (apagado) enquanto esperava.
class ImportReferenceAccountJob < ApplicationJob
  queue_as :default

  def perform(account_id)
    account = ReferenceImportAccount.find_by(id: account_id)
    References::ImportAccount.new(account).call if account&.status == "pending"
  end
end
