class PushDeviceSerializer < ApplicationSerializer
  # Sem as chaves: elas só servem para cifrar a entrega. O `endpoint` vai porque é por
  # ele que o navegador descobre qual das assinaturas é a dele.
  def self.one(device)
    {
      id: device.id,
      endpoint: device.endpoint,
      userAgent: device.user_agent,
      createdAt: epoch_ms(device.created_at)
    }
  end
end
