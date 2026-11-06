module Pipelines
  class SavedFilterFavorite < ApplicationRecord
    belongs_to :user, class_name: "Account", foreign_key: :account_id
    belongs_to :saved_filter, class_name: "Pipelines::SavedFilter", foreign_key: :pipeline_saved_filter_id,
      optional: true, inverse_of: :favorites
    belongs_to :board, class_name: "Pipelines::Board"

    validate :target_is_exclusive
    validate :preset_key_is_known

    private

    # Espelha a check constraint: aponta para um filtro salvo OU para um preset.
    def target_is_exclusive
      if pipeline_saved_filter_id.blank? && preset_key.blank?
        errors.add(:base, :no_target)
      elsif pipeline_saved_filter_id.present? && preset_key.present?
        errors.add(:base, :two_targets)
      end
    end

    def preset_key_is_known
      return if preset_key.blank?
      return if PresetFilters.key?(preset_key)

      errors.add(:preset_key, :invalid)
    end
  end
end
