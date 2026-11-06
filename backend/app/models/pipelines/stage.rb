module Pipelines
  # Etapa do quadro (na origem, `KanbanColumn`).
  class Stage < ApplicationRecord
    include Pipelines::OrderedList

    belongs_to :board, class_name: "Pipelines::Board", inverse_of: :stages

    has_many :cards, class_name: "Pipelines::Card", foreign_key: :stage_id, inverse_of: :stage, dependent: :destroy
    has_many :checklist_items, class_name: "Pipelines::StageChecklistItem", foreign_key: :stage_id, inverse_of: :stage,
      dependent: :destroy
    has_many :custom_fields, class_name: "Pipelines::CustomField", foreign_key: :stage_id, inverse_of: :stage,
      dependent: :destroy
    has_many :triggers, class_name: "Pipelines::Trigger", foreign_key: :stage_id, inverse_of: :stage, dependent: :destroy

    ordered_within :board_id

    normalizes :name, with: ->(name) { name.squish }

    validates :name, presence: true, length: { maximum: 120 }
    validates :position, numericality: Pipelines::INTEGER_RANGE, allow_nil: true
    validates :wip_limit, numericality: Pipelines::POSITIVE_INTEGER, allow_nil: true
    validates :sla_hours, numericality: Pipelines::POSITIVE_INTEGER, allow_nil: true

    after_create_commit :broadcast_stage_created
    after_update_commit :broadcast_stage_updated
    before_destroy :capture_stage_destroy_data
    after_destroy_commit :broadcast_stage_destroyed

    def cards_count
      cards.where(archived: false).count
    end

    def wip_limit_reached?
      wip_limit.present? && cards_count >= wip_limit
    end

    def checklist_complete_for?(card)
      required_items = checklist_items.where(required: true)
      total = required_items.count
      return true if total.zero?

      completed = CardStageCheck.where(
        card_id: card.id,
        pipeline_stage_checklist_item_id: required_items.unscope(:order).select(:id),
        completed: true
      ).count
      completed >= total
    end

    def incomplete_required_items_for(card)
      required_items = checklist_items.where(required: true)
      completed_ids = CardStageCheck.where(
        card_id: card.id,
        pipeline_stage_checklist_item_id: required_items.unscope(:order).select(:id),
        completed: true
      ).pluck(:pipeline_stage_checklist_item_id)

      required_items.where.not(id: completed_ids).pluck(:title)
    end

    def incomplete_required_field_values_for(card)
      required = custom_fields.stage_scope.where(required_to_leave_stage: true).pluck(:key, :name)
      return [] if required.empty?

      values = card.custom_field_values || {}
      required.each_with_object([]) do |(key, name), pending|
        pending << name if CustomFieldValue.blank_value?(values[key])
      end
    end

    private

    def capture_stage_destroy_data
      @destroyed_stage_data = { id: id, board: board }
    end

    def broadcast_stage_created
      broadcast_to_board("stage_created")
    end

    def broadcast_stage_updated
      broadcast_to_board("stage_updated")
    end

    # Apagar o quadro inteiro leva as etapas junto: quem está nele recebe o aviso do próprio quadro.
    def broadcast_stage_destroyed
      return unless @destroyed_stage_data

      PipelineBoardChannel.broadcast_board_event(
        @destroyed_stage_data[:board], event: "stage_deleted", data: { id: @destroyed_stage_data[:id] }
      )
    end

    def broadcast_to_board(event)
      PipelineBoardChannel.broadcast_board_event(board, event: event, data: StageSerializer.one(self))
    end
  end
end
