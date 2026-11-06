module Agenda
  class OfferingSerializer < ApplicationSerializer
    def self.one(offering)
      {
        id: offering.id.to_s,
        calendarId: offering.calendar_id&.to_s,
        name: offering.name,
        description: offering.description,
        duration: offering.duration,
        bufferBefore: offering.buffer_before,
        bufferAfter: offering.buffer_after,
        timeIncrementInterval: offering.time_increment_interval,
        guestLimit: offering.guest_limit,
        externalId: offering.external_id,
        successMessage: offering.success_message,
        distribution: offering.distribution,
        createdAt: epoch_ms(offering.created_at),
        updatedAt: epoch_ms(offering.updated_at)
      }
    end
  end
end
