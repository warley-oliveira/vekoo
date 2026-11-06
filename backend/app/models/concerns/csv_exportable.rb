# Exportação de contatos em CSV, a partir das conversas da organização: a forma simples, sem filtro
# nem permissão, para quem exporta a organização inteira. A da tela é Contacts::CsvExport.
#
# Cabeçalho no idioma corrente e datas no fuso da organização.
module CsvExportable
  extend ActiveSupport::Concern

  EXPORT_BATCH_SIZE = 1000
  HEADER_KEYS = %w[name whatsapp tags created_at last_message].freeze

  class_methods do
    def export_contacts_to_csv(organization_id)
      require "csv"

      definitions = csv_custom_fields(organization_id)

      CSV.generate(headers: true) do |csv|
        csv << (csv_headers + definitions.map(&:name))

        each_csv_row(organization_id, definitions) { |row| csv << row }
      end
    end

    def export_contacts_to_csv_file(organization_id, file_path)
      require "csv"

      definitions = csv_custom_fields(organization_id)

      CSV.open(file_path, "wb", headers: true) do |csv|
        csv << (csv_headers + definitions.map(&:name))

        each_csv_row(organization_id, definitions, blank_name: "-") { |row| csv << row }
      end

      file_path
    end

    private

    def csv_headers
      HEADER_KEYS.map { |key| I18n.t("inbox.export.headers.#{key}") }
    end

    def csv_custom_fields(organization_id)
      ::CustomField.where(organization_id: organization_id.to_s).only(:name, :key).order_by(created_at: :asc).to_a
    end

    def csv_time_zone(organization_id)
      ActiveSupport::TimeZone[Organization.where(id: organization_id.to_s).pick(:timezone).to_s] || Time.zone
    end

    def each_csv_row(organization_id, definitions, blank_name: nil)
      time_zone = csv_time_zone(organization_id)
      format_time = ->(time) { time&.in_time_zone(time_zone)&.strftime("%d/%m/%Y %H:%M") }

      offset = 0
      loop do
        records = where(organization_id: organization_id.to_s)
                  .where.not(:external_id.in => [ nil, "", Chat::TEST_EXTERNAL_ID ])
                  .only(:user_name, :external_id, :custom_attributes, :chat_tag_ids, :created_at, :last_message_at)
                  .order_by(created_at: :asc)
                  .skip(offset)
                  .limit(EXPORT_BATCH_SIZE)
                  .to_a

        break if records.empty?

        tag_ids = records.flat_map(&:chat_tag_ids).uniq
        tags_by_id = ChatTag.where(:id.in => tag_ids).only(:name).index_by(&:id)

        records.each do |chat|
          row = [
            chat.user_name || blank_name,
            chat.external_id&.gsub(/@s\.whatsapp\.net$/, ""),
            chat.chat_tag_ids.map { |tag_id| tags_by_id[tag_id]&.name }.compact.join(", "),
            format_time.call(chat.created_at),
            format_time.call(chat.last_message_at),
            *definitions.map { |definition| chat.custom_attributes&.dig(definition.key) }
          ]

          yield row.map { |cell| Contacts::CsvCell.safe(cell) }
        end

        offset += EXPORT_BATCH_SIZE
      end
    end
  end
end
