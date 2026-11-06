module Outreach
  class ActivityLogSerializer < ApplicationSerializer
    def self.one(log)
      {
        id: log.id.to_s,
        action: log.action,
        accountId: log.account_id,
        occurredAt: epoch_ms(log.created_at),
        details: details(log),
        # O mesmo dado da frase, para a tela formatar do jeito dela.
        metadata: log.metadata.to_h.transform_keys { |key| key.to_s.camelize(:lower) }
      }
    end

    # A frase pronta, no idioma de quem lê.
    def self.details(log)
      metadata = log.metadata.to_h

      case log.action
      when "scheduled" then scheduled_details(metadata)
      when "paused" then translated("paused_#{metadata['reason'].underscore}") if metadata["reason"]
      when "launch_failed" then translated("launch_failed", reason: I18n.t("errors.#{metadata['code'].to_s.underscore}", default: metadata["code"].to_s))
      when "channel_stopped" then translated("channel_stopped_#{metadata['reason'].to_s.underscore}")
      when "channel_resumed" then translated("channel_resumed")
      end
    end
    private_class_method :details

    def self.scheduled_details(metadata)
      return nil if metadata["scheduled_at"].blank?

      zone = ActiveSupport::TimeZone[metadata["timezone"].to_s] || Time.zone
      at = zone.at(metadata["scheduled_at"] / 1000.0)
      translated("scheduled", at: at.strftime(I18n.t("outreach.activity.time_format")))
    end
    private_class_method :scheduled_details

    def self.translated(key, **options)
      I18n.t("outreach.activity.#{key}", **options, default: "").presence
    end
    private_class_method :translated
  end
end
