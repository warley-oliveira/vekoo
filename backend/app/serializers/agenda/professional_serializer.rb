module Agenda
  class ProfessionalSerializer < ApplicationSerializer
    # Regras e fotos de uma vez, em vez de uma consulta por profissional.
    def self.many(professionals)
      records = professionals.to_a
      rules = Rule.where(:professional_id.in => records.map(&:id)).index_by(&:professional_id)
      avatars = ProfessionalDirectory.avatars(records)

      records.map { |professional| one(professional, rule: rules[professional.id], avatars: avatars) }
    end

    def self.one(professional, rule: professional.rule, avatars: ProfessionalDirectory.avatars([ professional ]))
      {
        id: professional.id.to_s,
        calendarId: professional.calendar_id&.to_s,
        accountId: professional.account_id,
        name: professional.name,
        email: professional.email,
        phone: professional.phone,
        externalId: professional.external_id,
        color: professional.color,
        avatarUrl: avatars[professional.account_id],
        serviceIds: Array(professional.service_ids).map(&:to_s),
        rule: rule_json(rule),
        createdAt: epoch_ms(professional.created_at),
        updatedAt: epoch_ms(professional.updated_at)
      }
    end

    def self.rule_json(rule)
      return nil unless rule

      {
        id: rule.id.to_s,
        days: days_json(rule.days),
        blockedTimes: Array(rule.blocked_times).map { |blocked| blocked.to_h.slice("start", "end") }
      }
    end
    private_class_method :rule_json

    def self.days_json(days)
      Array(days).map do |day|
        { dayOfWeek: day["day_of_week"], enabled: day["enabled"], windows: Array(day["windows"]).map { |window| window.to_h.slice("start", "end") } }
      end
    end
  end
end
