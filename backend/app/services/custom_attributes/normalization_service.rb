# frozen_string_literal: true

module CustomAttributes
  # Normalização em massa dos valores de um campo personalizado nas conversas da organização
  # (ex.: "20 a 40/dia" → "20"), com dry_run para pré-visualizar. A fonte de verdade é o hash
  # denormalizado `Chat#custom_attributes`, e o valor gravado é **texto** numérico canônico
  # ("30"): igualdade e `option_values` comparam texto no produto inteiro, e as comparações
  # numéricas convertem na hora.
  class NormalizationService
    MAX_DISTINCT_VALUES = 500

    def initialize(definition, account_id: nil)
      @definition = definition
      @account_id = account_id
      @organization_id = definition.organization_id.to_s
      @field = "custom_attributes.#{definition.key}"
    end

    # Valores distintos do campo, com contagem, do mais usado para o menos usado. Valores que
    # não são escalares (mapas de sistema) vêm com editable: false.
    #
    # @param date_range [Hash, nil] { start:, end: }, recorte por created_at da conversa
    def distinct_values(date_range: nil)
      match = { "organization_id" => @organization_id }
      created_at = date_range ? created_at_condition(date_range) : {}
      match["created_at"] = created_at if created_at.any?

      pipeline = [
        { "$match" => match },
        { "$group" => { "_id" => "$#{@field}", "count" => { "$sum" => 1 } } },
        { "$sort" => { "count" => -1, "_id" => 1 } },
        { "$limit" => MAX_DISTINCT_VALUES + 1 }
      ]
      docs = Chat.collection.aggregate(pipeline, allow_disk_use: true).to_a

      {
        values: docs.first(MAX_DISTINCT_VALUES).map do |doc|
          { value: doc["_id"], count: doc["count"], editable: scalar?(doc["_id"]) }
        end,
        truncated: docs.size > MAX_DISTINCT_VALUES
      }
    end

    # Com dry_run, só devolve a prévia [{ from, to, count }], sem mudar nada. Para aplicar, um
    # update_all por par do mapeamento: passa por fora dos callbacks de propósito, para não
    # disparar uma tempestade de eventos na lista, e registra a auditoria no campo.
    #
    # @param mapping [Hash] { "20 a 40/dia" => "20", ... }
    # @param target_key [String, nil] grava em custom_attributes.<target_key> e preserva o campo
    #   original (o campo novo é criado à parte, pela pessoa); `convert_to_number` só vale sem ele
    def normalize(mapping:, convert_to_number: false, dry_run: true, target_key: nil, date_range: nil)
      write_field = target_key.present? ? "custom_attributes.#{target_key}" : @field

      changes = mapping.map do |from, to|
        { from: from, to: to, count: scoped_chats(from, date_range).count }
      end

      return { dryRun: true, changes: changes, targetKey: target_key } if dry_run

      mapping.each do |from, to|
        scoped_chats(from, date_range).update_all("$set" => { write_field => to })
      end

      @definition.update(value_type: "number") if convert_to_number && target_key.blank?
      record_history(mapping, target_key, date_range)

      { dryRun: false, changes: changes, targetKey: target_key }
    end

    private

    def record_history(mapping, target_key, date_range)
      entry = {
        "mapping" => mapping,
        "target_key" => target_key,
        "date_range" => date_range&.transform_values { |time| time&.iso8601 },
        "applied_at" => Time.current,
        "account_id" => @account_id
      }

      # `$slice` no próprio `$push`: o teto vale na escrita, sem ler o histórico antes.
      CustomField.where(_id: @definition.id).update_all(
        "$push" => { normalization_history: { "$each" => [ entry ], "$slice" => -CustomField::MAX_NORMALIZATION_HISTORY } }
      )
    end

    def scoped_chats(value, date_range = nil)
      scope = Chat.where(organization_id: @organization_id, @field => value)
      scope = scope.where(:created_at.gte => date_range[:start]) if date_range&.dig(:start)
      scope = scope.where(:created_at.lte => date_range[:end]) if date_range&.dig(:end)
      scope
    end

    def created_at_condition(date_range)
      condition = {}
      condition["$gte"] = date_range[:start] if date_range[:start]
      condition["$lte"] = date_range[:end] if date_range[:end]
      condition
    end

    def scalar?(value)
      !value.is_a?(Hash) && !value.is_a?(Array)
    end
  end
end
