module FlowRuntime
  module Nodes
    # Busca no catálogo, com a mesma busca da tela (`Products::SearchService`), e guarda o que achou em uma variável. Sem
    # `query`, usa a mensagem do contato. Saídas `found` e `not_found`, e sem conexão segue a padrão.
    #
    # A imagem vem pronta para enviar: `{{vars.produtos.0.image}}` em `send_media`.
    class CatalogSearch < Base
      DEFAULT_SAVE_TO = "catalog_results".freeze
      DEFAULT_LIMIT = 5
      MAX_LIMIT = 20

      def call
        query = interpolate(data["query"].to_s).presence || answer_text.presence
        result = Products::SearchService.new(organization.id, query: query, filters: filters, limit: limit).call
        items = result.items.map { |item| serialize(item) }
        save_to = data["save_to"].presence || DEFAULT_SAVE_TO

        continue(next_node_id(handle: items.any? ? "found" : "not_found") || default_next_node_id,
                 variables: { save_to => items, "#{save_to}_total" => result.total },
                 log: { input: { query: query, filters: filters }, output: { total: result.total, strategy: result.strategy, titles: items.pluck("title") } })
      end

      private

      def limit
        requested = data["limit"].to_i
        requested.positive? ? [ requested, MAX_LIMIT ].min : DEFAULT_LIMIT
      end

      def filters
        given = data["filters"].to_h
        { tags: Array(given["tags"]), categories: Array(given["categories"]), custom: given["custom"].to_h }.compact_blank
      end

      def serialize(item)
        images = item.images.map(&:delivery_url).compact

        {
          "id" => item.id.to_s,
          "sku" => item.external_id,
          "title" => item.title,
          "url" => item.try(:url),
          "tags" => item.try(:tags),
          "image" => images.first,
          "images" => images,
          "fields" => item.custom_fields
        }.compact
      end
    end
  end
end
