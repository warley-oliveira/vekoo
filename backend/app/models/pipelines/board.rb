module Pipelines
  class Board < ApplicationRecord
    BOARD_TYPES = %w[standard crm].freeze
    DEAL_CLOSE_BEHAVIORS = %w[manual immediate auto_archive_days].freeze
    CARD_VISIBILITIES = %w[all assigned].freeze

    belongs_to :organization

    has_many :stages, class_name: "Pipelines::Stage", foreign_key: :board_id, inverse_of: :board, dependent: :destroy
    has_many :cards, through: :stages
    has_many :custom_fields, class_name: "Pipelines::CustomField", foreign_key: :board_id, inverse_of: :board,
      dependent: :destroy
    has_many :triggers, class_name: "Pipelines::Trigger", foreign_key: :board_id, inverse_of: :board, dependent: :destroy
    has_many :goals, class_name: "Pipelines::Goal", foreign_key: :board_id, inverse_of: :board, dependent: :destroy
    has_many :saved_filters, class_name: "Pipelines::SavedFilter", foreign_key: :board_id, inverse_of: :board,
      dependent: :destroy

    normalizes :name, with: ->(name) { name.squish }

    validates :name, presence: true, length: { maximum: 120 }
    validates :board_type, inclusion: { in: BOARD_TYPES }
    validates :deal_close_behavior, inclusion: { in: DEAL_CLOSE_BEHAVIORS }
    validates :card_visibility, inclusion: { in: CARD_VISIBILITIES }
    validate :card_visibility_roles_are_valid, if: :card_visibility_settings_changed?
    validates :auto_archive_days, numericality: Pipelines::POSITIVE_INTEGER, allow_nil: true
    validates :deal_close_archive_days, numericality: Pipelines::POSITIVE_INTEGER, allow_nil: true
    validates :deal_rotting_days, numericality: Pipelines::POSITIVE_INTEGER, allow_nil: true
    validates :lead_score_low,
      numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1000 }
    validates :lead_score_high,
      numericality: { only_integer: true, greater_than_or_equal_to: 0, less_than_or_equal_to: 1000 }

    after_update_commit :broadcast_card_visibility_changed, if: :saved_card_visibility_settings_change?

    scope :active, -> { where(archived: false) }
    scope :archived, -> { where(archived: true) }
    # Sem o id por trás, como na origem, a ordem da lista seria sorteada: o id aqui é UUID.
    scope :ordered, -> { order(:position, :created_at) }
    scope :with_auto_archive, -> { where.not(auto_archive_days: nil) }
    scope :with_deal_auto_archive, -> { where(deal_close_behavior: "auto_archive_days").where.not(deal_close_archive_days: nil) }

    def crm?
      board_type == "crm"
    end

    def archive!
      update!(archived: true)
    end

    def unarchive!
      update!(archived: false)
    end

    def immediate_deal_archive?
      deal_close_behavior == "immediate"
    end

    def validates_fields_on_deal_close?
      require_fields_on_deal_won? || require_fields_on_deal_lost?
    end

    def card_visibility_restricted?
      card_visibility == "assigned"
    end

    def card_visibility_settings_changed?
      card_visibility_changed? || card_visibility_bypass_role_ids_changed?
    end

    def card_visibility_bypass_role_ids=(ids)
      super(Array(ids).map(&:to_s).uniq.sort)
    end

    # Chamado quando um grupo é apagado: ver config/initializers/pipelines_access_roles.rb. Sem validar,
    # porque pode ter sido o último da lista. A regra muda, e quem está no quadro é avisado pelo callback.
    def self.forget_access_role(role)
      where(organization_id: role.organization_id)
        .where("? = ANY(card_visibility_bypass_role_ids)", role.id)
        .find_each do |board|
        board.card_visibility_bypass_role_ids = board.card_visibility_bypass_role_ids - [ role.id ]
        board.save!(validate: false)
      end
    end

    private

    def card_visibility_roles_are_valid
      ids = card_visibility_bypass_role_ids
      errors.add(:card_visibility_bypass_role_ids, :blank_roles) if card_visibility_restricted? && ids.empty?
      return if ids.empty?
      return if ids.all? { |id| Pipelines.uuid?(id) } && AccessRole.where(organization_id: organization_id, id: ids).count == ids.size

      errors.add(:card_visibility_bypass_role_ids, :invalid_roles)
    end

    def saved_card_visibility_settings_change?
      saved_change_to_card_visibility? || saved_change_to_card_visibility_bypass_role_ids?
    end

    # Avisa os clientes para refazer a assinatura: as streams de card dependem desta configuração
    # (ver PipelineBoardChannel.card_stream_for).
    def broadcast_card_visibility_changed
      PipelineBoardChannel.broadcast_board_event(self, event: "card_visibility_changed", data: { id: id })
    end
  end
end
