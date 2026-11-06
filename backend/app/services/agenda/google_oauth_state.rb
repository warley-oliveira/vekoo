module Agenda
  # O `state` do OAuth do Google. A origem mandava os ids em base64, sem assinatura: qualquer um
  # podia apontar a resposta do Google para o calendário de outra pessoa.
  #
  #   <id do calendário>.<expira em>.<assinatura>
  #
  # O id fica legível porque a tela que recebe o retorno do Google precisa saber para qual calendário
  # chamar `POST /calendars/:id/google-calendar/callback`. A assinatura amarra o calendário à pessoa
  # que pediu a conexão.
  module GoogleOauthState
    TTL = 15.minutes

    module_function

    def generate(calendar, account, now: Time.current)
      expires_at = (now + TTL).to_i

      "#{calendar.id}.#{expires_at}.#{signature(calendar.id, expires_at, account)}"
    end

    def valid?(state, calendar, account, now: Time.current)
      calendar_id, expires_at, signed = state.to_s.split(".", 3)
      return false if signed.blank? || calendar_id != calendar.id.to_s || expires_at.to_i <= now.to_i

      ActiveSupport::SecurityUtils.secure_compare(signed, signature(calendar.id, expires_at, account))
    end

    def signature(calendar_id, expires_at, account)
      OpenSSL::HMAC.hexdigest("SHA256", secret, "#{calendar_id}.#{expires_at}.#{account.id}")
    end

    def secret
      Rails.application.key_generator.generate_key("agenda google oauth state", 32)
    end
  end
end
