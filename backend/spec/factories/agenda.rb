FactoryBot.define do
  factory :agenda_calendar, class: "Agenda::Calendar" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    sequence(:name) { |n| "Clínica #{n}" }
    time_zone { "America/Sao_Paulo" }

    trait :class_group do
      calendar_type { "class_group" }
    end
  end

  factory :agenda_professional, class: "Agenda::Professional" do
    calendar { association(:agenda_calendar) }
    organization_id { calendar.organization_id }
    sequence(:name) { |n| "Profissional #{n}" }

    # Com horários: de segunda a sábado, como `Rule::DEFAULT_DAYS`.
    trait :with_rule do
      after(:create) { |professional| create(:agenda_rule, professional: professional) }
    end
  end

  factory :agenda_rule, class: "Agenda::Rule" do
    professional { association(:agenda_professional) }
    organization_id { professional.organization_id }
  end

  factory :agenda_offering, class: "Agenda::Offering" do
    transient { professionals { [] } }

    calendar { association(:agenda_calendar) }
    organization_id { calendar.organization_id }
    sequence(:name) { |n| "Serviço #{n}" }
    duration { 60 }

    # Divide igualmente entre os profissionais. O serviço exige que a soma dê 100.
    distribution do
      list = professionals.presence || [ association(:agenda_professional, calendar: calendar) ]
      share = 100 / list.size
      list.each_with_index.to_h do |professional, index|
        [ professional.id.to_s, index.zero? ? share + (100 - (share * list.size)) : share ]
      end
    end
  end

  factory :agenda_booking, class: "Agenda::Booking" do
    calendar { association(:agenda_calendar) }
    start { 2.days.from_now.change(usec: 0) }
    add_attribute(:end) { start + 1.hour }
    title { "Consulta" }
  end

  factory :agenda_class_group, class: "Agenda::ClassGroup" do
    calendar { association(:agenda_calendar, :class_group) }
    sequence(:name) { |n| "Turma #{n}" }
    max_students { 10 }
    schedule do
      [
        { "day_of_week" => 1, "enabled" => true, "windows" => [ { "start" => "08:00", "end" => "09:00" } ] },
        { "day_of_week" => 3, "enabled" => true, "windows" => [ { "start" => "08:00", "end" => "09:00" } ] }
      ]
    end
  end

  factory :agenda_class_session, class: "Agenda::ClassSession" do
    class_group { association(:agenda_class_group) }
    start { 2.days.from_now.change(usec: 0) }
    add_attribute(:end) { start + 1.hour }
  end

  factory :agenda_class_enrollment, class: "Agenda::ClassEnrollment" do
    class_group { association(:agenda_class_group) }
    chat { association(:chat, organization_id: class_group.organization_id) }
  end

  factory :agenda_class_attendance, class: "Agenda::ClassAttendance" do
    class_session { association(:agenda_class_session) }
    chat { association(:chat, organization_id: class_session.organization_id) }
    guest { true }
  end

  factory :connector_google_calendar, class: "Connector::GoogleCalendar" do
    transient { organization { nil } }

    organization_id { organization&.id || association(:organization).id }
    status { :active }
    google_calendar_id { "app-calendar@group.calendar.google.com" }
    refresh_token { "refresh-do-google" }
    access_token { "access-do-google" }
    token_expires_at { 1.hour.from_now }
    channel_token { "token-do-canal" }
  end

  factory :scheduled_action do
    chat
    organization_id { chat.organization_id }
    sequence(:token) { |n| "token-#{n}" }
    job_class { "Agenda::ContactNotificationJob" }
    kind { ScheduledAction::BOOKING_REMINDER }
    name { "Lembrete: 1 hora antes" }
    scheduled_at { 1.hour.from_now }
  end
end
