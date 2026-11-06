# frozen_string_literal: true

require "csv"

# A exportação de contatos em segundo plano, com o progresso em ContactsExportChannel.
#
# O arquivo vai para o Active Storage, e não para `tmp/` como na origem: quem gera é o Sidekiq e quem
# entrega é o Puma, que em produção não dividem disco.
class ContactsExportJob < ApplicationJob
  queue_as :default

  # @param filters [Hash] os filtros da tela, em snake_case
  def perform(organization_id:, account_id:, filters: {}, select_all: false, chat_ids: [], excluded_ids: [])
    @organization = Organization.find_by(id: organization_id)
    @account = @organization&.accounts&.active&.find_by(id: account_id)
    return unless @account&.can?(:contacts)

    I18n.with_locale(@account.locale.presence || I18n.default_locale) do
      export(filters, select_all, chat_ids, excluded_ids)
    end
  rescue StandardError => e
    Rails.logger.error("[ContactsExportJob] #{e.class}: #{e.message}")
    broadcast("error", { error: I18n.t("inbox.export.failed") }) if @account
  end

  private

  def export(filters, select_all, chat_ids, excluded_ids)
    scope = Contacts::Selection.new(
      account: @account,
      select_all: select_all,
      chat_ids: chat_ids,
      excluded_ids: excluded_ids,
      filters: filters,
      time_zone: ActiveSupport::TimeZone[@organization.timezone.to_s] || Time.zone
    ).criteria_or_filtered

    total = scope.count
    return broadcast("completed", { downloadUrl: nil, total: 0, message: I18n.t("inbox.export.nothing") }) if total.zero?

    broadcast("progress", { processed: 0, total: total })

    blob = write_file(scope, total)
    token = Contacts::ExportToken.generate(blob_id: blob.id, account_id: @account.id, organization_id: @organization.id)
    Contacts::PurgeExportJob.set(wait: Contacts::ExportToken::TTL + 5.minutes).perform_later(blob.id.to_s)

    broadcast("completed", { downloadUrl: Contacts::ExportToken.download_path(token), total: total, fileName: blob.filename.to_s })
  end

  def write_file(scope, total)
    path = Rails.root.join("tmp", "contatos-#{SecureRandom.hex(8)}.csv").to_s
    export = Contacts::CsvExport.new(@organization, scope)
    processed = 0

    CSV.open(path, "wb") do |csv|
      csv << export.headers

      export.each_batch do |rows|
        rows.each { |row| csv << row }
        processed += rows.size
        broadcast("progress", { processed: processed, total: total })
      end
    end

    Media::Storage.store_file(path, filename: "contatos-#{Date.current.iso8601}.csv", content_type: "text/csv")
  ensure
    FileUtils.rm_f(path) if path
  end

  def broadcast(action, data)
    ContactsExportChannel.broadcast_event(@organization.id, @account.id, action, data)
  end
end
