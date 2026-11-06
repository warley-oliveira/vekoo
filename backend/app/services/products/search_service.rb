module Products
  # Busca do catálogo. Implementação única, consumida pelo controller HTTP (tela +
  # teste de busca) e por quem automatiza (bloco de fluxo; ver
  # docs/migration/api/products.md). Duas buscas divergindo seria a pior forma de
  # suporte: "na tela acha, no fluxo não".
  #
  # Encadeamento, do mais preciso ao que sempre funciona:
  #
  #   SKU exato -> híbrida (RRF: vetor + tsvector) -> lexical (só tsvector) -> texto (ILIKE)
  #
  #  - vetorial (pgvector, cosseno) — entende "algo para dor de cabeça";
  #  - lexical (tsvector) — acerta código, modelo e nome exato, plural inclusive;
  #  - texto (ILIKE) — pega pedaço de palavra, que o tsvector não casa.
  #
  # Sem chave da OpenAI, ou com ela fora do ar, o vetor simplesmente não entra: nada
  # aqui levanta erro por causa disso, e `strategy` diz o que foi usado.
  #
  # Os filtros são aplicados DENTRO de cada arm, nunca depois da fusão. Filtrar
  # depois é um bug de correção: cada arm pega top-K global, e uma consulta com
  # filtro de categoria pode devolver zero resultados mesmo havendo dezenas de itens
  # que casam, só porque nenhum deles entrou no top-K global.
  class SearchService
    DEFAULT_LIMIT = 10
    MAX_LIMIT = 20
    # Quantos candidatos cada arm produz antes da fusão.
    CANDIDATES = 60
    # Constante padrão do RRF.
    RRF_K = 60
    # Número puro. O `~` protege o cast: sem ele, um "azul" no campo derrubaria a busca.
    NUMERIC_TEXT = "^-?[0-9]+(\\.[0-9]+)?$"
    # CASE e não dois WHEREs: o SQL não garante que a regex rode antes do cast.
    NUMERIC_FIELD = "CASE WHEN product_items.custom_fields ->> ? ~ ? " \
                    "THEN (product_items.custom_fields ->> ?)::numeric END"

    Result = Struct.new(:items, :total, :strategy, keyword_init: true)

    def initialize(organization_id, query: nil, filters: {}, limit: DEFAULT_LIMIT)
      @organization_id = organization_id
      @query = query.to_s.strip
      @filters = (filters || {}).to_h.symbolize_keys
      @limit = limit.to_i.clamp(1, MAX_LIMIT)
    end

    def call
      # Falha fechada: sem organização, nada de "todos os catálogos".
      return Result.new(items: [], total: 0, strategy: "none") if organization_id.blank?

      # Busca por SKU tem caminho próprio, antes da fusão. Sem pg_trgm não há
      # tolerância a erro de digitação, e enfiar um identificador exato num
      # esquema baseado em ranking só faria enterrar o resultado certo.
      exact = exact_match
      return Result.new(items: [ exact ], total: 1, strategy: "exact") if exact

      return browse if query.blank?

      hybrid
    end

    # A relation paginável da grade: mesmos filtros, mais o texto digitado, sem ranking
    # (quem ordena ali é a coluna escolhida). Quem chama aplica `order` e `paginate`.
    def listing
      return Item.none if organization_id.blank?

      query.blank? ? scoped : scoped.matching_query(query)
    end

    private

    attr_reader :organization_id, :query, :filters, :limit

    def exact_match
      return nil if query.blank?

      scoped.listable.find_by(external_id: query)
    end

    # Sem termo de busca é navegação, não busca: aplica só os filtros.
    def browse
      relation = scoped.listable.order(created_at: :desc, id: :desc)
      Result.new(items: relation.limit(limit).to_a, total: scoped.count, strategy: "browse")
    end

    def hybrid
      vector = Embedder.for_query(query)
      ids = Item.with_connection { |connection| connection.select_values(fusion_sql(vector)) }
      return text_match if ids.empty?

      # `listable` para não arrastar o tsvector nem os textos de índice.
      by_id = scoped.listable.where(id: ids).index_by(&:id)
      Result.new(items: ids.filter_map { |id| by_id[id] }, total: ids.size, strategy: vector ? "hybrid" : "lexical")
    end

    # O último degrau. Chega aqui quem digitou pedaço de palavra ("camis"), que o
    # tsvector não casa, ou quem tem vetor ligado mas nenhum item embedado ainda.
    def text_match
      relation = scoped.matching_text(query)
      Result.new(
        items: relation.listable.ordered_by_text_match(query).limit(limit).to_a,
        total: relation.count,
        strategy: "text"
      )
    end

    # Relation com TODOS os filtros. Reusada tanto pelo caminho de navegação quanto
    # como sub-select `filtered` da fusão — assim é impossível os dois divergirem.
    def scoped
      @scoped ||= begin
        relation = apply_status(Item.for_organization(organization_id))
        relation = apply_tags(relation)
        relation = apply_categories(relation)
        apply_custom_fields(relation)
      end
    end

    # `active` escolhe a situação; sem ele, vale o padrão de só mostrar os ativos, a menos
    # que `include_inactive` peça todos. É o filtro "Situação" da grade de gestão.
    def apply_status(relation)
      return relation.where(active: filters[:active]) unless filters[:active].nil?

      filters[:include_inactive] ? relation : relation.where(active: true)
    end

    def apply_tags(relation)
      tags = Array(filters[:tags]).map(&:to_s).reject(&:blank?)
      return relation if tags.empty?

      # `&&` = overlap (qualquer uma das tags), servido pelo índice GIN.
      relation.where("product_items.tags && ARRAY[?]::varchar[]", tags)
    end

    # Aceita paths de categoria e inclui a subárvore inteira: filtrar por 'moda'
    # traz 'moda/camisetas'.
    def apply_categories(relation)
      paths = Array(filters[:categories]).map(&:to_s).reject(&:blank?)
      return relation if paths.empty?

      category_ids = paths
        .map { |path| Category.for_organization(organization_id).under(path) }
        .reduce(:or)
        .pluck(:id)
      return relation.none if category_ids.empty?

      relation.where(
        "EXISTS (SELECT 1 FROM product_item_categories links WHERE links.product_item_id = product_items.id " \
        "AND links.product_category_id IN (?))", category_ids
      )
    end

    # Igualdade via containment (@>), que usa o índice GIN jsonb_path_ops.
    # Faixas numéricas saem por comparação explícita, sem índice — aceitável porque
    # já vêm depois do filtro de organização.
    def apply_custom_fields(relation)
      custom = filters[:custom]
      return relation unless custom.is_a?(Hash) && custom.present?

      ranges, equalities = custom.partition { |_key, value| numeric_range?(value) }
      ranges.each { |key, bounds| relation = apply_numeric_range(relation, key, bounds.to_h.symbolize_keys) }
      return relation if equalities.empty?

      relation.where("product_items.custom_fields @> ?::jsonb", typed_equalities(equalities).to_json)
    end

    def numeric_range?(value)
      value.is_a?(Hash) && value.to_h.symbolize_keys.keys.intersect?(%i[min max])
    end

    # A query string só traz texto, e o jsonb guarda número e booleano com tipo:
    # `@> {"garantia":"true"}` nunca casaria com `true`. O campo sabe converter.
    def typed_equalities(equalities)
      definitions = FieldDefinition.for_organization(organization_id).where(key: equalities.map { |key, _| key.to_s }).index_by(&:key)

      equalities.to_h do |key, value|
        casted = definitions[key.to_s]&.cast(value)
        [ key.to_s, casted.nil? ? value : casted ]
      end
    end

    # A regex e a chave do campo (que vem do cliente) entram como valores: os `?` que elas
    # têm por dentro não se confundem com os da instrução, que é fixa.
    def apply_numeric_range(relation, key, bounds)
      binds = [ key.to_s, NUMERIC_TEXT, key.to_s ]

      relation = relation.where("#{NUMERIC_FIELD} >= ?", *binds, bounds[:min].to_f) if bounds[:min].present?
      relation = relation.where("#{NUMERIC_FIELD} <= ?", *binds, bounds[:max].to_f) if bounds[:max].present?
      relation
    end

    def quote(value)
      Item.with_connection { |connection| connection.quote(value) }
    end

    # Uma única ida ao banco: filtros no CTE `filtered`, cada arm faz JOIN nele.
    def fusion_sql(vector)
      arms = { "fts" => lexical_arm }
      arms["vec"] = vector_arm(vector) if vector
      scores = arms.keys.map { |name| "SELECT id, 1.0 / (#{RRF_K} + rnk) AS score FROM #{name}" }

      <<~SQL.squish
        WITH filtered AS (#{scoped.select(:id).to_sql}),
        #{arms.values.join(", ")}
        SELECT id
        FROM (#{scores.join(" UNION ALL ")}) scored
        GROUP BY id
        ORDER BY SUM(score) DESC, id
        LIMIT #{limit}
      SQL
    end

    # Casa AMPLO, ranqueia ESTRITO.
    #
    # `websearch_to_tsquery` liga os termos com AND, então "cadeira confortavel"
    # não casa nada se nenhum item tiver as duas palavras — que é o caso mais
    # comum quando o cliente escreve uma frase inteira. Trocando `&` por `|` no
    # tsquery já parseado, o WHERE passa a aceitar qualquer termo, e o
    # `ts_rank_cd` do tsquery ESTRITO como primeiro critério mantém no topo os
    # itens que casam TODOS os termos. Recall sem perder precisão.
    #
    # Exceção: quando o usuário usa exclusão (`-termo`), o tsquery tem `!` e
    # virar OR daria "a OU não-b", que casa quase tudo. Nesse caso ficamos no
    # estrito, que é o que a sintaxe de exclusão pede de qualquer forma.
    #
    # O desempate por `i.id` deixa o ROW_NUMBER determinístico — sem ele a
    # paginação repete ou pula item entre páginas.
    def lexical_arm
      normalized_query = quote(IndexTextBuilder.normalize(query))

      <<~SQL.squish
        fts AS (
          SELECT i.id,
                 ROW_NUMBER() OVER (
                   ORDER BY ts_rank_cd(i.search_document, q.strict) DESC,
                            ts_rank_cd(i.search_document, q.loose) DESC,
                            i.id
                 ) AS rnk
          FROM product_items i
          JOIN filtered f ON f.id = i.id
          CROSS JOIN LATERAL (
            SELECT strict_q AS strict,
                   CASE WHEN strict_q::text LIKE '%!%'
                        THEN strict_q
                        ELSE replace(strict_q::text, '&', '|')::tsquery
                   END AS loose
            FROM (SELECT websearch_to_tsquery('portuguese', #{normalized_query}) AS strict_q) raw
          ) q
          WHERE i.search_document @@ q.loose
          ORDER BY ts_rank_cd(i.search_document, q.strict) DESC,
                   ts_rank_cd(i.search_document, q.loose) DESC,
                   i.id
          LIMIT #{CANDIDATES}
        )
      SQL
    end

    def vector_arm(vector)
      literal = quote(Embedder.to_sql_literal(vector))

      <<~SQL.squish
        vec AS (
          SELECT e.product_item_id AS id,
                 ROW_NUMBER() OVER (ORDER BY e.embedding <=> #{literal}::vector, e.product_item_id) AS rnk
          FROM product_embeddings e
          JOIN filtered f ON f.id = e.product_item_id
          WHERE e.organization_id = #{quote(organization_id)}
          ORDER BY e.embedding <=> #{literal}::vector, e.product_item_id
          LIMIT #{CANDIDATES}
        )
      SQL
    end
  end
end
