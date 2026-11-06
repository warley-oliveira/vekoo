module MiniRacerEngine::Workers
  # `catalog.*`: o catálogo de produtos para quem automatiza. SOMENTE LEITURA.
  #
  # Mesmo formato de retorno de `DynamicTable` ({ data:, ok: } / { error:, ok: false }), e a
  # mesma busca da tela (`Products::SearchService`).
  class Catalog < MiniRacerEngine::EngineModule
    MAX_LIMIT     = 20
    DEFAULT_LIMIT = 5

    UUID = /\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/i

    def register(worker, context, event)
      @worker = worker

      # `register` roda a CADA execução: aqui só pode haver `attach`, nenhuma query. Pré-carregar
      # categorias ou campos pesaria em todo script, inclusive nos que nunca tocam o catálogo.
      context.attach("catalog.Search", proc { |*params| attach_method(method(:search), params, event) })
      context.attach("catalog.Get", proc { |*params| attach_method(method(:get_item), params, event) })
      context.attach("catalog.Categories", proc { |*params| attach_method(method(:categories), params, event) })
      context.attach("catalog.Facets", proc { |*params| attach_method(method(:facets), params, event) })
      context.attach("catalog.Similar", proc { |*params| attach_method(method(:similar), params, event) })
    end

    private

    # FALHA FECHADA de propósito: um contexto sem organização não pode ler "todos os
    # catálogos da plataforma".
    def require_organization
      return nil if organization_id.present?

      { error: "No organization in context", ok: false }
    end

    # catalog.Search(query, { categories, tags, custom, limit, includeInactive })
    def search(params)
      guard = require_organization
      return guard if guard

      query, options = params
      options = (options.is_a?(Hash) ? options : {}).with_indifferent_access

      result = ::Products::SearchService.new(
        organization_id,
        query: query,
        filters: {
          categories: options[:categories],
          tags: options[:tags],
          custom: options[:custom],
          include_inactive: options[:includeInactive] || options[:include_inactive]
        },
        limit: clamp_limit(options[:limit])
      ).call

      { data: serialize_many(result.items), total: result.total, strategy: result.strategy, ok: true }
    end

    # catalog.Get(idOrSku)
    def get_item(params)
      guard = require_organization
      return guard if guard

      reference = params.first
      return { error: "Missing item reference", ok: false } if reference.blank?

      item = find_item(reference.to_s)
      return { error: "Item not found", ok: false } unless item

      { data: serialize(item, full: true), ok: true }
    end

    # catalog.Categories()
    def categories(_params)
      guard = require_organization
      return guard if guard

      data = ::Products::Category.for_organization(organization_id)
                                 .order(:path)
                                 .pluck(:path, :name, :items_count)
                                 .map { |path, name, count| { path: path, name: name, items: count } }
      { data: data, ok: true }
    end

    # catalog.Facets(field) — 'tags' ou a key de um campo personalizado.
    # Serve para afunilar a conversa ("temos em preto, branco e azul").
    def facets(params)
      guard = require_organization
      return guard if guard

      field = params.first.to_s
      return { error: "Missing field", ok: false } if field.blank?

      { data: ::Products::FacetsService.new(organization_id, field).call, ok: true }
    end

    # catalog.Similar(idOrSku, limit) — vizinhos por embedding.
    def similar(params)
      guard = require_organization
      return guard if guard

      reference, limit = params
      return { error: "Missing item reference", ok: false } if reference.blank?

      item = find_item(reference.to_s)
      return { error: "Item not found", ok: false } unless item

      items = ::Products::SimilarService.new(organization_id, item.id, limit: clamp_limit(limit)).call
      { data: serialize_many(items), ok: true }
    end

    def find_item(reference)
      scope = ::Products::Item.for_organization(organization_id).listable

      scope.find_by(external_id: reference) || (scope.find_by(id: reference) if reference.match?(UUID))
    end

    def clamp_limit(value)
      (value || DEFAULT_LIMIT).to_i.clamp(1, MAX_LIMIT)
    end

    def serialize_many(items)
      records = items.to_a
      ActiveRecord::Associations::Preloader.new(
        records: records, associations: { images: { file_attachment: :blob } }
      ).call

      records.map { |item| serialize(item) }
    end

    # `image` é a URL absoluta da foto: é o que a entrega manda ao WhatsApp como mídia, com a
    # extensão no nome. Na origem era o marcador `attachment_id_<id>` que a assistente
    # conhecia. A chave automática da importação (`auto:...`) não é SKU de verdade.
    def serialize(item, full: false)
      images = item.images.to_a
      payload = {
        id: item.id,
        sku: visible_sku(item),
        title: item.title,
        summary: item.summary,
        url: item.url,
        tags: item.tags,
        image: images.first&.delivery_url,
        images: images.map(&:delivery_url),
        fields: item.custom_fields
      }
      payload[:description] = item.description if full
      payload[:categories] = item.categories.pluck(:path) if full
      payload
    end

    def visible_sku(item)
      item.external_id unless item.external_id.to_s.start_with?(::Products::Item::AUTO_KEY_PREFIX)
    end
  end
end
