# A conexão do ActionCable entra com o mesmo token da API. O WebSocket não
# carrega cabeçalho `Authorization`, então ele vai em `?token=` na URL do
# cable — a única diferença em relação ao `Bearer` do resto.
module ApplicationCable
  class Connection < ActionCable::Connection::Base
    identified_by :current_account, :current_organization

    # A organização é a da sessão (a interna, se staff entrou nela): trocar de
    # organização recarrega a tela e abre outra conexão.
    def connect
      session = find_session || reject_unauthorized_connection
      self.current_account = session.account
      self.current_organization = session.organization
    end

    private

    def find_session
      token = request.params[:token].presence
      return nil unless token

      Session.authenticate(token)
    end
  end
end
