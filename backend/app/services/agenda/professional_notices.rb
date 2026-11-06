module Agenda
  # Os avisos ao profissional na plataforma (sino e push). Criar um `AccountNotice` já transmite e
  # dispara o push, então não há nada para chamar à mão. O texto sai no idioma da pessoa.
  #
  # Aviso nunca derruba quem o pediu: a falha fica no log.
  module ProfessionalNotices
    CALENDAR_PATH = "/calendar".freeze

    module_function

    def created(booking)
      deliver(booking, title: "agenda.notices.created_title") do |at|
        contact = booking.user_name.to_s
        if booking.service
          I18n.t("agenda.notices.created_with_service", service: booking.service.name, contact: contact, at: at)
        else
          I18n.t("agenda.notices.created", contact: contact, at: at)
        end
      end
    end

    def canceled(booking)
      deliver(booking, title: "agenda.notices.canceled_title") do |at|
        I18n.t("agenda.notices.canceled", contact: booking.user_name.to_s, at: at)
      end
    end

    def reminder(booking, message)
      deliver(booking, title: "agenda.notices.reminder_title") { message }
    end

    def deliver(booking, title:)
      account = booking.professional&.notice_account
      return unless account

      I18n.with_locale(account.locale.presence || I18n.default_locale) do
        AccountNotice.create!(
          account_id: account.id,
          organization_id: booking.organization_id,
          title: I18n.t(title),
          description: yield(formatted_start(booking)),
          url: CALENDAR_PATH,
          category: "calendar",
          actions: [
            { action: "navigate", title: I18n.t("agenda.notices.open_calendar"), urlPath: CALENDAR_PATH },
            { action: "dismiss", title: I18n.t("agenda.notices.dismiss") }
          ]
        )
      end
    rescue StandardError => e
      Rails.logger.error("[Agenda::ProfessionalNotices] #{e.class}: #{e.message}")
      nil
    end

    def formatted_start(booking)
      start_at = booking.local_start
      I18n.l(start_at, format: :short)
    end
  end
end
