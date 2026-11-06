module Outreach
  class PlaceExtractionSerializer < ApplicationSerializer
    def self.one(extraction)
      creator = extraction.created_by

      event(extraction).merge(
        maxPlaces: extraction.max_places,
        language: extraction.language,
        filters: extraction.filters.to_h.transform_keys { |key| key.to_s.camelize(:lower) },
        startedAt: epoch_ms(extraction.started_at),
        createdAt: epoch_ms(extraction.created_at),
        createdBy: { id: creator&.id, name: creator&.name }
      )
    end

    # O que vai por `PlaceExtractionChannel`.
    def self.event(extraction)
      {
        id: extraction.id.to_s,
        status: extraction.status,
        searchQuery: extraction.search_query,
        location: extraction.location,
        resultsCount: extraction.results_count,
        errorCode: extraction.error_code,
        errorMessage: error_message(extraction),
        durationSeconds: extraction.duration_seconds,
        completedAt: epoch_ms(extraction.completed_at)
      }
    end

    def self.error_message(extraction)
      return extraction.error_message if extraction.error_message.present?
      return nil if extraction.error_code.blank?

      I18n.t("errors.#{extraction.error_code.underscore}", default: I18n.t("errors.apify_failed"))
    end
    private_class_method :error_message
  end
end
