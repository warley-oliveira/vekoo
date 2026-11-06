module Products
  class ItemsController < BaseController
    PER_PAGE = 24
    # Allowlist: o valor vem do cliente e entra num ORDER BY.
    SORT_FIELDS = %w[title created_at updated_at external_id].freeze
    SORT_ORDERS = %w[asc desc].freeze
    # Apagar é um a um (imagens, vínculos, contadores): sem teto, uma lista grande
    # esgotaria o tempo da requisição.
    MAX_BULK_IDS = 500

    # `custom` traz as chaves dos campos personalizados, que são dados da organização.
    self.opaque_params += %w[custom]

    before_action :set_item, only: %i[show update destroy]

    # GET /products/items
    # Usa o MESMO SearchService do teste de busca e dos fluxos: filtros iguais, sem
    # ranking. Quem ordena aqui é a coluna escolhida.
    def index
      records, meta = paginate(search_service.listing.order(sort_clause), per_page: PER_PAGE)

      render json: { items: ItemSerializer.many(records.listable), meta: meta }
    end

    # GET /products/search?q=
    # Rankeada: o teste de busca da tela, e o que um fluxo encontraria.
    def search
      result = search_service(limit: params[:limit].presence || SearchService::DEFAULT_LIMIT).call

      render json: {
        items: ItemSerializer.many(result.items),
        meta: { total: result.total, strategy: result.strategy }
      }
    end

    def show
      render json: ItemSerializer.one(@item, full: true)
    end

    def create
      save(current_organization.product_items.new, status: :created)
    end

    def update
      save(@item, status: :ok)
    end

    def destroy
      @item.destroy!
      head :no_content
    end

    # POST /products/items/bulk-destroy
    def bulk_destroy
      ids = Array(params[:ids]).map(&:to_s)
      return render_too_many_ids if ids.size > MAX_BULK_IDS

      deleted = current_organization.product_items.where(id: ids).destroy_all.size
      render json: { deleted: deleted }
    end

    private

    def set_item
      @item = current_organization.product_items.find(params[:id])
    end

    def save(item, status:)
      if SaveItem.new(item, item_params, category_ids: category_ids).call
        render json: ItemSerializer.one(item, full: true), status: status
      else
        render_invalid(item)
      end
    end

    def search_service(**options)
      SearchService.new(current_organization.id, query: params[:q], filters: search_filters, **options)
    end

    # Desempate por id: sem ele o ORDER BY não é determinístico entre valores
    # iguais e a paginação repete ou pula item ao virar de página.
    def sort_clause
      # O nome da coluna é valor, não chave, então CamelParams não o converte: aceita-se
      # `createdAt` e `created_at`.
      requested = params[:sort_by].to_s.underscore
      field = SORT_FIELDS.include?(requested) ? requested : "updated_at"
      order = SORT_ORDERS.include?(params[:sort_order]) ? params[:sort_order] : "desc"
      { field => order.to_sym, id: :desc }
    end

    def search_filters
      {
        tags: params[:tags],
        categories: params[:categories],
        custom: custom_filter,
        include_inactive: ActiveModel::Type::Boolean.new.cast(params[:include_inactive]),
        active: ActiveModel::Type::Boolean.new.cast(params[:active])
      }
    end

    def custom_filter
      custom = params[:custom]
      custom.to_unsafe_h if custom.respond_to?(:to_unsafe_h)
    end

    def item_params
      envelope(:item).permit(
        :title, :summary, :description, :external_id, :url, :active,
        tags: [], custom_fields: {}
      )
    end

    # `nil` deixa os vínculos como estão; só mexe neles quem mandou a chave.
    def category_ids
      item = params[:item]
      Array(item[:category_ids]).map(&:to_s) if item.key?(:category_ids)
    end

    def render_too_many_ids
      render_error(
        status: :unprocessable_entity,
        code: "tooManyIds",
        field: "ids",
        message: t("products.items.too_many_ids", max: MAX_BULK_IDS)
      )
    end
  end
end
