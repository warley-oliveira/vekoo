# frozen_string_literal: true

# A exportação de contatos em segundo plano: `export` dispara, e o progresso volta só para quem
# pediu. A stream é da pessoa, dentro da organização da sessão.
#
#   { action: "progress",  data: { processed, total } }
#   { action: "completed", data: { downloadUrl, total, fileName } }
#   { action: "error",     data: { error } }
class ContactsExportChannel < ApplicationCable::Channel
  # Melhor esforço: o aviso de progresso não pode derrubar a exportação.
  def self.broadcast_event(organization_id, account_id, action, data)
    ActionCable.server.broadcast(organization_stream(organization_id, stream_name(account_id)), { action: action, data: data })
  rescue StandardError => e
    Rails.logger.warn("[ContactsExportChannel] transmissão perdida (#{action}): #{e.class}: #{e.message}")
  end

  def self.stream_name(account_id)
    "contacts-export:#{account_id}"
  end

  def subscribed
    return reject unless current_account.can?(:contacts)

    stream_from organization_stream(self.class.stream_name(current_account.id))
  end

  def unsubscribed
    stop_all_streams
  end

  # { selectAll, filters, chatIds, excludedIds }
  def export(data)
    return unless current_account.can?(:contacts)

    input = data.to_h.deep_transform_keys { |key| key.to_s.underscore }.with_indifferent_access

    ContactsExportJob.perform_later(
      organization_id: current_organization.id,
      account_id: current_account.id,
      filters: (input[:filters] || {}).to_h,
      select_all: ActiveModel::Type::Boolean.new.cast(input[:select_all]) || false,
      chat_ids: Array(input[:chat_ids]),
      excluded_ids: Array(input[:excluded_ids])
    )
  rescue StandardError => e
    Rails.logger.error("[ContactsExportChannel] #{e.class}: #{e.message}")
    self.class.broadcast_event(current_organization.id, current_account.id, "error", { error: I18n.t("inbox.export.failed") })
  end
end
