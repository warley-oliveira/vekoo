# Link do front para um vínculo: toda tela da plataforma mora em `/a/<hashid>/...`, e o aviso,
# o push ou o e-mail de uma organização precisam abrir nela, com o vínculo de quem recebe.
#
#   AccountLink.path(account, "/calendar")      # => "/a/k3m9x2qp/calendar"
#   AccountLink.path(account, "https://…")      # => sem mudança
#
# O caminho gravado continua sem o prefixo (`AccountNotice#url` = "/calendar"): o prefixo é de
# quem recebe, e se resolve ao entregar.
module AccountLink
  PREFIX = "/a/".freeze

  module_function

  def path(account, value)
    return value if value.blank? || account.nil? || !value.is_a?(String)
    return value unless value.start_with?("/") && !value.start_with?("//")
    return value if value.start_with?(PREFIX)

    "#{PREFIX}#{account.hashid}#{value}"
  end

  # As ações do aviso (`urlPath`) seguem a mesma regra.
  def actions(account, actions)
    Array(actions).map do |action|
      next action unless action.is_a?(Hash)

      action = action.stringify_keys
      action["urlPath"] = path(account, action["urlPath"]) if action["urlPath"]
      action["url"] = path(account, action["url"]) if action["url"]
      action
    end
  end
end
