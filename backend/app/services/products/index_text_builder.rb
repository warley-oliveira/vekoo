module Products
  # Monta os textos indexáveis de um item. Ponto único de verdade, usado tanto pelo
  # `before_save` do Products::Item quanto pelo importador (que escreve com
  # INSERT ... ON CONFLICT e não dispara callback nenhum).
  #
  # Duas saídas, com propósitos diferentes:
  #
  #  - `primary` / `secondary` alimentam a coluna gerada `search_document`
  #    (full-text). São NORMALIZADOS: transliterados e em minúsculas, para que a
  #    busca ignore acento — a query passa pela mesma `normalize`.
  #  - `embedding_text` alimenta o vetor. NÃO é normalizado: acento e capitalização
  #    carregam significado para o modelo de embedding.
  class IndexTextBuilder
    # A descrição pode ser enorme; além disso o embedding tem limite de tokens.
    DESCRIPTION_LIMIT = 4_000

    # Mesma normalização aplicada ao texto indexado e à query do usuário — é o que
    # torna a busca insensível a acento sem depender da extensão `unaccent`.
    def self.normalize(text)
      I18n.transliterate(text.to_s).downcase.squish
    end

    def initialize(item, field_definitions: nil, categories: nil)
      @item = item
      @field_definitions = field_definitions
      @categories = categories
    end

    # Peso A: o que identifica o item.
    def primary
      normalize([ item.title, item.external_id, Array(item.tags).join(" ") ].compact_blank.join(" "))
    end

    # Peso B: o que descreve o item.
    def secondary
      normalize([
        item.summary,
        # Path vira texto separado por espaço: 'moda/camisetas' indexado inteiro
        # seria um único token e não casaria com a busca por "camisetas".
        category_paths.join(" ").tr("/", " "),
        searchable_custom_values.join(" "),
        item.description.to_s.truncate(DESCRIPTION_LIMIT)
      ].compact_blank.join(" "))
    end

    def embedding_text
      [
        item.title,
        item.summary,
        category_names.join(" > "),
        Array(item.tags).join(", "),
        searchable_custom_values.join(" "),
        item.description.to_s.truncate(DESCRIPTION_LIMIT)
      ].compact_blank.join("\n")
    end

    private

    attr_reader :item

    def normalize(text)
      self.class.normalize(text)
    end

    # Aceita categorias injetadas (o importador já as tem em mão) para evitar N+1.
    # Formato: array de [path, name].
    #
    # Ordenado porque o banco não promete ordem nenhuma aqui: o mesmo item daria textos
    # diferentes de uma leitura para outra, e o `source_hash` mudaria com eles, pagando a
    # OpenAI de novo por um item que não mudou.
    def categories
      @sorted_categories ||= (@categories || (item.persisted? ? item.categories.pluck(:path, :name) : [])).sort
    end

    def category_paths
      categories.map(&:first)
    end

    def category_names
      categories.map(&:last)
    end

    def field_definitions
      @field_definitions ||= FieldDefinition
        .for_organization(item.organization_id)
        .searchable_only
        .pluck(:key)
    end

    def searchable_custom_values
      fields = item.custom_fields || {}
      return [] if fields.empty?

      field_definitions.sort.filter_map { |key| fields[key].presence }.map(&:to_s)
    end
  end
end
