module Pipelines
  class Comment < ApplicationRecord
    MAX_BODY_LENGTH = 20_000
    # De onde vem o comentário que não foi uma pessoa que escreveu. Na origem, o autor nesse caso era
    # o assistente da conversa: com ele fora, o comentário assina como a automação.
    AUTOMATION_SOURCES = %w[script flow].freeze

    belongs_to :card, class_name: "Pipelines::Card", inverse_of: :comments
    belongs_to :author, class_name: "Account", foreign_key: :account_id, optional: true
    belongs_to :parent, class_name: "Pipelines::Comment", optional: true, inverse_of: :replies
    has_many :replies, class_name: "Pipelines::Comment", foreign_key: :parent_id, inverse_of: :parent, dependent: :destroy
    has_many :reactions, class_name: "Pipelines::CommentReaction", foreign_key: :pipeline_comment_id, inverse_of: :comment,
      dependent: :destroy
    has_many :attachments, class_name: "Pipelines::CommentAttachment", foreign_key: :pipeline_comment_id,
      inverse_of: :comment, dependent: :destroy

    validates :body, presence: true, length: { maximum: MAX_BODY_LENGTH }
    validates :automation_source, inclusion: { in: AUTOMATION_SOURCES }, allow_nil: true
    validate :exactly_one_author, on: :create
    validate :parent_is_in_the_same_card, if: :parent_id_changed?

    before_validation :reply_to_the_thread, if: :parent_id_changed?

    scope :roots, -> { where(parent_id: nil) }
    scope :pinned_first, -> { order(pinned: :desc, created_at: :asc) }
    scope :chronological, -> { order(created_at: :asc) }

    after_create_commit :broadcast_comment_created, :log_comment_activity
    after_update_commit :broadcast_comment_updated
    before_destroy :capture_comment_destroy_data
    after_destroy_commit :broadcast_comment_destroyed

    # Reação não é edição do comentário, mas quem está com o card aberto precisa ver.
    def broadcast_reactions_changed
      broadcast_comment_updated
    end

    private

    # Só no nascimento: a pessoa apagada deixa o comentário sem autor, e isso não pode impedir de
    # fixá-lo depois.
    def exactly_one_author
      has_account = account_id.present?
      has_automation = automation_source.present?

      errors.add(:base, :no_author) unless has_account || has_automation
      errors.add(:base, :two_authors) if has_account && has_automation
    end

    # Um nível só de resposta: responder a uma resposta entra na mesma conversa. A origem aceitava
    # qualquer profundidade, e cada nível custava outra consulta por comentário ao montar a lista.
    def reply_to_the_thread
      self.parent_id = parent.parent_id if parent&.parent_id.present?
    end

    def parent_is_in_the_same_card
      return if parent_id.blank?

      errors.add(:parent_id, :invalid) unless parent && parent.card_id == card_id
    end

    def capture_comment_destroy_data
      @destroyed_comment_data = { id: id, card_id: card_id, board: card&.board, assignee_id: card&.assigned_to_id }
    end

    def log_comment_activity
      details = { comment_id: id, body: body.truncate(100) }
      details[:source] = automation_source if automation_source

      card.activities.create!(action: "commented", details: details, account_id: account_id)
    rescue StandardError => e
      Rails.logger.error("[Pipelines::Comment] atividade: #{e.class}: #{e.message}")
    end

    def broadcast_comment_created
      broadcast("comment_created", { cardId: card_id, comment: CommentSerializer.one(self) })
    end

    def broadcast_comment_updated
      broadcast("comment_updated", { cardId: card_id, comment: CommentSerializer.one(self) })
    end

    def broadcast(event, data)
      board = card&.board
      return unless board

      PipelineBoardChannel.broadcast_card_event(board, assignee_id: card.assigned_to_id, event: event, data: data)
    end

    def broadcast_comment_destroyed
      board = @destroyed_comment_data&.dig(:board)
      return unless board

      PipelineBoardChannel.broadcast_card_event(
        board,
        assignee_id: @destroyed_comment_data[:assignee_id],
        event: "comment_deleted",
        data: { cardId: @destroyed_comment_data[:card_id], commentId: @destroyed_comment_data[:id] }
      )
    end
  end
end
