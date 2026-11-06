module Pipelines
  # As etiquetas são da organização, e não do quadro.
  class LabelsController < BaseController
    before_action :set_label, only: %i[update destroy]

    # ?search=
    def index
      labels = current_organization.pipeline_labels.ordered
      labels = labels.by_name(params[:search].to_s) if params[:search].present?

      render json: { labels: LabelSerializer.many(labels), meta: { total: labels.size } }
    end

    # Acha ou cria: etiqueta com o mesmo nome, sem ligar para a caixa, devolve a que já existe com 200.
    def create
      attributes = label_params
      existing = current_organization.pipeline_labels.find_by("LOWER(name) = ?", attributes[:name].to_s.squish.downcase)
      return render json: LabelSerializer.one(existing) if existing

      label = current_organization.pipeline_labels.build(attributes)

      if label.save
        render json: LabelSerializer.one(label), status: :created
      else
        render_invalid(label)
      end
    end

    def update
      if @label.update(label_params)
        render json: LabelSerializer.one(@label)
      else
        render_invalid(@label)
      end
    end

    def destroy
      @label.destroy!
      head :no_content
    end

    private

    def set_label
      @label = current_organization.pipeline_labels.find(params[:id])
    end

    def label_params
      envelope(:label).permit(:name, :color)
    end
  end
end
