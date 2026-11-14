# GET /layouts(?format=carousel) — os contratos da biblioteca de layouts, no
# idioma da requisição. Iguais para todo mundo: o layout é método da Vekoo,
# não dado da marca.
class LayoutsController < AuthenticatedController
  def index
    contracts = Layouts::Registry.all.values
    contracts = contracts.select { |contract| contract.supports?(params[:format]) } if params[:format].present?
    render json: {
      formats: PieceDocument::FORMATS,
      layouts: contracts.map { |contract| contract.as_json(locale: I18n.locale) }
    }
  end
end
