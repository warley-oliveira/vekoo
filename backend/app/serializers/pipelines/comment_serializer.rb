module Pipelines
  class CommentSerializer < ApplicationSerializer
    PRELOADS = [
      { author: PersonPayload.preload },
      :reactions,
      { attachments: { file_attachment: :blob } }
    ].freeze
    # Só um nível de resposta: ver `Comment#reply_to_the_thread`.
    PRELOADS_WITH_REPLIES = (PRELOADS + [ { replies: PRELOADS } ]).freeze

    def self.one(comment, with_replies: false)
      json = {
        id: comment.id,
        cardId: comment.card_id,
        body: comment.body,
        createdAt: epoch_ms(comment.created_at),
        editedAt: epoch_ms(comment.edited_at),
        pinned: comment.pinned,
        parentId: comment.parent_id,
        author: author_payload(comment),
        reactions: grouped_reactions(comment),
        attachments: comment.attachments.map { |attachment| attachment_json(attachment) },
        replyCount: comment.replies.size
      }
      return json unless with_replies

      json.merge(replies: comment.replies.sort_by(&:created_at).map { |reply| one(reply) })
    end

    # Pessoa (`user`), automação (`automation`) ou `null`, se a pessoa foi apagada. A tela decide pelo
    # `type`. O nome da automação sai no idioma de quem lê.
    def self.author_payload(comment)
      if comment.automation_source.present?
        {
          type: "automation",
          source: comment.automation_source,
          name: I18n.t("pipelines.comments.automation_author.#{comment.automation_source}")
        }
      elsif comment.author
        PersonPayload.json(comment.author).merge(type: "user")
      end
    end

    # Sobre o que já está carregado: `group(:emoji).count`, como na origem, é uma consulta por
    # comentário, mais uma por emoji.
    def self.grouped_reactions(comment)
      comment.reactions.group_by(&:emoji).map do |emoji, reactions|
        { emoji: emoji, count: reactions.size, accountIds: reactions.map(&:account_id) }
      end
    end

    def self.attachment_json(attachment)
      {
        id: attachment.id,
        fileName: attachment.file_name,
        contentType: attachment.content_type,
        fileSize: attachment.file_size,
        url: attachment.file_url
      }
    end
  end
end
