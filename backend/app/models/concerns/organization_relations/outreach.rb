# Associações da organização com o domínio "outreach". Ficam aqui, e não em
# Organization, para cada domínio evoluir sem disputar o mesmo arquivo.
#
# Campanhas e extrações vivem no Mongo, por isso são consultas e não `has_many`.
#
# `::Outreach::` com o prefixo: dentro deste módulo, `Outreach` seria ele mesmo.
module OrganizationRelations
  module Outreach
    extend ActiveSupport::Concern

    def campaigns
      ::Outreach::Campaign.for_organization(id)
    end

    def place_extractions
      ::Outreach::PlaceExtraction.for_organization(id)
    end
  end
end
