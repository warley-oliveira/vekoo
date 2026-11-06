module Products
  class CategoriesController < BaseController
    before_action :set_category, only: %i[update destroy]

    # A árvore inteira, plana e em ordem: o `depth` dá o recuo, sem paginação.
    def index
      categories = Category.in_tree_order(current_organization.product_categories)

      render json: { categories: CategorySerializer.many(categories), meta: { total: categories.size } }
    end

    def create
      category = current_organization.product_categories.new(category_params)

      if category.save
        render json: CategorySerializer.one(category), status: :created
      else
        render_invalid(category)
      end
    end

    def update
      if @category.update(category_params)
        render json: CategorySerializer.one(@category)
      else
        render_invalid(@category)
      end
    end

    # Remover uma categoria remove a subárvore (dependent: :destroy) e os vínculos
    # com os itens — os itens em si continuam existindo.
    def destroy
      @category.destroy!
      head :no_content
    end

    private

    def set_category
      @category = current_organization.product_categories.find(params[:id])
    end

    def category_params
      params.require(:category).permit(:name, :parent_id, :position)
    end
  end
end
