module Pipelines
  class SavedFilterSerializer < ApplicationSerializer
    # `definition` é um mapa livre e sai como está: `field` e os demais valores são os tokens da
    # API de filtros (`deal_value`, `stage_id`), e não chaves JSON.
    def self.filter(filter, favorite_ids:, viewer:)
      {
        id: filter.id,
        name: filter.name,
        visibility: filter.visibility,
        definition: filter.definition,
        isPreset: false,
        favorite: favorite_ids.include?(filter.id),
        editable: filter.owned_by?(viewer),
        owner: filter.owner && { id: filter.owner.id, name: filter.owner.name }
      }
    end

    def self.preset(preset, favorite_keys:)
      {
        key: preset[:key],
        nameKey: preset[:name_key],
        section: preset[:section],
        definition: preset[:definition],
        isPreset: true,
        favorite: favorite_keys.include?(preset[:key])
      }
    end
  end
end
