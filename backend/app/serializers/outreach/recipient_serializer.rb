module Outreach
  class RecipientSerializer < ApplicationSerializer
    def self.one(recipient)
      {
        id: recipient.id.to_s,
        contactName: recipient.name,
        phoneNumber: recipient.phone,
        status: recipient.status_cd,
        chatId: recipient.chat_id,
        sentAt: epoch_ms(recipient.sent_at),
        deliveredAt: epoch_ms(recipient.delivered_at),
        readAt: epoch_ms(recipient.read_at),
        repliedAt: epoch_ms(recipient.replied_at),
        errorCode: recipient.error_code,
        errorMessage: error_message(recipient)
      }
    end

    # O que o canal disse, ou o motivo traduzido no idioma de quem lê. O job que falhou não tem idioma.
    def self.error_message(recipient)
      return recipient.error_message if recipient.error_message.present?
      return nil if recipient.error_code.blank?

      I18n.t("outreach.recipient_errors.#{recipient.error_code.underscore}", default: I18n.t("outreach.recipient_errors.whatsapp_error"))
    end
    private_class_method :error_message
  end
end
