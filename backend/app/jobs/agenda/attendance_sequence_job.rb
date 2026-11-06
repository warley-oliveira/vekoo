module Agenda
  # Um passo de uma sequência de comparecimento: anota no histórico, confere se ainda faz sentido e
  # envia pelo canal da conversa.
  class AttendanceSequenceJob < ApplicationJob
    queue_as :default
    # Um passo com parte já enviada, repetido, chegaria duplicado. A falha fica visível no chat.
    sidekiq_options retry: false

    def perform(booking_id, organization_id, sequence_id, step_id, token)
      @booking = Booking.scoped(organization_id, booking_id)
      return log_abort("agendamento não existe mais") unless @booking
      # Reinscreveu, cancelou a inscrição ou a sequência acabou: este passo não vale mais.
      return log_abort("token vencido") unless @booking.sequence_token == token
      return log_abort("agendamento não está ativo") unless @booking.active?

      @chat = @booking.chat
      return log_abort("agendamento sem conversa") if @chat.blank?

      @sequence = @booking.calendar.attendance_sequence(sequence_id)
      return log_abort("sequência removida") if @sequence.blank?

      steps = Array(@sequence["steps"])
      step_index = steps.index { |item| item["id"].to_s == step_id.to_s }
      return log_abort("passo removido") if step_index.nil?

      run_step(steps[step_index], step_index)
    end

    private

    def run_step(step, step_index)
      create_notation(step, step_index)

      if replied_since_enrollment?
        exit_notation("agenda.sequences.exit_replied")
        return stop_sequence
      end

      @chat.update(automation_enabled: true) if @sequence["reactivate_automation"]

      unless @sequence["ignore_automation_paused"] || automation_on?
        exit_notation("agenda.sequences.exit_automation_off")
        return
      end

      dispatch(step)
    end

    def automation_on?
      @chat.automation_enabled && @booking.calendar.organization.automation_enabled?
    end

    def replied_since_enrollment?
      return false unless @sequence["stop_on_reply"] && @booking.sequence_enrolled_at

      ChatMessage::Base.unscoped.where(chat_id: @chat.id, role: "user", :created_at.gt => @booking.sequence_enrolled_at).exists?
    end

    # Os passos seguintes chegam e não fazem nada.
    def stop_sequence
      @booking.set(sequence_token: nil)
    end

    def dispatch(step)
      return log_abort("conversa sem canal") if @chat.connector.blank?

      composition = MessageComposer.new(
        booking: @booking, chat: @chat, message: step["message"], ai_prompt: step["ai_prompt"], tools: true
      ).call
      return log_abort("sem texto para enviar (#{composition.fallback_reason})") if composition.text.blank?

      ChatDispatch.call(
        chat: @chat,
        text: composition.text,
        sender_name: I18n.t("agenda.senders.sequence", organization: @booking.calendar.organization.name, locale: :"pt-BR"),
        generated: composition.generated
      )
    end

    def create_notation(step, step_index)
      ChatMessage::Text.create(
        role: "base",
        content: step["name"].presence || step["message"].presence || step["ai_prompt"],
        context_message: { sequence_name: @sequence["name"], step_index: step_index + 1, trigger: @sequence["trigger"] },
        role_base_type: "sequence-notation",
        chat: @chat
      )
    end

    def exit_notation(key)
      ChatMessage::Text.create(
        role: "base", content: I18n.t(key, locale: :"pt-BR"), role_base_type: "sequence-exit-notation", chat: @chat
      )
    end

    def log_abort(reason)
      Rails.logger.info("[Agenda::AttendanceSequenceJob] abortado: #{reason}")
      nil
    end
  end
end
