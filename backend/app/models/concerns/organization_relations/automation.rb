# Associações da organização com o domínio "automation". Ficam aqui, e não em Organization, para cada domínio evoluir sem
# disputar o mesmo arquivo.
#
# As funções, as instalações e os logs vivem no Mongo, por isso são consultas e não `has_many`, e saem com a organização
# por `after_destroy`.
module OrganizationRelations
  module Automation
    extend ActiveSupport::Concern

    included do
      has_many :flows, dependent: :destroy
      has_many :hooks, dependent: :destroy

      after_destroy :destroy_automation_documents
    end

    def tool_functions
      ToolFunction::Base.for_organization(id)
    end

    def tool_installations
      ToolInstallation.for_organization(id)
    end

    def hook_logs
      HookLog.for_organization(id)
    end

    private

    def destroy_automation_documents
      tool_functions.delete_all
      tool_installations.delete_all
      hook_logs.delete_all
    end
  end
end
