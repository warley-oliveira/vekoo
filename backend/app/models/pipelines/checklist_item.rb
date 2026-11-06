module Pipelines
  class ChecklistItem < ApplicationRecord
    include Pipelines::OrderedList

    belongs_to :checklist, class_name: "Pipelines::Checklist", foreign_key: :pipeline_checklist_id, inverse_of: :items
    belongs_to :assigned_to, class_name: "Account", optional: true

    ordered_within :pipeline_checklist_id

    validates :title, presence: true, length: { maximum: 500 }
    validates :position, numericality: Pipelines::INTEGER_RANGE, allow_nil: true
    validate :assigned_to_belongs_to_organization, if: :assigned_to_id_changed?

    after_commit :broadcast_card_progress

    def toggle!
      update!(completed: !completed)
    end

    private

    def assigned_to_belongs_to_organization
      return if assigned_to_id.blank?

      organization_id = checklist&.card&.organization_id
      return if Pipelines.uuid?(assigned_to_id) && Account.exists?(id: assigned_to_id, organization_id: organization_id)

      errors.add(:assigned_to_id, :invalid)
    end

    def broadcast_card_progress
      checklist&.card&.broadcast_progress_change unless destroyed_by_association
    end
  end
end
