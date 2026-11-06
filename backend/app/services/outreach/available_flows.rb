module Outreach
  # Os fluxos que a tela de campanha oferece em "quem responde". Substitui `available_organizations` da origem, que listava os
  # assistentes: só os publicados, porque é o que `Flows::Dispatch` aceita ao atender quem respondeu.
  module AvailableFlows
    module_function

    # @return [Array<Hash>] { id:, name: }
    def for(organization)
      Flow.published.for_organization(organization.id).order(:name).pluck(:id, :name).map { |id, name| { id: id, name: name } }
    end
  end
end
