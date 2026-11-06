module MiniRacerEngine::Workers
  # `collection.*`: tabelas livres que o script cria na hora, guardadas no Mongo. Toda
  # operação começa resolvendo a tabela pelo nome DENTRO da organização do contexto, e todo
  # registro é buscado junto com o id da tabela: sem organização nada funciona, e o id de um
  # registro de outra organização não acha nada.
  class DynamicTable < MiniRacerEngine::EngineModule
    MAX_BULK_SIZE = 100
    MAX_PAGE_SIZE = 200
    DEFAULT_PAGE_SIZE = 20
    # O que uma consulta sem paginar devolve. A origem não tinha teto: `Where(t, {})` lia a
    # tabela inteira para a memória, num callback que o timeout não interrompe.
    MAX_RECORDS = 1_000
    MAX_AGGREGATE_RECORDS = 10_000
    MAX_RECORD_BYTES = 256.kilobytes
    MAX_TABLES = 1_000
    MAX_NAME_LENGTH = 120

    # O script monta o filtro, e valor de campo chega ao Mongo como está. Operador fora desta
    # lista (`$where`, `$function`, `$expr`...) executa código no banco ou foge do filtro.
    QUERY_OPERATORS = %w[
      $eq $ne $gt $gte $lt $lte $in $nin $exists $regex $options $not $all $size $elemMatch
      $and $or $nor $type $mod
    ].freeze

    # Entrada inválida: volta como `{ error:, ok: false }`, o formato de erro destas funções.
    class InvalidInput < MiniRacerEngine::Error; end

    def register(worker, context, event)
      @worker = worker

      # CRUD básico
      context.attach("collection.Create", proc { |*params| attach_method(method(:create_record), params, event) })
      context.attach("collection.Where", proc { |*params| attach_method(method(:find_records), params, event) })
      context.attach("collection.Update", proc { |*params| attach_method(method(:update_record), params, event) })
      context.attach("collection.Delete", proc { |*params| attach_method(method(:delete_record), params, event) })

      # Consultas
      context.attach("collection.FindById", proc { |*params| attach_method(method(:find_by_id), params, event) })
      context.attach("collection.FindOne", proc { |*params| attach_method(method(:find_one), params, event) })
      context.attach("collection.Count", proc { |*params| attach_method(method(:count_records), params, event) })
      context.attach("collection.Exists", proc { |*params| attach_method(method(:exists_record), params, event) })
      context.attach("collection.Paginate", proc { |*params| attach_method(method(:paginate_records), params, event) })
      context.attach("collection.Search", proc { |*params| attach_method(method(:search_records), params, event) })
      context.attach("collection.Distinct", proc { |*params| attach_method(method(:distinct_values), params, event) })

      # Operações em massa
      context.attach("collection.BulkCreate", proc { |*params| attach_method(method(:bulk_create), params, event) })
      context.attach("collection.UpdateWhere", proc { |*params| attach_method(method(:update_where), params, event) })
      context.attach("collection.DeleteWhere", proc { |*params| attach_method(method(:delete_where), params, event) })

      # Operações atômicas
      context.attach("collection.Upsert", proc { |*params| attach_method(method(:upsert_record), params, event) })
      context.attach("collection.Increment", proc { |*params| attach_method(method(:increment_field), params, event) })

      # Agregação
      context.attach("collection.Aggregate", proc { |*params|
                                               attach_method(method(:aggregate_records), params, event)
                                             })

      # Gerenciamento de tabelas
      context.attach("collection.ListTables", proc { |*params| attach_method(method(:list_tables), params, event) })
      context.attach("collection.DropTable", proc { |*params| attach_method(method(:drop_table), params, event) })
    end

    private

    # ── Helpers ──────────────────────────────────────────────────────────

    def guarded(name, &block)
      super(name) do
        block.call
      rescue Mongo::Error::OperationFailure => e
        # O filtro vem do script: operador em lugar errado é erro dele, não nosso.
        Rails.logger.info("[MiniRacerEngine] collection: recusado pelo Mongo: #{e.message}")
        raise InvalidInput, "Query rejected by the database"
      end
    rescue InvalidInput => e
      { error: e.message, ok: false }
    end

    # Falha fechada: sem organização, a origem caía num espaço único de tabelas com
    # `organization_id` nulo, compartilhado por toda execução sem contexto.
    def tables
      raise InvalidInput, "No organization in context" if organization_id.blank?

      ::DynamicTable.where(organization_id: organization_id)
    end

    def resolve_table(table_name)
      return nil if table_name.blank?

      tables.where(name: table_name.to_s).take
    end

    def resolve_table!(table_name)
      raise InvalidInput, "Missing table name" if table_name.blank?

      resolve_table(table_name) || raise(InvalidInput, "Table not found")
    end

    def find_or_create_table!(table_name)
      raise InvalidInput, "Missing table name" if table_name.blank?

      name = table_name.to_s
      raise InvalidInput, "Table name too long" if name.length > MAX_NAME_LENGTH

      existing = tables.where(name: name).take
      return existing if existing
      raise InvalidInput, "Too many tables (limit: #{MAX_TABLES})" if tables.count >= MAX_TABLES

      ::DynamicTable.create!(name: name, organization_id: organization_id)
    rescue Mongo::Error::OperationFailure, Mongoid::Errors::Validations
      # Outra execução criou a mesma tabela entre a leitura e a escrita: o índice único recusa.
      tables.where(name: name).take || raise
    end

    def records_of(table)
      ::DynamicRecord.where(dynamic_table_id: table.id)
    end

    # O id em texto: ele vem do script, e um `{ $ne: null }` aqui acharia qualquer registro.
    def record_scope(table, id)
      records_of(table).where(id: id.to_s)
    end

    def find_record(table, id)
      record_scope(table, id).take
    end

    def build_query(table, criteria = {})
      criteria = {} if criteria.nil?
      raise InvalidInput, "Criteria must be an object" unless criteria.is_a?(Hash)

      query = { dynamic_table_id: table.id }
      criteria.each do |key, value|
        guard_operators!(value)
        query[key == "id" ? key : "data.#{key}"] = value
      end
      query
    end

    def guard_operators!(value)
      case value
      when Hash
        value.each do |key, item|
          raise InvalidInput, "Operator not allowed: #{key}" if key.start_with?("$") && QUERY_OPERATORS.exclude?(key)

          guard_operators!(item)
        end
      when Array then value.each { |item| guard_operators!(item) }
      end
    end

    # Devolve o dado pronto para o Mongo: o BSON não aceita texto em bytes inválidos.
    def require_data!(data_hash)
      raise InvalidInput, "Data must be an object" unless data_hash.is_a?(Hash)

      clean = MiniRacerEngine::Values.to_js(data_hash)
      bytes = clean.to_json.bytesize
      raise InvalidInput, "Record too large (limit: #{MAX_RECORD_BYTES} bytes)" if bytes > MAX_RECORD_BYTES

      budget&.charge_stored_bytes!(bytes)
      clean
    end

    # `$set` por chave, e não `data.merge!` + `save`: dois scripts no mesmo registro apagariam
    # o que o outro escreveu.
    def set_operation(data_hash)
      data_hash.to_h do |key, value|
        raise InvalidInput, "Invalid field name: #{key}" if key.empty? || key.start_with?("$")

        [ "data.#{key}", value ]
      end
    end

    def apply_update(table, id, data_hash)
      return find_record(table, id) if data_hash.empty?

      record_scope(table, id).find_one_and_update({ "$set" => set_operation(data_hash) }, return_document: :after)
    end

    def create_in(table, data_hash)
      ::DynamicRecord.create!(dynamic_table: table, data: data_hash)
    end

    def field_key(field)
      raise InvalidInput, "Invalid field name: #{field}" if field.to_s.empty? || field.to_s.start_with?("$")

      field.to_s == "id" ? "_id" : "data.#{field}"
    end

    # ── CRUD básico ─────────────────────────────────────────────────────

    def create_record(params)
      table_name, data_hash = params
      clean = require_data!(data_hash)

      table = find_or_create_table!(table_name)
      { data: create_in(table, clean).to_data, ok: true }
    end

    def find_records(params)
      table_name, criteria = params
      table = resolve_table!(table_name)

      records = ::DynamicRecord.where(build_query(table, criteria)).order_by(_id: 1).limit(MAX_RECORDS + 1).to_a
      capped_response(records.first(MAX_RECORDS).map(&:to_data), records.size > MAX_RECORDS)
    end

    def update_record(params)
      table_name, id, data_hash = params
      table = resolve_table!(table_name)

      record = apply_update(table, id, require_data!(data_hash))
      return { error: "Record not found", ok: false } unless record

      { data: record.to_data, ok: true }
    end

    def delete_record(params)
      table_name, id = params
      table = resolve_table!(table_name)

      record = find_record(table, id)
      return { error: "Record not found", ok: false } unless record

      record.destroy
      { data: record.to_data, ok: true }
    end

    # ── Consultas ───────────────────────────────────────────────────────

    # collection.FindById(tableName, id)
    def find_by_id(params)
      table_name, id = params
      table = resolve_table!(table_name)
      return { error: "Missing record id", ok: false } unless id

      record = find_record(table, id)
      return { error: "Record not found", ok: false } unless record

      { data: record.to_data, ok: true }
    end

    # collection.FindOne(tableName, criteria): o mais antigo que atende.
    def find_one(params)
      table_name, criteria = params
      table = resolve_table!(table_name)

      record = ::DynamicRecord.where(build_query(table, criteria)).order_by(_id: 1).first
      return { data: nil, ok: true } unless record

      { data: record.to_data, ok: true }
    end

    # collection.Count(tableName, criteria)
    def count_records(params)
      table_name, criteria = params
      table = resolve_table!(table_name)

      { data: ::DynamicRecord.where(build_query(table, criteria)).count, ok: true }
    end

    # collection.Exists(tableName, criteria)
    def exists_record(params)
      table_name, criteria = params
      table = resolve_table!(table_name)

      { data: ::DynamicRecord.where(build_query(table, criteria)).exists?, ok: true }
    end

    # collection.Paginate(tableName, criteria, { limit, skip, sort })
    # sort: { field: 'asc' | 'desc' }
    def paginate_records(params)
      table_name, criteria, options = params
      table = resolve_table!(table_name)

      options = {} unless options.is_a?(Hash)
      limit = (options["limit"] || DEFAULT_PAGE_SIZE).to_i.clamp(1, MAX_PAGE_SIZE)
      skip  = [ 0, (options["skip"] || 0).to_i ].max

      query = ::DynamicRecord.where(build_query(table, criteria))

      if options["sort"].is_a?(Hash)
        sort_params = options["sort"].to_h do |key, direction|
          [ field_key(key), direction.to_s.downcase == "desc" ? -1 : 1 ]
        end
        query = query.order_by(sort_params)
      end

      total = query.count
      records = query.skip(skip).limit(limit)

      {
        data: records.map(&:to_data),
        total: total,
        limit: limit,
        skip: skip,
        has_more: (skip + limit) < total,
        ok: true
      }
    end

    # collection.Search(tableName, text, fields)
    # Busca textual simples (regex case-insensitive) nos campos especificados
    def search_records(params)
      table_name, text, fields = params
      table = resolve_table!(table_name)
      return { error: "Missing search text", ok: false } if text.nil? || text.to_s.strip.empty?

      fields = Array(fields)
      return { error: "Missing fields to search", ok: false } if fields.empty?

      escaped = Regexp.escape(text.to_s)
      or_conditions = fields.map { |field| { field_key(field) => /#{escaped}/i } }

      # `any_of`, nunca `or`: no Mongoid `where(tabela).or(x)` quer dizer "da tabela OU x", o
      # que na origem devolvia registros de qualquer tabela de qualquer organização.
      records = records_of(table).any_of(or_conditions).order_by(_id: 1).limit(MAX_RECORDS + 1).to_a
      capped_response(records.first(MAX_RECORDS).map(&:to_data), records.size > MAX_RECORDS)
    end

    # collection.Distinct(tableName, field, criteria)
    def distinct_values(params)
      table_name, field, criteria = params
      table = resolve_table!(table_name)
      return { error: "Missing field name", ok: false } unless field

      values = ::DynamicRecord.where(build_query(table, criteria)).distinct(field_key(field))
      capped_response(values.first(MAX_RECORDS).map(&:to_s), values.size > MAX_RECORDS)
    end

    def capped_response(data, truncated)
      response = { data: data, ok: true }
      response[:truncated] = true if truncated
      response
    end

    # ── Operações em massa ──────────────────────────────────────────────

    # collection.BulkCreate(tableName, [data1, data2, ...])
    def bulk_create(params)
      table_name, data_list = params
      return { error: "Missing table name", ok: false } if table_name.blank?
      return { error: "Data must be an array", ok: false } unless data_list.is_a?(Array)
      return { error: "Maximum #{MAX_BULK_SIZE} records per batch", ok: false } if data_list.size > MAX_BULK_SIZE

      clean = data_list.map { |data_hash| require_data!(data_hash) }

      table = find_or_create_table!(table_name)
      { data: clean.map { |data_hash| create_in(table, data_hash).to_data }, ok: true }
    end

    # collection.UpdateWhere(tableName, criteria, dataHash)
    # Um único comando no banco, em vez de ler e salvar registro a registro num callback que
    # o timeout não interrompe. `updated` conta os que atenderam ao filtro.
    def update_where(params)
      table_name, criteria, data_hash = params
      table = resolve_table!(table_name)
      return { error: "Missing update data", ok: false } unless data_hash.is_a?(Hash)

      clean = require_data!(data_hash)
      return { data: { updated: 0 }, ok: true } if clean.empty?

      result = ::DynamicRecord.where(build_query(table, criteria)).update_all("$set" => set_operation(clean))
      { data: { updated: result.matched_count }, ok: true }
    end

    # collection.DeleteWhere(tableName, criteria)
    def delete_where(params)
      table_name, criteria = params
      table = resolve_table!(table_name)
      return { error: "Missing criteria for bulk delete", ok: false } if (criteria || {}).empty?

      { data: { deleted: ::DynamicRecord.where(build_query(table, criteria)).delete_all }, ok: true }
    end

    # ── Operações atômicas ──────────────────────────────────────────────

    # collection.Upsert(tableName, criteria, dataHash)
    # Encontra o primeiro registro que atende ao critério e atualiza; se não existir, cria.
    def upsert_record(params)
      table_name, criteria, data_hash = params
      return { error: "Missing table name", ok: false } if table_name.blank?
      return { error: "Missing criteria", ok: false } if (criteria || {}).empty?
      return { error: "Missing data", ok: false } unless data_hash.is_a?(Hash)

      clean = require_data!(data_hash)
      table = find_or_create_table!(table_name)
      record = ::DynamicRecord.where(build_query(table, criteria)).order_by(_id: 1).first

      if record
        updated = apply_update(table, record.id, clean)
        { data: updated.to_data, ok: true, upserted: false }
      else
        { data: create_in(table, require_data!(criteria).merge(clean)).to_data, ok: true, upserted: true }
      end
    end

    # collection.Increment(tableName, id, field, amount)
    # Incrementa (ou decrementa se negativo) um campo numérico atomicamente
    def increment_field(params)
      table_name, id, field, amount = params
      table = resolve_table!(table_name)
      return { error: "Missing record id", ok: false } unless id
      return { error: "Missing field name", ok: false } unless field

      record = record_scope(table, id).find_one_and_update(
        { "$inc" => { field_key(field) => (amount || 1).to_f } }, return_document: :after
      )
      return { error: "Record not found", ok: false } unless record

      { data: record.to_data, ok: true }
    rescue Mongo::Error::OperationFailure
      { error: "Field is not numeric", ok: false }
    end

    # ── Agregação ───────────────────────────────────────────────────────

    # collection.Aggregate(tableName, field, operation, criteria)
    # operation: 'sum' | 'avg' | 'min' | 'max' | 'count'
    def aggregate_records(params)
      table_name, field, operation, criteria = params
      table = resolve_table!(table_name)

      operation = (operation || "count").to_s.downcase
      valid_ops = %w[sum avg min max count]
      return { error: "Invalid operation. Use: #{valid_ops.join(', ')}", ok: false } unless valid_ops.include?(operation)

      records = ::DynamicRecord.where(build_query(table, criteria))
      return { data: records.count, ok: true } if operation == "count"
      return { error: "Missing field name", ok: false } unless field

      # Só o campo, e com teto: conta em Ruby para manter a conversão da origem (texto vira
      # número, ausente vale 0 na soma e na média).
      values = records.limit(MAX_AGGREGATE_RECORDS + 1).pluck(field_key(field))
      capped = values.first(MAX_AGGREGATE_RECORDS)

      response = { data: aggregate(capped, operation), ok: true }
      response[:truncated] = true if values.size > MAX_AGGREGATE_RECORDS
      response
    rescue ArgumentError
      # `min` e `max` entre texto e número.
      { error: "Field has mixed types", ok: false }
    end

    def aggregate(values, operation)
      case operation
      when "sum" then values.sum { |value| (value || 0).to_f }
      when "avg" then values.empty? ? 0 : values.sum { |value| (value || 0).to_f } / values.size.to_f
      when "min" then values.compact.min
      when "max" then values.compact.max
      end
    end

    # ── Gerenciamento de tabelas ────────────────────────────────────────

    # collection.ListTables()
    def list_tables(_params)
      data = tables.order_by(name: 1).limit(MAX_TABLES).map { |table| { id: table.id.to_s, name: table.name } }
      { data: data, ok: true }
    end

    # collection.DropTable(tableName)
    def drop_table(params)
      table_name = params.first
      table = resolve_table!(table_name)

      deleted_records = records_of(table).delete_all
      table.destroy

      { data: { table: table_name, deleted_records: deleted_records }, ok: true }
    end
  end
end
