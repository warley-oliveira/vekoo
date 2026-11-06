module ToolFunction
  # Uma função que um bloco de fluxo pode executar (origem: FunctionAction).
  class Base
    include Mongoid::Document
    include Mongoid::Timestamps

    store_in collection: "tool_functions"

    field :name, type: String
    field :description, type: String
    field :organization_id, type: String

    index({ organization_id: 1, _type: 1 })

    scope :for_organization, ->(organization_id) { where(organization_id: organization_id.to_s) }

    def self.scoped(organization_id, id)
      for_organization(organization_id).where(id: id).take
    end
  end
end
