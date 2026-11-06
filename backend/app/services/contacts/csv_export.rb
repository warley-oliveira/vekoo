require "csv"

module Contacts
  # O conteúdo da exportação de contatos: cabeçalho no idioma de quem pediu, datas no fuso da
  # organização, uma coluna por campo personalizado. Em lotes, com só os campos que usa, e sem
  # consulta por linha: serve tanto à rota síncrona quanto ao job.
  class CsvExport
    BATCH_SIZE = 1_000
    FIELDS = %i[
      _id user_name display_name external_id custom_attributes chat_tag_ids created_at last_message_at
      assigned_account_id team_id status automation_enabled connector_id
    ].freeze
    DATE_FORMAT = "%d/%m/%Y %H:%M".freeze

    # @param scope [Mongoid::Criteria] as conversas escolhidas, já escopadas
    def initialize(organization, scope)
      @organization = organization
      @scope = scope
    end

    def headers
      base = %w[name phone connector status automation assignee team tags last_message created_at]
             .map { |key| I18n.t("inbox.export.headers.#{key}") }

      base + definitions.map(&:name)
    end

    # @yieldparam row [Array] uma linha
    # @yieldparam processed [Integer] quantas já saíram, para quem mostra progresso
    def each_batch
      offset = 0
      loop do
        records = scope.only(*FIELDS).order_by(created_at: :asc).skip(offset).limit(BATCH_SIZE).to_a
        break if records.empty?

        yield records.map { |chat| row(chat, lookups_for(records)) }

        offset += BATCH_SIZE
      end
    end

    def to_csv
      CSV.generate(headers: true) do |csv|
        csv << headers
        each_batch { |rows| rows.each { |row| csv << row } }
      end
    end

    private

    attr_reader :organization, :scope

    def definitions
      @definitions ||= organization.custom_fields.only(:name, :key).order_by(created_at: :asc).to_a
    end

    def time_zone
      @time_zone ||= ActiveSupport::TimeZone[organization.timezone.to_s] || Time.zone
    end

    # Uma vez por lote: as etiquetas, as pessoas, os departamentos e os canais de quem está nele.
    def lookups_for(records)
      return @lookups if @lookups_records.equal?(records)

      @lookups_records = records
      @lookups = {
        tags: ChatTag.where(organization_id: organization.id.to_s, :_id.in => records.flat_map { |chat| Array(chat.chat_tag_ids) }.uniq).only(:name).index_by(&:id),
        accounts: organization.accounts.where(id: records.map(&:assigned_account_id).compact.uniq).pluck(:id, :name).to_h,
        teams: organization.teams.where(id: records.map(&:team_id).compact.uniq).pluck(:id, :name).to_h,
        connectors: Connector::Base.where(organization_id: organization.id.to_s, :_id.in => records.map(&:connector_id).compact.uniq).index_by(&:id)
      }
    end

    def row(chat, lookups)
      cells = [
        chat.user_name.presence || chat.display_name.presence || I18n.t("inbox.export.blank_name"),
        chat.external_id&.gsub(/@s\.whatsapp\.net$/, ""),
        lookups[:connectors][chat.connector_id]&.display_name,
        I18n.t("inbox.export.statuses.#{chat.status}", default: chat.status),
        I18n.t(chat.automation_enabled ? "inbox.export.yes" : "inbox.export.no"),
        lookups[:accounts][chat.assigned_account_id],
        lookups[:teams][chat.team_id],
        Array(chat.chat_tag_ids).filter_map { |tag_id| lookups[:tags][tag_id]&.name }.join(", "),
        format_time(chat.last_message_at),
        format_time(chat.created_at),
        *definitions.map { |definition| chat.custom_attributes&.dig(definition.key) }
      ]

      cells.map { |cell| CsvCell.safe(cell) }
    end

    def format_time(time)
      time&.in_time_zone(time_zone)&.strftime(DATE_FORMAT)
    end
  end
end
