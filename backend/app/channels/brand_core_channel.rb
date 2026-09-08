# Avisos sobre o Brandcore da organização: salvou, publicou, mudou um ativo.
# Quem está com a marca aberta em outra aba (ou outra pessoa da organização)
# recebe o evento e recarrega pelo SWR — o canal não carrega documento.
class BrandCoreChannel < ApplicationCable::Channel
  def subscribed
    stream_for current_account.organization
  end
end
