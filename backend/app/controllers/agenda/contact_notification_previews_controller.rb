module Agenda
  # O teste dos lembretes ao contato: mostra o que uma regra enviaria, sem enviar.
  class ContactNotificationPreviewsController < BaseController
    include MessagePreview

    before_action :set_calendar

    def bookings
      render json: { bookings: booking_candidates }
    end

    # `messageIds` define o histórico: sem o campo, o normal; com `[]`, nenhum.
    def create
      render_preview(tools: false, message_ids: params.key?(:message_ids) ? Array(params[:message_ids]).map(&:to_s) : nil)
    end
  end
end
