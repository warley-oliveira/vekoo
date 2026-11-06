module Products
  # Os valores de um campo no catálogo, com a contagem: `tags` ou a chave de um campo
  # personalizado. Serve para quem automatiza afunilar a conversa ("temos em preto, branco e
  # azul"). Só itens ativos, dos mais frequentes para os menos.
  class FacetsService
    MAX_VALUES = 50

    def initialize(organization_id, field)
      @organization_id = organization_id
      @field = field.to_s
    end

    def call
      return [] if @organization_id.blank? || @field.blank?

      @field == "tags" ? tag_values : custom_field_values
    end

    private

    def items
      Item.for_organization(@organization_id).active_only
    end

    def tag_values
      rows(items.from("product_items, unnest(product_items.tags) AS tag").group("tag"), "tag")
    end

    # A chave vem do script e entra como valor, nunca no texto da instrução. O `<> ''` também
    # descarta quem não tem o campo: o `->>` dá NULL.
    def custom_field_values
      value = Item.sanitize_sql_array([ "custom_fields ->> ?", @field ])

      rows(items.where("#{value} <> ''").group(Arel.sql(value)), value)
    end

    def rows(relation, value)
      relation
        .order(Arel.sql("COUNT(*) DESC, #{value}"))
        .limit(MAX_VALUES)
        .pluck(Arel.sql(value), Arel.sql("COUNT(*)"))
        .map { |name, count| { value: name, count: count.to_i } }
    end
  end
end
