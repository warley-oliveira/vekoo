module Agenda
  # O lembrete de agendamento para o contato, configurado no calendário. Sai pelo canal da conversa
  # antes do início. A origem também tinha um job que lia a regra do assistente; sem assistente, é
  # este o único.
  #
  # Sem nova tentativa: quando o envio falha, a mensagem já ficou `failed` no chat, com a causa, e
  # repetir um lembrete minutos depois vale menos do que não duplicá-lo.
  class ContactNotificationJob < ApplicationJob
    queue_as :default
    sidekiq_options retry: false

    # Dois lembretes na mesma conversa no mesmo minuto viram um só (agendamentos em sequência da
    # mesma pessoa, por exemplo).
    DEDUP_WINDOW = 1.minute

    def perform(booking_id, organization_id, config_index, token)
      @action = ScheduledAction.pending.where(organization_id: organization_id.to_s, token: token).take
      return log_abort("cancelado, reagendado ou já executado") unless @action

      @booking = Booking.scoped(organization_id, booking_id)
      @calendar = @booking&.calendar
      @chat = @booking&.chat
      @rule = Array(@calendar&.scheduling_notification_config)[config_index]

      # O evento pode ter sido adiado depois de enfileirar: agenda de novo em vez de sair cedo.
      return reschedule if due_later?
      return unless @action.claim!

      ScheduledAction.broadcast_for(@chat) if @chat
      dispatch if dispatchable?
    end

    private

    def due_later?
      return false unless @booking&.active? && @rule

      Time.current < correct_run_at
    end

    def correct_run_at
      @booking.start - @booking.interval(@rule["period"], @rule["interval"])
    end

    def reschedule
      run_at = correct_run_at
      @action.reschedule!(run_at)
      self.class.set(wait_until: run_at).perform_later(*arguments)
      ScheduledAction.broadcast_for(@chat) if @chat
      Rails.logger.info("[Agenda::ContactNotificationJob] evento movido: lembrete para #{run_at}")
    end

    def dispatchable?
      return log_abort("agendamento não existe mais ou não está ativo") unless @booking&.active?
      return log_abort("lembretes desligados no calendário") unless @calendar.scheduling_notification_enabled
      return log_abort("regra removida do calendário") if @rule.blank?
      return log_abort("agendamento sem conversa") if @chat.blank?
      return log_abort("conversa sem canal") if @chat.connector.blank?
      return false unless automation_allows_dispatch?
      return log_abort("já houve lembrete nesta conversa agora há pouco") unless first_in_window?

      true
    end

    # Por padrão só sai com a automação ligada na organização e na conversa: uma conversa que uma
    # pessoa assumiu não recebe mensagem sozinha. O calendário tem dois escapes:
    #
    #   1. `reactivate_automation` religa antes de testar, e os fluxos voltam a tratar a resposta;
    #   2. `ignore_automation_paused` só libera este envio, sem religar nada.
    def automation_allows_dispatch?
      @chat.update(automation_enabled: true) if @calendar.scheduling_notification_reactivate_automation

      return true if @calendar.scheduling_notification_ignore_automation_paused
      return true if @calendar.organization.automation_enabled? && @chat.automation_enabled

      log_abort("automação desligada")
    end

    def first_in_window?
      Rails.cache.write("agenda.reminder.#{@chat.id}", true, unless_exist: true, expires_in: DEDUP_WINDOW)
    end

    def dispatch
      composition = MessageComposer.new(
        booking: @booking,
        chat: @chat,
        message: @rule["message"],
        ai_prompt: @rule["ai_prompt"],
        fallback_key: "agenda.reminders.default_message"
      ).call

      record_fallback(composition.fallback_reason)
      return log_abort("sem texto para enviar") if composition.text.blank?

      ChatDispatch.call(
        chat: @chat,
        text: composition.text,
        sender_name: I18n.t("agenda.senders.contact_reminder", organization: @calendar.organization.name, locale: :"pt-BR"),
        generated: composition.generated
      )
    end

    def record_fallback(reason)
      @action.update(metadata: @action.metadata.merge("fallback_reason" => reason.to_s)) if reason
    end

    def log_abort(reason)
      Rails.logger.info("[Agenda::ContactNotificationJob] abortado: #{reason}")
      false
    end
  end
end
