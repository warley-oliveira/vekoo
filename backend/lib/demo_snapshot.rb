# O retrato do banco de desenvolvimento, versionado em `db/seeds/snapshot/`, que vira a demonstração
# de qualquer máquina: `bin/rails db:snapshot:dump` grava, `bin/rails db:seed` aplica.
#
#   db/seeds/snapshot/
#     manifest.json          quando foi tirado e o que tem
#     postgres/<tabela>.json linhas como o ActiveRecord as lê (tipos do banco, sem modelo nem callback)
#     mongo/<coleção>.json   documentos em Extended JSON (ObjectId e datas sobrevivem à viagem)
#     files/<key>            os arquivos do Active Storage que as linhas citam
#
# **Datas relativas.** Toda data e hora (colunas `datetime`/`date` do Postgres e todo `Time` dentro
# dos documentos do Mongo, em qualquer profundidade) anda junto com o tempo que passou desde o retrato,
# em **dias inteiros**: o que era "ontem às 14h" continua "ontem às 14h", e o agendamento de amanhã às
# 10h continua amanhã às 10h, com a hora de parede intacta. Os dias são os inteiros já passados, então
# o passado nunca vira futuro (o futuro de poucas horas pode virar passado recente). Datas escritas
# dentro de JSON (texto ou milissegundos em `jsonb`) não andam.
#
# **Upsert.** Cada linha entra pela chave primária (`ON CONFLICT (id) DO UPDATE` no Postgres,
# `replaceOne` com `upsert` no Mongo): rodar de novo atualiza em vez de duplicar, e o que foi criado
# depois do retrato fica. Um banco que já tem a mesma coisa com **outro id** (a semente escrita à mão,
# por exemplo: o e-mail da Marina é único) recusa com o recado de recomeçar por `bin/rails db:reset`.
#
# **Fora do retrato:** sessões, pedidos de nova senha, registro de entradas do suporte e dispositivos
# de push (credencial e rastro, não dado de demonstração), e o acervo da ferramenta de carrossel
# (temas, imagens e cores), que `seed_catalog!` já aplica pela chave natural.
module DemoSnapshot
  ROOT = Rails.root.join("db/seeds/snapshot")
  FORMAT = 1

  SKIP_TABLES = %w[
    schema_migrations ar_internal_metadata
    sessions password_resets support_accesses push_devices
    theme_presets library_images palette_colors
  ].freeze
  # O acervo tem anexos próprios; eles ficam com o acervo.
  SKIP_ATTACHMENT_RECORDS = %w[ThemePreset LibraryImage PaletteColor].freeze
  STORAGE_TABLES = %w[active_storage_blobs active_storage_attachments active_storage_variant_records].freeze

  # Produto global identificado pela chave natural, que `platform:sync` também escreve: antes de
  # entrar, sai o registro com a mesma chave e outro id, para as referências do retrato valerem.
  NATURAL_KEYS = { "tools" => %w[slug] }.freeze

  class Conflict < StandardError; end

  module_function

  # A pasta do retrato. As specs trocam por uma temporária (`DemoSnapshot.root = dir`).
  def root = @root || ROOT

  def root=(path)
    @root = path && Pathname(path)
  end

  def present?
    root.join("manifest.json").exist?
  end

  def manifest
    JSON.parse(root.join("manifest.json").read)
  end

  # --- gravar --------------------------------------------------------------------------------------

  def dump!(log: ->(_line) { })
    FileUtils.rm_rf(root)
    %w[postgres mongo files].each { |dir| FileUtils.mkdir_p(root.join(dir)) }

    dumped_at = Time.current
    tables = dump_postgres(log)
    collections = dump_mongo(log)
    files = dump_files(log)

    write_json(root.join("manifest.json"), {
      "format" => FORMAT,
      "dumpedAt" => dumped_at.iso8601(6),
      "timeZone" => Time.zone.name,
      "postgres" => tables,
      "mongo" => collections,
      "files" => files
    })
    { tables: tables.size, rows: tables.values.sum, collections: collections.size, documents: collections.values.sum, files: files }
  end

  def dump_postgres(log)
    blob_ids = kept_blob_ids
    ordered_tables.each_with_object({}) do |table, counts|
      model = table_model(table)
      scope = model.unscoped.order(*Array(model.primary_key).compact)
      scope = filter_storage(table, scope, blob_ids)
      # Coluna gerada (`search_document`) o próprio banco recalcula, e recusa quem tenta escrever nela.
      names = model.columns.reject(&:virtual?).map(&:name)
      rows = scope.map { |record| encode_row(model, names.index_with { |name| record[name] }) }
      next if rows.empty?

      write_json(root.join("postgres/#{table}.json"), rows)
      counts[table] = rows.size
      log.call("postgres #{table}: #{rows.size}")
    end
  end

  def dump_mongo(log)
    database = Mongoid.default_client.database
    database.collection_names.reject { |name| name.start_with?("system.") }.sort.each_with_object({}) do |name, counts|
      documents = database[name].find.sort(_id: 1).map { |doc| doc.as_extended_json(mode: :relaxed) }
      next if documents.empty?

      write_json(root.join("mongo/#{name}.json"), documents)
      counts[name] = documents.size
      log.call("mongo #{name}: #{documents.size}")
    end
  end

  def dump_files(log)
    service = ActiveStorage::Blob.service
    count = 0
    ActiveStorage::Blob.where(id: kept_blob_ids).find_each do |blob|
      next unless service.exist?(blob.key)

      File.binwrite(root.join("files", blob.key), service.download(blob.key))
      count += 1
    rescue ActiveStorage::FileNotFoundError
      log.call("arquivo sumido: #{blob.key} (#{blob.filename})")
    end
    log.call("arquivos: #{count}")
    count
  end

  # Os blobs que algum anexo do retrato usa, e as variantes deles.
  def kept_blob_ids
    attached = ActiveStorage::Attachment.where.not(record_type: SKIP_ATTACHMENT_RECORDS).distinct.pluck(:blob_id)
    variants = ActiveStorage::VariantRecord.where(blob_id: attached).pluck(:id)
    variant_blobs = ActiveStorage::Attachment.where(record_type: "ActiveStorage::VariantRecord", record_id: variants).pluck(:blob_id)
    (attached + variant_blobs).uniq
  end

  def filter_storage(table, scope, blob_ids)
    case table
    when "active_storage_blobs" then scope.where(id: blob_ids)
    when "active_storage_attachments" then scope.where(blob_id: blob_ids).where.not(record_type: SKIP_ATTACHMENT_RECORDS)
    when "active_storage_variant_records" then scope.where(blob_id: blob_ids)
    else scope
    end
  end

  # --- aplicar -------------------------------------------------------------------------------------

  def load!(now: Time.current, log: ->(_line) { })
    info = manifest
    raise ArgumentError, "retrato no formato #{info['format']}, este código lê o #{FORMAT}" unless info["format"] == FORMAT

    days = shift_days(Time.zone.parse(info["dumpedAt"]), now)
    log.call("datas andam #{days} dia(s) desde o retrato de #{info['dumpedAt']}")

    restore_files(log)
    # Ponto de retorno próprio: um conflito desfaz só o retrato, mesmo dentro de outra transação.
    ActiveRecord::Base.transaction(requires_new: true) do
      tables = ordered_tables.select { |table| info["postgres"].key?(table) }
      forward = forward_keys(tables)
      tables.each { |table| load_table(table, days, log, nulling: forward[table]) }
      # Segunda volta só para as tabelas de um ciclo: agora o outro lado já existe.
      tables.each { |table| load_table(table, days, ->(_line) { }) if forward[table].any? }
      reset_sequences(tables)
    end
    info["mongo"].each_key { |name| load_collection(name, days, log) }
    { days: days, tables: info["postgres"].size, collections: info["mongo"].size }
  end

  # Dias inteiros já passados: a hora de parede fica, e o passado não vira futuro.
  def shift_days(dumped_at, now)
    ((now - dumped_at) / 1.day).floor
  end

  def load_table(table, days, log, nulling: [])
    model = table_model(table)
    rows = JSON.parse(root.join("postgres/#{table}.json").read).map { |row| decode_row(model, row, days) }
    return if rows.empty?

    rows = rows.map { |row| row.merge(nulling.index_with(nil)) } if nulling.any?
    rows = latest_first(model, rows)

    reconcile_natural_keys_pg(model, rows)
    key = Array(model.primary_key).compact
    rows.each_slice(500) do |slice|
      key.any? ? model.upsert_all(slice, unique_by: key, record_timestamps: false) : model.insert_all(slice, record_timestamps: false)
    end
    log.call("postgres #{table}: #{rows.size}")
  rescue ActiveRecord::RecordNotUnique => e
    raise Conflict, conflict_message("#{table}: #{e.message.lines.first.strip}")
  end

  def load_collection(name, days, log)
    collection = Mongoid.default_client[name]
    documents = JSON.parse(root.join("mongo/#{name}.json").read).map { |doc| shift_mongo(BSON::ExtJSON.parse_obj(doc), days) }
    return if documents.empty?

    reconcile_natural_keys_mongo(collection, name, documents)
    documents.each_slice(500) do |slice|
      collection.bulk_write(slice.map { |doc| { replace_one: { filter: { _id: doc["_id"] }, replacement: doc, upsert: true } } }, ordered: false)
    end
    log.call("mongo #{name}: #{documents.size}")
  rescue Mongo::Error::BulkWriteError => e
    raise Conflict, conflict_message("#{name}: #{e.message.to_s.first(300)}")
  end

  def restore_files(log)
    service = ActiveStorage::Blob.service
    restored = 0
    Dir.glob(root.join("files/*")).each do |path|
      key = File.basename(path)
      next if service.exist?(key)

      File.open(path, "rb") { |io| service.upload(key, io) }
      restored += 1
    end
    log.call("arquivos novos: #{restored}")
  end

  # O banco não sabe que os ids vieram de fora: a próxima linha criada pela tela pegaria um número
  # que o retrato já usa (é o `accounts.number` que vira o hashid da URL).
  def reset_sequences(tables)
    connection = ActiveRecord::Base.connection
    tables.each do |table|
      connection.columns(table).select { |column| column.default_function.to_s.start_with?("nextval(") }.each do |column|
        quoted = connection.quote_table_name(table)
        name = connection.quote_column_name(column.name)
        connection.execute(<<~SQL.squish)
          SELECT setval(pg_get_serial_sequence('#{table}', '#{column.name}'), COALESCE(MAX(#{name}), 1), MAX(#{name}) IS NOT NULL) FROM #{quoted}
        SQL
      end
    end
  end

  def reconcile_natural_keys_pg(model, rows)
    columns = NATURAL_KEYS[model.table_name] or return
    rows.each { |row| model.unscoped.where(row.slice(*columns)).where.not(id: row["id"]).delete_all }
  end

  def reconcile_natural_keys_mongo(collection, name, documents)
    columns = NATURAL_KEYS[name] or return
    documents.each do |doc|
      collection.delete_many(columns.index_with { |column| doc[column] }.merge("_id" => { "$ne" => doc["_id"] }))
    end
  end

  def conflict_message(detail)
    "O banco já tem um registro igual ao do retrato com outro id (#{detail}). Isso acontece num banco " \
      "que recebeu a semente escrita à mão: recomece com `bin/rails db:reset`, que aplica o retrato num banco vazio."
  end

  # --- tipos ---------------------------------------------------------------------------------------

  # Tabela por tabela, sem modelo da aplicação: nada de callback, validação, criptografia ou STI no
  # meio. Os tipos vêm das colunas.
  def table_model(table)
    @table_models ||= {}
    @table_models[table] ||= Class.new(ActiveRecord::Base) do
      self.table_name = table
      self.inheritance_column = nil
      def self.name = "DemoSnapshot::Row"
    end
  end

  def encode_row(model, attributes)
    attributes.to_h do |name, value|
      type = model.columns_hash[name]&.type
      encoded =
        case value
        when nil then nil
        when ActiveSupport::TimeWithZone, Time, DateTime then value.utc.iso8601(6)
        when Date then value.iso8601
        when BigDecimal then value.to_s
        else type == :binary ? { "$base64" => Base64.strict_encode64(value) } : value
        end
      [ name, encoded ]
    end
  end

  def decode_row(model, row, days)
    row.to_h do |name, value|
      column = model.columns_hash[name]
      decoded =
        if value.nil? || column.nil? then value
        elsif value.is_a?(Hash) && value.key?("$base64") then Base64.strict_decode64(value["$base64"])
        elsif column.type == :datetime then Time.zone.parse(value) + days.days
        elsif column.type == :date then Date.parse(value) + days
        else value
        end
      [ name, decoded ]
    end
  end

  def shift_mongo(value, days)
    case value
    when Time, DateTime then (value.in_time_zone + days.days).utc
    when Hash, BSON::Document then value.to_h { |key, inner| [ key, shift_mongo(inner, days) ] }
    when Array then value.map { |inner| shift_mongo(inner, days) }
    else value
    end
  end

  # Pai antes de filho, pelas chaves estrangeiras: o Postgres confere cada uma ao fim de cada comando.
  # Autorreferência não pesa (a linha e o pai entram no mesmo comando); ciclo entre tabelas vai na
  # ordem alfabética, e o banco avisa se faltar alguma.
  def ordered_tables
    connection = ActiveRecord::Base.connection
    tables = (connection.tables - SKIP_TABLES).sort
    parents = tables.index_with do |table|
      connection.foreign_keys(table).map(&:to_table).select { |to| tables.include?(to) && to != table }.uniq
    end
    ordered = []
    visiting = {}
    visit = lambda do |table|
      return if ordered.include?(table) || visiting[table]

      visiting[table] = true
      parents[table].each { |parent| visit.call(parent) }
      visiting.delete(table)
      ordered << table
    end
    tables.each { |table| visit.call(table) }
    ordered
  end

  # Reaplicado dias depois, o retrato empurra as datas para a frente, e a linha que vai para o dia de
  # outra linha do próprio retrato bate num índice único com data (`daily_chat_stats`: organização e
  # dia) antes de a outra sair de lá. Da data mais nova para a mais velha, cada uma desocupa o lugar
  # antes de alguém precisar dele: o Postgres confere o índice único linha a linha.
  def latest_first(model, rows)
    dated = model.columns.select { |column| %i[date datetime].include?(column.type) }.map(&:name)
    return rows if dated.empty?

    floor = Time.zone.at(0)
    rows.sort_by { |row| dated.map { |name| row[name]&.to_time || floor } }.reverse
  end

  # As chaves estrangeiras de um ciclo (`flows.published_version_id` → `flow_versions`, que aponta de
  # volta para `flows`): a que aponta para uma tabela que ainda não entrou vai vazia na primeira volta.
  def forward_keys(tables)
    connection = ActiveRecord::Base.connection
    position = tables.each_with_index.to_h
    tables.index_with do |table|
      connection.foreign_keys(table).select { |fk| position.key?(fk.to_table) && position[fk.to_table] > position[table] }.map(&:column)
    end
  end

  def write_json(path, data)
    File.write(path, JSON.pretty_generate(data) + "\n")
  end
end
