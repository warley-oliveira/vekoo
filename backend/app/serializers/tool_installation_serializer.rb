# As credenciais nunca saem daqui: só se existem.
class ToolInstallationSerializer < ApplicationSerializer
  def self.one(installation)
    tool = installation.tool

    {
      id: installation.id.to_s,
      toolId: installation.tool_id,
      enabled: installation.enabled,
      hasCredentials: installation.credentials?,
      toolFunctionIds: installation.tool_function_ids,
      createdAt: epoch_ms(installation.created_at),
      updatedAt: epoch_ms(installation.updated_at),
      tool: tool && ToolSerializer.one(tool).slice(:id, :name, :slug, :description, :imageUrl, :icon, :color, :category, :credentialsSchema)
    }
  end
end
