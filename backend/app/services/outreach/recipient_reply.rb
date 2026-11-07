module Outreach
  # Quem respondeu à campanha: a primeira mensagem do contato depois do envio. Quem chama é
  # `Chats::InboundFlow`, o caminho de toda mensagem recebida, em qualquer canal.
  #
  # A conversa aponta para o último destinatário que a alcançou (`outreach_recipient_id`, gravado ao
  # despachar), e o ponteiro sai na primeira resposta. Por isso conversa sem campanha não paga consulta
  # nenhuma, e as mensagens seguintes do mesmo contato também não. Quem recebeu duas campanhas responde
  # à última.
  #
  # Melhor esforço, como `MonitorEvents`: receber a mensagem é o trabalho, e um soluço aqui não pode
  # impedir que ela chegue a quem atende.
  module RecipientReply
    # `sending` também: o contato pode responder antes de o envio terminar de gravar.
    REPLIABLE_STATUSES = %w[sending sent delivered read].freeze

    module_function

    def record(chat)
      recipient_id = chat.outreach_recipient_id
      return if recipient_id.blank?

      chat.unset(:outreach_recipient_id)

      recipient = Recipient.where(_id: recipient_id).take
      campaign = recipient && Campaign.scoped(chat.organization_id, recipient.campaign_id)
      return unless campaign

      replied = Recipient.where(_id: recipient.id, :status_cd.in => REPLIABLE_STATUSES, replied_at: nil)
                         .find_one_and_update({ "$set" => { replied_at: Time.current, updated_at: Time.current } }, return_document: :after)
      return unless replied

      Campaign.where(_id: campaign.id).inc(replied_count: 1)
      MonitorEvents.recipient(campaign, replied)
      MonitorEvents.progress(campaign)
    rescue StandardError => e
      Rails.logger.warn("[Outreach::RecipientReply] resposta não registrada na conversa #{chat.id}: #{e.class}: #{e.message}")
    end
  end
end
