module Pipelines
  class TemplatesController < BaseController
    def index
      BoardTemplate.ensure_defaults!
      templates = BoardTemplate.ordered

      render json: { templates: BoardTemplateSerializer.many(templates), meta: { total: templates.size } }
    end
  end
end
