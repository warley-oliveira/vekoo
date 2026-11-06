# Associações da organização com o domínio "pipelines". Ficam aqui, e não em
# Organization, para cada domínio evoluir sem disputar o mesmo arquivo.
module OrganizationRelations
  module Pipelines
    extend ActiveSupport::Concern

    included do
      has_many :pipeline_boards, class_name: "Pipelines::Board", inverse_of: :organization, dependent: :destroy
      has_many :pipeline_labels, class_name: "Pipelines::Label", inverse_of: :organization, dependent: :destroy
    end
  end
end
