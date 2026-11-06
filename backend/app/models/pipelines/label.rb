module Pipelines
  class Label < ApplicationRecord
    DEFAULT_COLOR = "#607D8B".freeze
    # Etiqueta criada por script, sem escolha de cor. A mesma das etiquetas de conversa.
    AUTOMATION_COLOR = "#f1c40f".freeze

    belongs_to :organization

    has_many :card_labels, class_name: "Pipelines::CardLabel", foreign_key: :label_id, inverse_of: :label, dependent: :destroy
    has_many :cards, through: :card_labels, source: :card

    normalizes :name, with: ->(name) { name.squish }

    validates :name, presence: true, length: { maximum: 100 }, uniqueness: { scope: :organization_id, case_sensitive: false }
    validates :color, presence: true

    scope :by_name, ->(query) { where("pipeline_labels.name ILIKE ?", "%#{sanitize_sql_like(query)}%") }
    scope :ordered, -> { order(:name) }
  end
end
