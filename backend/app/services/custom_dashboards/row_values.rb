# frozen_string_literal: true

require "csv"

module CustomDashboards
  # Os valores das linhas, que saem do banco como tipos do Ruby e do BSON. Em JSON, data em milissegundos,
  # como no resto da API. Em CSV, data legível no fuso da organização, e nome no lugar de código.
  module RowValues
    module_function

    def as_json(result, zone)
      result.merge(rows: result[:rows].map { |row| row.transform_values { |value| json_value(value, zone) } })
    end

    def json_value(value, zone)
      case value
      when BSON::ObjectId then value.to_s
      when Time, DateTime, ActiveSupport::TimeWithZone then ApplicationSerializer.epoch_ms(value.to_time)
      when Date then ApplicationSerializer.epoch_ms(zone.local(value.year, value.month, value.day))
      when Array then value.map { |item| json_value(item, zone) }
      when Hash then value.to_h { |key, item| [ key.to_s, json_value(item, zone) ] }
      else value
      end
    end

    # O cabeçalho usa os nomes das colunas, e célula que começa com `=` é neutralizada: o nome do contato
    # vem de fora (ver `Contacts::CsvCell`).
    def to_csv(result, zone)
      columns = result[:columns]
      field_labels = result[:field_labels]
      labels = result[:labels]

      CSV.generate do |csv|
        csv << columns.map { |column| Contacts::CsvCell.safe((field_labels[column] || column).to_s) }

        result[:rows].each do |row|
          csv << columns.map { |column| Contacts::CsvCell.safe(csv_value(row[column], labels[column], zone)) }
        end
      end
    end

    def csv_value(value, labels, zone)
      case value
      when nil then labels ? labels[""] : nil
      when BSON::ObjectId then labels&.fetch(value.to_s, nil) || value.to_s
      when Time, DateTime, ActiveSupport::TimeWithZone then value.to_time.in_time_zone(zone).strftime("%d/%m/%Y %H:%M")
      when Date then value.strftime("%d/%m/%Y")
      when Array then value.map { |item| csv_value(item, nil, zone) }.join(", ")
      when Hash then value.to_json
      else labels&.fetch(value.to_s, nil) || value
      end
    end
  end
end
