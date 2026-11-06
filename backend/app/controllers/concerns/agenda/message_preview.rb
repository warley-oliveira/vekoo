module Agenda
  # Simular uma mensagem para um agendamento: nada é enviado nem gravado. O que a pessoa escreveu
  # sai com as variáveis preenchidas, de graça. Com instrução para a IA, passa por `Ai::Run`, que
  # cobra antes e devolve se nada útil sair, e o erro chega à tela com o motivo.
  module MessagePreview
    extend ActiveSupport::Concern

    private

    # Os últimos agendamentos do calendário que têm conversa: os candidatos para simular.
    def booking_candidates
      records = @calendar.bookings.listed.where(:chat_id.ne => nil).order_by(start: :desc).limit(50).to_a
      BookingSerializer::Context.new(records)

      records.map { |booking| BookingSerializer.candidate(booking) }
    end

    def render_preview(tools:, message_ids: nil)
      booking = @calendar.bookings.where(id: params.require(:booking_id)).take
      return render_not_found unless booking

      if booking.chat_id.blank?
        return render_error(status: :unprocessable_entity, code: "bookingWithoutChat", message: t("agenda.sequences.booking_without_chat"))
      end

      composer = MessageComposer.new(
        booking: booking,
        message: params[:message],
        ai_prompt: params[:ai_prompt],
        history: ChatHistory.for(booking.chat, message_ids: message_ids),
        tools: tools,
        preview: true
      )

      render json: { message: composer.ai? ? generate(composer) : composer.template_text.to_s }
    rescue Organization::NoCreditsError
      render_error(status: :unprocessable_entity, code: "noCredits", message: t("credits.no_credits"))
    rescue Ai::Run::Busy
      render_error(status: :conflict, code: "busy", message: t("ai.busy"))
    rescue Ai::Chat::MissingKey, Ai::Chat::Failed => e
      Rails.logger.error("[Agenda::MessagePreview] #{e.message.presence || e.class.name}")
      render_error(status: :service_unavailable, code: "failed", message: t("ai.failed"))
    end

    def generate(composer)
      Ai::Run.new(current_organization, cost: MessageComposer::CREDIT_COST).call do |run|
        text = composer.generate(run.chat)
        raise Ai::Chat::Failed, "resposta vazia" if text.blank?

        run.delivered!
        text
      end
    end
  end
end
