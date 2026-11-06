require "csv"

module ContactImports
  # Lê o CSV de contatos. Planilha brasileira costuma vir com `;` e BOM do Excel, e o cabeçalho, em
  # português: os dois primeiros quebrariam a leitura, e o último deixaria todos os contatos sem
  # telefone nem nome.
  module CsvParser
    HEADER_ALIASES = {
      "external_id" => "external_id", "externalid" => "external_id", "telefone" => "external_id",
      "phone" => "external_id", "whatsapp" => "external_id", "celular" => "external_id", "numero" => "external_id",
      "user_name" => "user_name", "username" => "user_name", "nome" => "user_name", "name" => "user_name",
      "assigned_user_name" => "assigned_user_name", "assigneduser" => "assigned_user_name", "responsavel" => "assigned_user_name",
      "department_name" => "department_name", "departamento" => "department_name", "department" => "department_name"
    }.freeze

    module_function

    # @return [Array<Hash>] com chaves em snake_case, sem as células vazias
    # @raise [CSV::MalformedCSVError]
    def parse(content)
      text = content.to_s.dup.force_encoding("UTF-8")
      text = text.encode("UTF-8", "ISO-8859-1") unless text.valid_encoding?
      text = text.delete_prefix("﻿")

      rows = []
      CSV.parse(text, headers: true, skip_blanks: true, col_sep: separator(text)) do |row|
        contact = row.to_h.each_with_object({}) do |(header, value), result|
          next if header.blank? || value.blank?

          result[normalize_header(header)] = value.strip
        end

        rows << contact if contact.any?
      end
      rows
    end

    def separator(text)
      first_line = text.lines.first.to_s
      first_line.count(";") > first_line.count(",") ? ";" : ","
    end

    def normalize_header(header)
      key = header.to_s.strip.parameterize(separator: "_")

      HEADER_ALIASES.fetch(key, key)
    end
  end
end
