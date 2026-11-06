module Agenda
  # Recorrente, todo dia. Os canais de aviso do Google expiram em até 7 dias: sem renovar, o Google
  # para de avisar e nenhum evento chega. Inclui quem nunca teve canal, que se conserta sozinho aqui
  # (a conexão não falha quando o Google recusa abrir o canal).
  class GoogleCalendarWatchRefreshJob < ApplicationJob
    queue_as :low

    # Folga confortável, rodando todo dia sobre uma validade de 7.
    REFRESH_BEFORE = 2.days

    def perform
      due.each { |connector| ActiveGoogleEventJob.perform_later(connector.id.to_s, connector.organization_id) }
    end

    private

    def due
      Connector::GoogleCalendar.where(status_cd: "active").any_of(
        { watch_expires_at: nil },
        { :watch_expires_at.lte => REFRESH_BEFORE.from_now }
      )
    end
  end
end
