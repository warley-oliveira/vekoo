module Outreach
  # Resolve quem ficou em `sending` porque o worker morreu no meio do envio.
  #
  # A regra é não mandar duas vezes. Só volta para a fila quem comprovadamente não saiu; na dúvida,
  # o destinatário fica como falho e a tela diz que foi interrompido. A origem devolvia todo mundo
  # para `pending`, e quem tinha recebido recebia de novo.
  class StuckRecipients
    THRESHOLD = 15.minutes
    # Por execução. O que sobrar fica para a próxima, dez minutos depois.
    LIMIT = 1_000
    INTERRUPTED = "interrupted".freeze

    def call
      Recipient.where(status_cd: "sending", :claimed_at.lt => THRESHOLD.ago).limit(LIMIT).each do |recipient|
        resolve(recipient)
      rescue StandardError => e
        Rails.logger.error("[Outreach::StuckRecipients] #{recipient.id}: #{e.class}: #{e.message}")
      end
    end

    private

    def resolve(recipient)
      recipient.dispatched_at.nil? ? release(recipient) : settle_in_doubt(recipient)
    end

    # Nada saiu. O filtro repete `dispatched_at: nil`: se o envio estava só lento e marcou agora,
    # fica como está.
    def release(recipient)
      cancelled = recipient.campaign&.cancelled?

      Recipient.where(_id: recipient.id, status_cd: "sending", claim_token: recipient.claim_token, dispatched_at: nil)
               .find_one_and_update(
                 {
                   "$set" => { status_cd: cancelled ? "skipped" : "pending", updated_at: Time.current },
                   "$unset" => { claim_token: true, claimed_at: true }
                 }
               )
    end

    # Pode ter saído: o histórico da conversa é a única testemunha.
    def settle_in_doubt(recipient)
      message = message_of(recipient)

      if message&.message_id.present?
        recipient.finish_sent!(message.message_id)
      elsif message&.status == "failed"
        recipient.finish_failed!(SendRecipientService::WHATSAPP_ERROR, detail: message.status_message)
      else
        recipient.finish_failed!(INTERRUPTED)
      end

      campaign = recipient.campaign
      return unless campaign

      MonitorEvents.recipient(campaign, recipient)
      MonitorEvents.progress(campaign)
    end

    # Sempre pela conversa: nunca buscar mensagem só por outro campo.
    def message_of(recipient)
      return nil if recipient.chat_id.blank?

      ChatMessage::Base.unscoped.where(chat_id: recipient.chat_id, campaign_id: recipient.campaign_id.to_s).take
    end
  end
end
