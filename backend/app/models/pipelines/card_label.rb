module Pipelines
  class CardLabel < ApplicationRecord
    belongs_to :card, class_name: "Pipelines::Card", inverse_of: :card_labels
    belongs_to :label, class_name: "Pipelines::Label", inverse_of: :card_labels

    validates :label_id, uniqueness: { scope: :card_id }
    validate :label_belongs_to_card_organization

    # A linha do tempo do card já previa `label_added` e `label_removed`, mas nada os gravava.
    after_create { card.log_activity("label_added", { label_id: label_id, label: label&.name }) }
    # `destroyed_by_association`: quando o card ou a etiqueta saem inteiros, não há o que registrar.
    after_destroy do
      card.log_activity("label_removed", { label_id: label_id, label: label&.name }) unless destroyed_by_association
    end

    private

    def label_belongs_to_card_organization
      return if label.nil? || card.nil?

      errors.add(:label_id, :invalid) if label.organization_id != card.organization_id
    end
  end
end
