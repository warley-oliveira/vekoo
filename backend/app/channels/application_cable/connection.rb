# A conexão do ActionCable entra com o mesmo token da API. O WebSocket não
# carrega cabeçalho `Authorization`, então ele vai em `?token=` na URL do
# cable — a única diferença em relação ao `Bearer` do resto.
module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_account

    def connect
      self.current_account = find_account || reject_unauthorized_connection
    end

    private

    def find_account
      token = request.params[:token].presence
      return nil unless token

      Session.authenticate(token)&.account
    end
  end
end
