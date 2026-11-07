class ToolSerializer < ApplicationSerializer
  def self.one(tool)
    {
      id: tool.id.to_s,
      name: tool.name,
      slug: tool.slug,
      description: tool.description,
      imageUrl: tool.image_url,
      icon: tool.icon,
      color: tool.color,
      category: tool.category,
      active: tool.active,
      credentialsSchema: camelized(tool.credentials_schema),
      requiresCredentials: tool.requires_credentials?,
      functionCount: Array(tool.function_templates).size
    }
  end

  # Sem o código: a tela do catálogo só mostra nome, descrição e parâmetros, e a função instalada vem travada
  # (`locked`). Quem quer o código usa "personalizar".
  def self.full(tool)
    one(tool).merge(functionTemplates: camelized(Array(tool.function_templates).map { |template| template.to_h.except("js_code") }))
  end

  def self.camelized(list)
    Array(list).map { |item| item.to_h.deep_transform_keys { |key| key.to_s.camelize(:lower) } }
  end
  private_class_method :camelized
end
