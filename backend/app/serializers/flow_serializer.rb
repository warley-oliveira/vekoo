class FlowSerializer < ApplicationSerializer
  def self.one(flow)
    {
      id: flow.id,
      name: flow.name,
      description: flow.description,
      status: flow.status,
      triggerType: flow.trigger_type,
      connectorFilter: { connectorIds: flow.connector_ids },
      published: flow.published?,
      updatedAt: epoch_ms(flow.updated_at),
      createdAt: epoch_ms(flow.created_at)
    }
  end

  def self.full(flow)
    one(flow).merge(
      draft: version(flow.draft_version),
      publishedVersion: version(flow.published_version)
    )
  end

  # `definition` sai como está: é mapa livre, com chaves que o editor escreveu.
  def self.version(version)
    return nil unless version

    {
      id: version.id,
      versionNumber: version.version_number,
      definition: version.definition,
      publishedAt: epoch_ms(version.published_at),
      updatedAt: epoch_ms(version.updated_at)
    }
  end
end
