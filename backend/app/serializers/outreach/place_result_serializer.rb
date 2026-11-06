module Outreach
  # Um estabelecimento encontrado. No Mongo ficam em snake_case, como a origem guardava.
  class PlaceResultSerializer < ApplicationSerializer
    def self.one(place)
      place.to_h.deep_transform_keys { |key| key.to_s.camelize(:lower) }
    end

    # Um resultado junto da extração de onde veio: é a lista "já encontrados".
    def self.contact(place, extraction)
      one(place).merge(
        extractionId: extraction["_id"].to_s,
        extractionQuery: extraction["search_query"],
        extractionLocation: extraction["location"],
        extractedAt: epoch_ms(extraction["completed_at"])
      )
    end
  end
end
