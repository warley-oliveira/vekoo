# Inconsistência ou erro detectado pelo sistema, escopado à organização. O alerta é
# agnóstico: qualquer domínio (conectores, webhooks, fluxos…) levanta e resolve pelo
# concern `Alertable` ou pelo `OrganizationAlertService`.
#
#   category    – seção do menu no front ('connectors', 'webhooks', 'flows'…)
#   severity    – 'error' | 'warning' | 'info'
#   origin_type – classe de origem ('Connector', 'Hook', …)
#   origin_id   – id de quem originou (string: aceita BSON e UUID)
#   code        – código de máquina ('connector_disconnected', …)
#   message     – texto próprio, quando quem levanta tem um (erro do provedor, por
#                 exemplo). Sem ele, a frase sai do `code`, no idioma da requisição.
#   metadata    – contexto extra, livre
#   resolved_at – nil enquanto ativo
class OrganizationAlert < ApplicationRecord
  SEVERITIES = %w[error warning info].freeze

  belongs_to :organization

  validates :category, presence: true
  validates :severity, presence: true, inclusion: { in: SEVERITIES }
  validates :origin_type, presence: true
  validates :origin_id, presence: true
  validates :code, presence: true

  scope :active, -> { where(resolved_at: nil) }
  scope :for_category, ->(category) { where(category: category) }
  scope :for_origin, ->(type, id) { where(origin_type: type, origin_id: id.to_s) }
  scope :for_code, ->(code) { where(code: code) }

  # Levanta o alerta ou atualiza o que já está ativo (mesma origem + código), sem
  # duplicar. Dois processos vendo o mesmo erro ao mesmo tempo esbarram no índice
  # único: quem perde a corrida acha a linha do outro na segunda tentativa.
  def self.raise_alert!(organization, category:, origin_type:, origin_id:, code:, severity: "error", message: nil,
                        origin_name: nil, metadata: {})
    attempts = 0
    begin
      alert = organization.organization_alerts.active.find_or_initialize_by(
        origin_type: origin_type,
        origin_id: origin_id.to_s,
        code: code
      )
      alert.assign_attributes(
        category: category,
        severity: severity,
        message: message,
        origin_name: origin_name,
        metadata: metadata
      )
      # Savepoint: o erro do índice não pode matar a transação de quem chamou.
      transaction(requires_new: true) { alert.save! }
    rescue ActiveRecord::RecordNotUnique
      retry if (attempts += 1) < 2

      raise
    end

    broadcast_badges(organization)
    alert
  end

  # Resolve os alertas ativos da origem + código. Sem código, todos os da origem.
  def self.resolve!(organization, origin_type:, origin_id:, code: nil)
    scope = organization.organization_alerts.active.for_origin(origin_type, origin_id)
    scope = scope.for_code(code) if code.present?
    count = scope.update_all(resolved_at: Time.current, updated_at: Time.current)
    broadcast_badges(organization) if count.positive?
    count
  end

  def self.resolve_category!(organization, category)
    count = organization.organization_alerts.active.for_category(category)
                        .update_all(resolved_at: Time.current, updated_at: Time.current)
    broadcast_badges(organization) if count.positive?
    count
  end

  # { "connectors" => 2, "webhooks" => 1 } — o que os badges do menu mostram.
  def self.active_counts_by_category(organization)
    organization.organization_alerts.active.group(:category).count
  end

  def self.broadcast_badges(organization)
    OrganizationAlertsChannel.broadcast_state(organization)
  rescue StandardError => e
    # Badge atrasado não pode derrubar quem levantou o alerta.
    Rails.logger.error("[OrganizationAlert] falha ao transmitir os badges: #{e.message}")
  end

  # O banco guarda o código; a frase é resolvida na leitura para sair no idioma de
  # quem pergunta, e não no de quem (ou de qual job) levantou o alerta.
  def display_message
    message.presence || I18n.t("organization_alerts.messages.#{code}", name: origin_name, default: "").presence
  end
end
