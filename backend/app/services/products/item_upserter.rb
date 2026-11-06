module Products
  # Grava um lote de linhas importadas com um único INSERT ... ON CONFLICT.
  #
  # SQL cru em vez de `upsert_all` por dois motivos concretos:
  #
  #  1. O DO UPDATE precisa tocar SOMENTE as colunas mapeadas — uma importação
  #     parcial não pode zerar a descrição — e precisa fazer merge raso no
  #     `custom_fields` jsonb. `upsert_all` não aceita expressão custom no DO UPDATE.
  #  2. `search_document` é coluna GERADA: incluí-la na lista de colunas faria o
  #     Postgres recusar o INSERT.
  class ItemUpserter
    Result = Struct.new(:created_ids, :updated_ids, keyword_init: true) do
      def ids = created_ids + updated_ids
      def created = created_ids.size
      def updated = updated_ids.size
    end

    # Colunas que podem ser escritas pela importação, na ordem do INSERT.
    COLUMNS = %w[
      organization_id title summary description external_id url active
      custom_fields tags index_text_primary index_text_secondary
    ].freeze

    def initialize(organization_id, rows, overwrite_active: true)
      @organization_id = organization_id
      # Ordem fixa por SKU: duas importações simultâneas com os mesmos itens travam as
      # linhas na mesma sequência, em vez de esperarem uma pela outra num deadlock.
      @rows = rows.sort_by { |row| row.attributes["external_id"].to_s }
      @overwrite_active = overwrite_active
    end

    def call
      return Result.new(created_ids: [], updated_ids: []) if rows.empty?

      categories_by_name = resolve_categories
      definitions = FieldDefinition.for_organization(organization_id).searchable_only.pluck(:key)

      values = rows.map { |row| value_tuple(row, categories_by_name, definitions) }
      records = Item.with_connection { |connection| connection.select_rows(upsert_sql(values)) }

      # Mapeamento por `external_id`, NUNCA por posição: o Postgres não garante que
      # a ordem do RETURNING acompanhe a ordem do VALUES. Por isso toda linha que
      # chega aqui tem external_id (ver Products::ImportJob#dedup_key).
      id_by_external = records.to_h { |record| [ record[1], record[0] ] }
      attach_associations(id_by_external, categories_by_name)

      created, updated = records.partition { |record| ActiveModel::Type::Boolean.new.cast(record[2]) }
      Result.new(created_ids: created.map(&:first), updated_ids: updated.map(&:first))
    end

    private

    attr_reader :organization_id, :rows

    # Cria as categorias que ainda não existem, uma vez por lote (não por linha).
    def resolve_categories
      names = rows.flat_map(&:categories).uniq
      return {} if names.empty?

      existing = Category.for_organization(organization_id).where(name: names).index_by(&:name)
      (names - existing.keys).each { |name| existing[name] = find_or_create_category(name) }
      existing.compact
    end

    # "camisetas" na planilha e "Camisetas" no banco têm o mesmo caminho: o `create!`
    # recusa, e a categoria certa se acha pelo caminho, não pelo nome.
    def find_or_create_category(name)
      Category.create!(organization_id: organization_id, name: name)
    rescue ActiveRecord::RecordInvalid, ActiveRecord::RecordNotUnique
      Category.for_organization(organization_id).find_by(path: name.parameterize)
    end

    def value_tuple(row, categories_by_name, definitions)
      attributes = row.attributes
      item = Item.new(attributes.merge("tags" => row.tags))
      builder = IndexTextBuilder.new(
        item,
        field_definitions: definitions,
        categories: row.categories.filter_map { |name| categories_by_name[name] }.map { |category| [ category.path, category.name ] }
      )

      sanitize([
        organization_id, attributes["title"], attributes["summary"], attributes["description"],
        attributes["external_id"], attributes["url"], attributes.fetch("active", true),
        (attributes["custom_fields"] || {}).to_json, pg_array(row.tags),
        builder.primary, builder.secondary
      ])
    end

    def sanitize(values)
      placeholders = "(?::uuid, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::varchar[], ?, ?, NOW(), NOW())"
      ActiveRecord::Base.sanitize_sql_array([ placeholders, *values ])
    end

    def pg_array(values)
      "{#{Array(values).map { |value| %("#{value.to_s.gsub('\\', '\\\\\\\\').gsub('"', '\\"')}") }.join(",")}}"
    end

    # `xmax = 0` é o truque canônico do Postgres para distinguir INSERT de UPDATE
    # num ON CONFLICT: em linha recém-inserida o xmax é zero.
    def upsert_sql(values)
      <<~SQL.squish
        INSERT INTO product_items (#{COLUMNS.join(", ")}, created_at, updated_at)
        VALUES #{values.join(", ")}
        ON CONFLICT (organization_id, external_id) DO UPDATE SET
          title                = COALESCE(EXCLUDED.title, product_items.title),
          summary              = COALESCE(EXCLUDED.summary, product_items.summary),
          description          = COALESCE(EXCLUDED.description, product_items.description),
          url                  = COALESCE(EXCLUDED.url, product_items.url),
          #{"active               = EXCLUDED.active," if @overwrite_active}
          custom_fields        = product_items.custom_fields || EXCLUDED.custom_fields,
          tags                 = CASE WHEN cardinality(EXCLUDED.tags) > 0
                                      THEN EXCLUDED.tags ELSE product_items.tags END,
          index_text_primary   = EXCLUDED.index_text_primary,
          index_text_secondary = EXCLUDED.index_text_secondary,
          updated_at           = NOW()
        RETURNING id, external_id, (xmax = 0) AS inserted
      SQL
    end

    def attach_associations(id_by_external, categories_by_name)
      category_pairs = []
      image_pairs = []

      rows.each do |row|
        item_id = id_by_external[row.attributes["external_id"]]
        next unless item_id

        row.categories.filter_map { |name| categories_by_name[name]&.id }.each do |category_id|
          category_pairs << { product_item_id: item_id, product_category_id: category_id }
        end

        row.images.each_with_index do |url, position|
          image_pairs << { product_item_id: item_id, source_url: url, position: position }
        end
      end

      upsert_categories(category_pairs)
      insert_images(image_pairs)
    end

    def upsert_categories(pairs)
      return if pairs.empty?

      now = Time.current
      ItemCategory.upsert_all(
        pairs.uniq.map { |pair| pair.merge(created_at: now, updated_at: now) },
        unique_by: :index_product_item_categories_uniqueness
      )
      # `upsert_all` não passa pelo `counter_cache`: sem isto a tela de categorias mostraria
      # zero, e apagar um item importado levaria `items_count` a negativo.
      Category.refresh_items_count!(pairs.map { |pair| pair[:product_category_id] }.uniq)
    end

    # Só a URL — o download para o nosso storage é opcional e assíncrono
    # (Products::MirrorImageJob), para não pendurar a importação numa rede alheia.
    def insert_images(pairs)
      return if pairs.empty?

      item_ids = pairs.map { |pair| pair[:product_item_id] }.uniq
      existing = Image.where(product_item_id: item_ids).pluck(:product_item_id, :source_url).to_set
      fresh = pairs.uniq.reject { |pair| existing.include?([ pair[:product_item_id], pair[:source_url] ]) }
      return if fresh.empty?

      now = Time.current
      Image.insert_all(fresh.map { |pair| pair.merge(created_at: now, updated_at: now) })
    end
  end
end
