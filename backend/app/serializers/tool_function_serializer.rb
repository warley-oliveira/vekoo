# Uma função da organização. Quem veio de uma ferramenta instalada não mostra o código (`locked`): é o que protege o que o catálogo
# escreveu, e quem quer ver ou mudar usa "personalizar". Na origem, super_user e partner viam tudo; aqui ninguém é um deles.
class ToolFunctionSerializer < ApplicationSerializer
  def self.one(function, tools: nil)
    locked = function.installed?

    {
      id: function.id.to_s,
      name: function.name,
      description: function.description,
      jsCode: locked ? nil : function.js_code,
      parameters: camelized(function.parameters),
      parametersJson: locked ? nil : function.parameters_json,
      toolInstallationId: function.tool_installation_id,
      locked: locked,
      tool: locked ? tool_summary(function, tools) : nil,
      createdAt: epoch_ms(function.created_at),
      updatedAt: epoch_ms(function.updated_at)
    }
  end

  def self.many(functions, tools: nil)
    functions.map { |function| one(function, tools: tools || {}) }
  end

  def self.tool_summary(function, tools)
    tools&.dig(function.tool_installation_id.to_s) || Tools::FunctionListSerializer.preload_tools([ function ])[function.tool_installation_id.to_s]
  end
  private_class_method :tool_summary

  def self.camelized(parameters)
    Array(parameters).map { |item| item.to_h.deep_transform_keys { |key| key.to_s.camelize(:lower) } }
  end
  private_class_method :camelized
end
