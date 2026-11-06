# O número de destino não tem conta no WhatsApp (Evolution responde 400 com
# `exists: false`). É falha permanente: repetir a chamada não muda o resultado,
# então `Providers::Base.with_retry` não refaz a tentativa.
class WhatsappNumberNotFoundError < StandardError
  def initialize(msg = "Número não existe no WhatsApp")
    super
  end
end
