# As pastas da organização. Apagar a pasta não apaga o que está dentro: os
# carrosséis voltam para "sem pasta".
class FoldersController < AuthenticatedController
  before_action :set_folder, only: %i[update destroy]

  def index
    folders = current_organization.folders.ordered
    folders = folders.in_brand(params[:brand_id]) if params[:brand_id].present?
    counts = current_organization.carousels.active.group(:folder_id).count

    render json: {
      folders: folders.map { |folder|
        FolderSerializer.one(folder).merge(carouselCount: counts.fetch(folder.id, 0))
      }
    }
  end

  def create
    # Sem o corpo `folder`, o 400 de parâmetro faltando vem antes da marca.
    attributes = folder_params
    brand = current_organization.brand_cores.find_by(id: params.dig(:folder, :brandId).presence)
    unless brand
      return render_error(
        status: :unprocessable_entity, code: "brandRequired", field: "brandId",
        message: t("errors.brand_required"), details: { "brandId" => [ t("errors.brand_required") ] }
      )
    end

    folder = current_organization.folders.new(attributes)
    folder.brand_core = brand

    if folder.save
      render json: FolderSerializer.one(folder), status: :created
    else
      render_invalid(folder)
    end
  end

  def update
    if @folder.update(folder_params)
      render json: FolderSerializer.one(@folder)
    else
      render_invalid(@folder)
    end
  end

  def destroy
    @folder.destroy!
    head :no_content
  end

  private

  def set_folder
    @folder = current_organization.folders.find(params[:id])
  end

  def folder_params
    params.require(:folder).permit(:name, :color)
  end
end
