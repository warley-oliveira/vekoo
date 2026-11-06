module Pipelines
  class Trigger < ApplicationRecord
    include Alertable

    ALERT_ORIGIN = "PipelineTrigger".freeze
    ALERT_CODE = "pipeline_trigger_failed".freeze

    EVENT_TYPES = %w[
      card_moved card_created card_updated due_date_passed sla_breached
      deal_won deal_lost deal_reopened
    ].freeze

    CRM_EVENT_TYPES = %w[deal_won deal_lost deal_reopened].freeze

    # `run_code` veio de `TriggerAction::CodeRunner`, que na origem era do gatilho do assistente: aqui
    # é o jeito de rodar script a partir do quadro. Ver `Pipelines::CodeRunnerJob`.
    ACTION_TYPES = %w[
      notify move_card assign_user
      send_whatsapp_message send_whatsapp_template
      fire_webhook toggle_automation create_card run_code
    ].freeze

    # As chaves de ação são snake_case no banco e camelCase na API. Estas são dados do usuário.
    OPAQUE_ACTION_KEYS = %w[headers card_custom_field_values template_params].freeze

    MAX_ACTIONS = 20
    MAX_CODE_LENGTH = 100_000
    DEFAULT_CODE_TIMEOUT_MS = 15_000
    MIN_CODE_TIMEOUT_MS = 1_000
    MAX_CODE_TIMEOUT_MS = 60_000

    belongs_to :board, class_name: "Pipelines::Board", inverse_of: :triggers
    belongs_to :stage, class_name: "Pipelines::Stage", optional: true, inverse_of: :triggers
    has_many :executions, class_name: "Pipelines::TriggerExecution", foreign_key: :pipeline_trigger_id, inverse_of: :trigger,
      dependent: :delete_all

    validates :name, presence: true, length: { maximum: 255 }
    validates :event_type, presence: true, inclusion: { in: EVENT_TYPES }
    validate :validate_actions_shape
    validate :crm_event_requires_crm_board
    validate :stage_belongs_to_board, if: :stage_id_changed?

    # O alerta de um gatilho apagado nunca mais seria resolvido: nenhuma execução boa viria depois.
    before_destroy { @organization_for_alert = board&.organization }
    after_destroy_commit :resolve_alert_of_destroyed

    scope :active, -> { where(active: true) }
    scope :inactive, -> { where(active: false) }
    scope :for_event, ->(event) { active.where(event_type: event) }
    scope :board_level, -> { where(stage_id: nil) }
    scope :for_stage, ->(stage_id) { active.where(stage_id: stage_id) }
    scope :ordered, -> { order(:created_at) }

    def toggle!
      update!(active: !active)
    end

    def stage_level?
      stage_id.present?
    end

    # O gatilho de etapa só vale para o card naquela etapa. O de quadro, para qualquer uma.
    def applies_to_stage?(id)
      stage_id.nil? || stage_id == id
    end

    def runs_code?
      Array(actions).any? { |action| action.is_a?(Hash) && (action["type"] || action[:type]).to_s == "run_code" }
    end

    # Falhou: fica um alerta no menu, um por gatilho, até uma execução dar certo. Sem isso, o erro só
    # apareceria para quem abrisse o histórico do quadro.
    def raise_failure_alert!(card)
      raise_organization_alert!(
        organization: board.organization,
        category: "pipelines",
        origin_type: ALERT_ORIGIN,
        origin_id: id,
        origin_name: name,
        code: ALERT_CODE,
        severity: "warning",
        metadata: { board_id: board_id, card_id: card.id }
      )
    end

    def resolve_failure_alert!
      resolve_organization_alert!(organization: board.organization, origin_type: ALERT_ORIGIN, origin_id: id, code: ALERT_CODE)
    end

    # Verifica se as condições do gatilho são atendidas pelo contexto.
    def conditions_met?(context = {})
      return true if conditions.blank?

      conditions.all? do |key, expected|
        actual = context[key.to_s] || context[key.to_sym]

        if expected.is_a?(Hash)
          evaluate_condition(actual, expected)
        else
          actual.to_s == expected.to_s
        end
      end
    end

    # O próximo da fila, em comando único: `update_column` depois de ler, como na origem, mandaria
    # dois cards para a mesma pessoa quando dois jobs rodam juntos. `exec_query` porque `select_value`
    # passa pelo cache de consultas, e o mesmo SQL devolveria o mesmo número duas vezes.
    def next_round_robin_index
      result = self.class.lease_connection.exec_query(self.class.sanitize_sql_array([
        "UPDATE pipeline_triggers SET last_round_robin_index = last_round_robin_index + 1 " \
        "WHERE id = ? RETURNING last_round_robin_index", id
      ]))

      result.rows.dig(0, 0).to_i - 1
    end

    private

    def resolve_alert_of_destroyed
      return unless @organization_for_alert

      resolve_organization_alert!(organization: @organization_for_alert, origin_type: ALERT_ORIGIN, origin_id: id)
    rescue StandardError => e
      Rails.logger.error("[Pipelines::Trigger] alerta do gatilho apagado: #{e.class}: #{e.message}")
    end

    def validate_actions_shape
      return errors.add(:actions, :blank) if actions.blank?
      return errors.add(:actions, :invalid) unless actions.is_a?(Array)
      return errors.add(:actions, :too_many, count: MAX_ACTIONS) if actions.size > MAX_ACTIONS

      actions.each_with_index do |action, index|
        next errors.add(:actions, :not_an_object, index: index + 1) unless action.is_a?(Hash)

        type = (action["type"] || action[:type]).to_s
        next errors.add(:actions, :invalid_type, index: index + 1) unless ACTION_TYPES.include?(type)

        validate_code_action(action, index) if type == "run_code"
      end
    end

    def validate_code_action(action, index)
      code = (action["code"] || action[:code]).to_s
      errors.add(:actions, :code_blank, index: index + 1) if code.blank?
      errors.add(:actions, :code_too_long, index: index + 1, count: MAX_CODE_LENGTH) if code.length > MAX_CODE_LENGTH
    end

    def crm_event_requires_crm_board
      return unless CRM_EVENT_TYPES.include?(event_type)
      return if board&.crm?

      errors.add(:event_type, :crm_only)
    end

    def stage_belongs_to_board
      return if stage_id.blank?

      errors.add(:stage_id, :invalid) unless stage&.board_id == board_id
    end

    def evaluate_condition(actual, condition)
      operator = condition["operator"] || condition[:operator] || "equals"
      value = condition["value"] || condition[:value]

      case operator
      when "equals" then actual.to_s == value.to_s
      when "not_equals" then actual.to_s != value.to_s
      when "contains" then actual.to_s.downcase.include?(value.to_s.downcase)
      when "not_contains" then !actual.to_s.downcase.include?(value.to_s.downcase)
      when "is_empty" then actual.blank?
      when "is_not_empty" then actual.present?
      when "greater_than" then actual.to_f > value.to_f
      when "less_than" then actual.to_f < value.to_f
      else actual.to_s == value.to_s
      end
    end
  end
end
