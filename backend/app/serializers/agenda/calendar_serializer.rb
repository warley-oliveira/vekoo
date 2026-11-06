module Agenda
  class CalendarSerializer < ApplicationSerializer
    def self.one(calendar)
      {
        id: calendar.id.to_s,
        name: calendar.name,
        description: calendar.description,
        timeZone: calendar.time_zone,
        calendarType: calendar.calendar_type,
        color: calendar.color,
        rebalancingPeriod: calendar.rebalancing_period,
        professionalNotificationsSettings: camelize(calendar.professional_notifications_settings),
        professionalEventNotifications: camelize(calendar.professional_event_notifications),
        professionalEventRules: camelize(calendar.professional_event_rules),
        professionalWhatsappConnectorId: calendar.professional_whatsapp_connector_id,
        schedulingNotificationEnabled: calendar.scheduling_notification_enabled,
        schedulingNotificationConfig: camelize(calendar.scheduling_notification_config),
        schedulingNotificationReactivateAutomation: calendar.scheduling_notification_reactivate_automation,
        schedulingNotificationIgnoreAutomationPaused: calendar.scheduling_notification_ignore_automation_paused,
        attendanceSequences: sequences(calendar),
        googleCalendarAvailable: GoogleClient.configured?,
        googleCalendarConnected: calendar.google_calendar_connected?,
        googleCalendarConnector: google_connector(calendar.google_calendar_connector),
        createdAt: epoch_ms(calendar.created_at),
        updatedAt: epoch_ms(calendar.updated_at)
      }
    end

    def self.sequences(calendar)
      camelize(calendar.attendance_sequences)
    end

    def self.google_connector(connector)
      return nil unless connector

      {
        id: connector.id.to_s,
        type: connector.connector_type,
        status: connector.status_name,
        googleEmail: connector.google_email,
        connectedAt: epoch_ms(connector.connected_at),
        errorMessage: connector.error_message
      }
    end
    private_class_method :google_connector

    def self.camelize(rules)
      Array(rules).map { |rule| rule.to_h.deep_transform_keys { |key| key.to_s.camelize(:lower) } }
    end
    private_class_method :camelize
  end
end
