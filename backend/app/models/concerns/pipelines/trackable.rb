module Pipelines
  # Grava em `pipeline_card_activities` o que acontece com o card: uma linha por evento, na mesma
  # transação de quem alterou. `Current.account` é quem fez; em job e script, ninguém.
  module Trackable
    extend ActiveSupport::Concern

    # O valor vai para o `details` da atividade. Uma descrição de 50 KB não precisa ser copiada a
    # cada edição só para a linha do tempo dizer que ela mudou.
    MAX_TRACKED_VALUE_LENGTH = 500

    included do
      after_save :log_activity_changes
    end

    # Para quem grava fora de `save`: etiquetas e, nos jobs, avisos.
    def log_activity(action, details = {})
      activities.create!(action: action, details: details, account_id: Current.account&.id)
    rescue StandardError => e
      Rails.logger.error("[Pipelines::Trackable] #{action}: #{e.class}: #{e.message}")
    end

    private

    def log_activity_changes
      return log_activity("created", { title: title }) if previously_new_record?

      track_stage_change
      track_archive_change
      track_field_changes
      track_assignment_change
      track_deal_status_change
    end

    def track_stage_change
      return unless saved_change_to_stage_id?

      from_id, to_id = saved_change_to_stage_id
      names = Stage.unscoped.where(id: [ from_id, to_id ]).pluck(:id, :name).to_h

      log_activity("moved", {
        from_stage_id: from_id,
        to_stage_id: to_id,
        from_stage: names[from_id],
        to_stage: names[to_id]
      })
    end

    def track_archive_change
      return unless saved_change_to_archived? && archived

      if auto_archive_reason
        log_activity("auto_archived", auto_archive_reason)
      else
        log_activity("archived", { archived: true })
      end
    end

    def track_field_changes
      tracked = %w[title description priority due_date deal_value deal_probability company_name]

      saved_changes.slice(*tracked).each do |field, (old_value, new_value)|
        log_activity("updated", { field: field, old_value: tracked_value(old_value), new_value: tracked_value(new_value) })
      end
    end

    def tracked_value(value)
      value.is_a?(String) ? value.truncate(MAX_TRACKED_VALUE_LENGTH) : value
    end

    def track_assignment_change
      return unless saved_change_to_assigned_to_id?

      old_id, new_id = saved_change_to_assigned_to_id
      names = Account.where(id: [ old_id, new_id ].compact).pluck(:id, :name).to_h

      log_activity("assigned", {
        from_account_id: old_id,
        to_account_id: new_id,
        from_account_name: names[old_id],
        to_account_name: names[new_id]
      })
    end

    def track_deal_status_change
      if saved_change_to_won_at? && won_at.present?
        log_activity("deal_won", { deal_value: deal_value })
      elsif saved_change_to_lost_at? && lost_at.present?
        log_activity("deal_lost", { deal_value: deal_value, reason: lost_reason })
      elsif deal_reopened_now?
        log_activity("deal_reopened", { deal_value: deal_value })
      end
    end
  end
end
