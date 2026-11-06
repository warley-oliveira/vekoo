# Associações da organização com o domínio "insights". Ficam aqui, e não em
# Organization, para cada domínio evoluir sem disputar o mesmo arquivo.
#
# Dashboards personalizados vivem no Mongo, por isso são consulta e não `has_many`. Os números do
# dashboard (`daily_chat_stats`) são do núcleo: `OrganizationRelations::Connectors`.
module OrganizationRelations
  module Insights
    extend ActiveSupport::Concern

    included do
      has_many :funnels, dependent: :destroy
    end

    def custom_dashboards
      CustomDashboard.for_organization(id)
    end

    # O fuso dos números: dia, hora e dia da semana sempre no da organização.
    def reporting_zone
      agenda_zone
    end
  end
end
