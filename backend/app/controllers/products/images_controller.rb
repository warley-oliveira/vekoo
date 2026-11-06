module Products
  class ImagesController < BaseController
    before_action :set_item, only: :create
    before_action :set_image, only: %i[update destroy]

    # POST /products/items/:item_id/images
    # Multipart: o formato e o tamanho quem confere é o modelo, pelo conteúdo do arquivo.
    # JSON com `{ image: { sourceUrl } }`: a foto que já está na internet.
    def create
      return create_from_url if params[:file].blank? && params[:image].present?

      file = params.require(:file)
      return render_missing_file unless file.respond_to?(:tempfile)

      image = @item.images.new(position: next_position)
      image.file.attach(
        io: file.tempfile,
        filename: Image.filename_for(@item.id, file.content_type),
        content_type: file.content_type
      )

      if image.save
        render json: ImageSerializer.one(image), status: :created
      else
        render_invalid(image)
      end
    end

    def update
      if @image.update(image_params)
        render json: ImageSerializer.one(@image)
      else
        render_invalid(@image)
      end
    end

    def destroy
      @image.destroy!
      head :no_content
    end

    private

    # A mesma regra da importação: guarda o endereço na hora e copia para o nosso storage em
    # segundo plano. A cópia pode falhar à vontade (link quebrado, formato estranho): a
    # imagem só continua externa. É o job que passa pelas travas de `RemoteImage` (SSRF).
    def create_from_url
      image = @item.images.new(envelope(:image).permit(:source_url, :alt).merge(position: next_position))

      if image.save
        MirrorImageJob.perform_later(image.id)
        render json: ImageSerializer.one(image), status: :created
      else
        render_invalid(image)
      end
    end

    def next_position
      @item.images.maximum(:position).to_i + 1
    end

    def set_item
      @item = current_organization.product_items.find(params[:item_id])
    end

    # A imagem não tem organização própria: o escopo vem do item.
    def set_image
      @image = Image.joins(:item).where(product_items: { organization_id: current_organization.id }).find(params[:id])
    end

    def image_params
      envelope(:image).permit(:position, :alt)
    end

    # Um `file` em texto, num corpo JSON por exemplo: é o mesmo que não ter mandado.
    def render_missing_file
      render_parameter_missing(ActionController::ParameterMissing.new(:file))
    end
  end
end
