module Inbound
  # POST /inbound/google-calendar/:id
  #
  # O aviso do Google é só um "mudou algo": responde 2xx e deixa a leitura para o job. O token que
  # combinamos ao abrir o canal volta em todo aviso, e é o que impede qualquer um de disparar
  # sincronizações sabendo o id do conector.
  class GoogleCalendarController < BaseController
    def event
      connector = Connector::GoogleCalendar.where(id: params[:id]).take
      return head(:ok) unless connector&.active?
      return render_error(status: :forbidden, code: "invalidSignature") unless connector.valid_channel_token?(request.headers["X-Goog-Channel-Token"])

      # "sync" é o aviso de que o canal abriu, sem mudança nenhuma.
      return head(:ok) if request.headers["X-Goog-Resource-State"] == "sync"

      Agenda::GoogleCalendarSyncJob.perform_later(connector.id.to_s, connector.organization_id)
      head :ok
    end
  end
end
