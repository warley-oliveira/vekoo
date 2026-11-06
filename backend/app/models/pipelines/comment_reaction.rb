module Pipelines
  class CommentReaction < ApplicationRecord
    belongs_to :comment, class_name: "Pipelines::Comment", foreign_key: :pipeline_comment_id, inverse_of: :reactions
    belongs_to :user, class_name: "Account", foreign_key: :account_id

    validates :emoji, presence: true, length: { maximum: 20 }
    validates :account_id, uniqueness: { scope: %i[pipeline_comment_id emoji] }
  end
end
