module Products
  # Item do catálogo da organização. Um catálogo por organização — o escopo é sempre
  # `organization_id`.
  #
  # O embedding NÃO mora aqui: ver Products::Embedding para o porquê.
  class Item < ApplicationRecord
    TITLE_MAX_LENGTH = 300
    SUMMARY_MAX_LENGTH = 1500
    MAX_TAGS = 50
    # Teto explícito no jsonb: acumulador sem teto tem custo de reescrita quadrático
    # e vai para TOAST.
    MAX_CUSTOM_FIELDS_BYTES = 16.kilobytes
    # Uma frase de busca não precisa de mais que isto, e cada termo vira dois ILIKE.
    MAX_TEXT_TERMS = 8
    # Chave que a importação dá à linha sem SKU, para reimportar não duplicar.
    AUTO_KEY_PREFIX = "auto:"

    # Colunas de indexação: grandes, nunca exibidas, e o tsvector é gerado.
    # Toda listagem deve usar `listable` para não arrastá-las para o Ruby.
    INDEX_COLUMNS = %w[search_document index_text_primary index_text_secondary].freeze

    belongs_to :organization

    has_one :embedding_record, class_name: "Products::Embedding",
      foreign_key: :product_item_id, dependent: :destroy, inverse_of: :item
    has_many :images, -> { ordered }, class_name: "Products::Image",
      foreign_key: :product_item_id, dependent: :destroy, inverse_of: :item
    has_many :item_categories, class_name: "Products::ItemCategory",
      foreign_key: :product_item_id, dependent: :destroy, inverse_of: :item
    has_many :categories, through: :item_categories, source: :category

    validates :title, presence: true, length: { maximum: TITLE_MAX_LENGTH }
    validates :summary, length: { maximum: SUMMARY_MAX_LENGTH }, allow_blank: true
    validates :external_id, uniqueness: { scope: :organization_id }, allow_blank: true
    validate :url_is_web
    validate :tags_within_limit
    validate :custom_fields_castable
    validate :custom_fields_within_limit

    before_validation :normalize_tags
    before_validation :nullify_blank_external_id
    before_validation :cast_custom_fields, if: :custom_fields_changed?
    # O importador NÃO passa por aqui (escreve com INSERT ... ON CONFLICT); ele chama
    # Products::IndexTextBuilder diretamente. Os dois caminhos usam o mesmo builder.
    before_save :rebuild_index_text

    scope :active_only, -> { where(active: true) }
    scope :for_organization, ->(organization_id) { where(organization_id: organization_id) }
    scope :listable, -> { select(column_names - INDEX_COLUMNS) }
    scope :by_tag, ->(tag) { tag.present? ? where("product_items.tags @> ARRAY[?]::varchar[]", tag) : all }

    # Casa por pedaço de palavra, ignorando acento e caixa: compara o texto
    # normalizado do índice com a query normalizada do mesmo jeito. Todo termo precisa
    # aparecer em algum lugar do item. É o que resolve "camis" enquanto a pessoa ainda
    # digita, e o único caminho que sobra sem tsquery nem vetor.
    def self.matching_text(query)
      terms = text_terms(query)
      return all if terms.empty?

      conditions = terms.map { "(product_items.index_text_primary ILIKE ? OR product_items.index_text_secondary ILIKE ?)" }
      where(conditions.join(" AND "), *terms.flat_map { |term| [ like_pattern(term) ] * 2 })
    end

    # O filtro da grade, que pagina e ordena por coluna: não há ranking aqui, mas
    # plural e frase inteira ("cadeiras pretas") têm de casar tanto quanto um pedaço
    # de palavra ("cadei"). Por isso soma o tsvector ao ILIKE.
    def self.matching_query(query)
      terms = text_terms(query)
      return all if terms.empty?

      full_text = sanitize_sql_array([
        "product_items.search_document @@ websearch_to_tsquery('portuguese', ?)",
        terms.join(" ")
      ])
      where(full_text).or(matching_text(query))
    end

    # Quem casa pelo título, SKU ou tag vem antes de quem casa só na descrição.
    def self.ordered_by_text_match(query)
      first_term = text_terms(query).first
      return all if first_term.nil?

      primary_first = sanitize_sql_array([
        "(product_items.index_text_primary ILIKE ?) DESC", like_pattern(first_term)
      ])
      order(Arel.sql(primary_first), :title, :id)
    end

    def self.text_terms(query)
      IndexTextBuilder.normalize(query).split.first(MAX_TEXT_TERMS)
    end
    private_class_method :text_terms

    def self.like_pattern(term)
      "%#{sanitize_sql_like(term)}%"
    end
    private_class_method :like_pattern

    def primary_image
      images.first
    end

    def custom_field(key)
      custom_fields[key.to_s]
    end

    # Texto que alimenta o embedding. Diferente do índice lexical, aqui NÃO
    # transliteramos: acento carrega significado para o modelo de embedding.
    def embedding_source_text(field_definitions: nil)
      IndexTextBuilder.new(self, field_definitions: field_definitions).embedding_text
    end

    # Só os ids da própria organização passam: um id de fora é ignorado, nunca vira
    # vínculo. Sem SQL de lote aqui: o `counter_cache` de `items_count` depende dos
    # callbacks de ItemCategory.
    def sync_categories(ids)
      valid = Category.for_organization(organization_id).where(id: Array(ids)).pluck(:id)
      item_categories.where.not(product_category_id: valid).destroy_all
      (valid - item_categories.pluck(:product_category_id)).each do |category_id|
        item_categories.create!(product_category_id: category_id)
      end
    end

    # Reescreve o índice lexical a partir do estado atual do banco. Serve a quem muda
    # o que o texto reúne sem salvar o item: vínculo de categoria, categoria renomeada,
    # campo que deixou de ser pesquisável, reimportação parcial.
    def refresh_index_text!(field_definitions: nil)
      builder = IndexTextBuilder.new(self, field_definitions: field_definitions)
      primary = builder.primary
      secondary = builder.secondary
      return if primary == index_text_primary && secondary == index_text_secondary

      update_columns(index_text_primary: primary, index_text_secondary: secondary)
    end

    private

    def normalize_tags
      self.tags = Array(tags).map { |tag| tag.to_s.strip }.reject(&:blank?).uniq
    end

    def url_is_web
      return if url.blank? || Products.web_url?(url)

      errors.add(:url, :invalid)
    end

    def tags_within_limit
      return if tags.size <= MAX_TAGS

      errors.add(:tags, :too_many, count: MAX_TAGS)
    end

    def custom_fields_within_limit
      return if custom_fields.to_json.bytesize <= MAX_CUSTOM_FIELDS_BYTES

      errors.add(:custom_fields, :too_large)
    end

    def custom_fields_castable
      return if @uncastable_custom_fields.blank?

      errors.add(:custom_fields, :uncastable, fields: @uncastable_custom_fields.join(", "))
    end

    # String vazia colidiria no índice único; NULL não (o Postgres trata NULLs como
    # distintos), que é o comportamento desejado para itens sem SKU.
    #
    # A chave automática sobrevive: a tela a mostra como "sem código" e devolve vazio ao
    # salvar, e perdê-la faria a próxima reimportação duplicar o item.
    def nullify_blank_external_id
      return if external_id.present?

      self.external_id = external_id_in_database&.start_with?(AUTO_KEY_PREFIX) ? external_id_in_database : nil
    end

    def rebuild_index_text
      builder = IndexTextBuilder.new(self)
      self.index_text_primary = builder.primary
      self.index_text_secondary = builder.secondary
    end

    # O formulário manda tudo como texto ("10,50"), e a importação já chega com o valor
    # convertido. Sem passar pela mesma conversão, o filtro por faixa e o de igualdade
    # enxergariam dois tipos para o mesmo campo. Valor vazio some em vez de virar chave
    # inútil no jsonb; chave sem definição (campo apagado) fica como está.
    def cast_custom_fields
      @uncastable_custom_fields = []
      return unless custom_fields.is_a?(Hash)

      definitions = FieldDefinition.for_organization(organization_id).where(key: custom_fields.keys).index_by(&:key)
      self.custom_fields = custom_fields.each_with_object({}) do |(key, raw), result|
        definition = definitions[key]
        next result[key] = raw unless definition

        casted = definition.cast(raw)
        if casted.nil?
          @uncastable_custom_fields << definition.name if raw.to_s.strip.present?
        else
          result[key] = casted
        end
      end
    end
  end
end
