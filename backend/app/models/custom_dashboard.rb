# frozen_string_literal: true

# Dashboard personalizado da organização: a configuração guardada, com os widgets dentro do documento.
# Os dados de cada widget saem de `CustomDashboards::QueryEngine`, na hora de mostrar.
class CustomDashboard
  include Mongoid::Document
  include Mongoid::Timestamps

  MAX_PER_ORGANIZATION = 100
  MAX_WIDGETS = 60

  field :name, type: String
  field :description, type: String
  field :icon, type: String
  field :is_favorite, type: Boolean, default: false
  field :is_default, type: Boolean, default: false
  field :organization_id, type: String
  field :created_by_account_id, type: String
  # Da tela, em camelCase, como ela mandou: o servidor só guarda e devolve.
  field :global_filters, type: Hash, default: {}

  embeds_many :widgets, class_name: "CustomDashboardWidget", inverse_of: :custom_dashboard

  index({ organization_id: 1, updated_at: -1 })

  validates :name, presence: true, length: { maximum: 120 }
  validates :description, length: { maximum: 1_000 }, allow_blank: true
  validates :icon, length: { maximum: 80 }, allow_blank: true
  validates :organization_id, :created_by_account_id, presence: true
  validate :within_organization_limit, on: :create

  scope :for_organization, ->(organization_id) { where(organization_id: organization_id.to_s) }

  # Uma cópia nova, inteira, com widgets de id novo. Fica em nome de quem duplicou.
  def duplicate_for(account_id:)
    copy = self.class.new(
      attributes.slice("description", "icon", "organization_id", "global_filters").merge(
        "name" => I18n.t("insights.custom_dashboards.copy_name", name: name).truncate(120),
        "created_by_account_id" => account_id.to_s
      )
    )
    widgets.each { |widget| copy.widgets.build(widget.attributes.except("_id", "created_at", "updated_at")) }
    copy.save!
    copy
  end

  private

  def within_organization_limit
    return if self.class.for_organization(organization_id).count < MAX_PER_ORGANIZATION

    errors.add(:base, I18n.t("insights.custom_dashboards.errors.too_many_dashboards", max: MAX_PER_ORGANIZATION))
  end
end
