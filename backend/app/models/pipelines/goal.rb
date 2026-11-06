module Pipelines
  class Goal < ApplicationRecord
    SCOPES = %w[funnel user].freeze
    METRICS = %w[revenue].freeze
    MAX_TARGET = 10**10 # numeric(12, 2)

    belongs_to :board, class_name: "Pipelines::Board", inverse_of: :goals
    belongs_to :assigned_account, class_name: "Account", optional: true
    belongs_to :created_by, class_name: "Account", optional: true

    validates :scope, inclusion: { in: SCOPES }
    validates :metric, inclusion: { in: METRICS }
    validates :period_month, presence: true
    validates :target_value, numericality: { greater_than: 0, less_than: MAX_TARGET }
    validates :assigned_account, presence: true, if: :user_scope?
    validates :assigned_account, absence: true, unless: :user_scope?
    # Duas regras porque a mensagem é outra: para a meta do funil, que não tem pessoa, "Responsável já
    # está em uso" não dizia nada.
    validates :assigned_account_id, uniqueness: { scope: %i[board_id scope period_month], message: :goal_taken }, if: :user_scope?
    validates :period_month, uniqueness: { scope: %i[board_id scope], message: :goal_taken }, unless: :user_scope?
    validate :assigned_account_belongs_to_organization

    scope :funnel, -> { where(scope: "funnel") }
    scope :user_goals, -> { where(scope: "user") }
    scope :for_user, ->(account_id) { where(scope: "user", assigned_account_id: account_id) }
    scope :for_month, ->(date) { where(period_month: date.to_date.beginning_of_month) }

    def user_scope?
      scope == "user"
    end

    private

    def assigned_account_belongs_to_organization
      return if assigned_account.nil? || board.nil?

      errors.add(:assigned_account_id, :invalid) if assigned_account.organization_id != board.organization_id
    end
  end
end
