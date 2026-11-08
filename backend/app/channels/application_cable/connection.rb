module ApplicationCable
  # Autenticado pelo mesmo token da sessão, mais o vínculo da aba (`account`, o hashid que a API
  # recebe em `X-Account`). Vão na query porque o navegador não deixa enviar cabeçalho no
  # WebSocket; `token` já é filtrado dos logs.
  #
  # Uma conexão é de um vínculo: a aba que troca de organização troca de conexão. Assim todo
  # canal continua lendo `current_account`, cada assinatura fica presa à organização dele, e
  # revogar o vínculo derruba exatamente as abas daquela organização.
  class Connection < ActionCable::Connection::Base
    identified_by :current_account

    def connect
      session = Session.authenticate(request.params[:token])
      reject_unauthorized_connection unless session

      account = resolve_account(session.user, request.params[:account].to_s.strip.presence)
      reject_unauthorized_connection unless account&.usable_by?(session.user)

      self.current_account = account
    end

    def current_user
      current_account.user
    end

    private

    # Mesma regra da API: sem o hashid, só o único vínculo ativo da pessoa.
    def resolve_account(user, hashid)
      return Account.find_by_hashid_for(user, hashid) if hashid

      candidates = user.memberships.limit(2).to_a
      candidates.first if candidates.one?
    end
  end
end
