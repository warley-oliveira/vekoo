# Uma linha do histórico: número, quando, quem e o que mudou. O snapshot não
# sai na lista — é grande e a tela só o pede quando for restaurar (etapa
# futura).
class BrandCoreVersionSerializer < ApplicationSerializer
  def self.one(version)
    account = version.account
    {
      id: version.id,
      number: version.number,
      createdAt: epoch_ms(version.created_at),
      account: account && { id: account.id, name: account.name },
      changes: version.change_list,
      changedSections: version.change_list.map { |change| change["section"] }.uniq
    }
  end
end
