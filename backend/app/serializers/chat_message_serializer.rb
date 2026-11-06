# A mensagem como a tela recebe, na lista e em `ChatChannel`.
#
# `mediaUrl` pode ser um caminho (`/rails/active_storage/...`, mídia guardada aqui) ou uma
# URL absoluta (mídia que já veio de fora): a tela prefixa o caminho com a URL da API.
#
# O agrupamento de mídias em grade é da tela, a partir destes campos: mídias consecutivas
# sem legenda, do mesmo `role` e `senderName`, com `createdAt` a até 2 minutos.
class ChatMessageSerializer < ApplicationSerializer
  def self.one(message)
    {
      id: message.id.to_s,
      chatId: message.chat_id.to_s,
      role: message.role,
      roleBaseType: message.role_base_type,
      typeElement: message.type_element,
      content: message.content,
      caption: message.try(:caption),
      mediaType: message.try(:media_type),
      mediaUrl: message.try(:media_url),
      audioUrl: message.try(:audio_url),
      mediaProperties: message.try(:media_properties),
      messageId: message.message_id,
      messageOrigin: message.message_origin,
      senderName: message.sender_name,
      accountId: message.account_id,
      status: message.status,
      statusMessage: message.status_message,
      replyToMessageId: message.reply_to_message_id,
      reactions: reactions(message),
      contextMessage: message.context_message,
      externalAdReply: camelize_keys(message.external_ad_reply),
      hasSpan: message.has_span,
      isSpan: message.is_span,
      missingMessage: message.missing_message,
      campaignId: message.campaign_id,
      deletedAt: epoch_ms(message.deleted_at),
      deletedScope: message.deleted_scope,
      createdAt: epoch_ms(message.created_at)
    }
  end

  def self.reactions(message)
    Array(message.reactions).map do |reaction|
      entry = reaction.to_h.with_indifferent_access
      {
        emoji: entry[:emoji],
        from: entry[:from],
        senderName: entry[:sender_name],
        accountId: entry[:account_id],
        reactedAt: epoch_ms(entry[:reacted_at])
      }.compact
    end
  end

  def self.camelize_keys(hash)
    hash&.deep_transform_keys { |key| key.to_s.camelize(:lower) }
  end
end
