module ApplicationCable
  # Autenticado pelo mesmo token da sessão. Vai na query porque o navegador não
  # deixa enviar cabeçalho no WebSocket; `token` já é filtrado dos logs.
  class Connection < ActionCable::Connection::Base
    identified_by :current_account

    def connect
      session = Session.authenticate(request.params[:token])
      reject_unauthorized_connection unless session

      self.current_account = session.account
    end
  end
end
