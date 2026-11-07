# Buscas de estabelecimentos no Google Maps, pelo Apify. Origem: ApifyExtractionsController.
class PlaceExtractionsController < PlatformController
  # Cada busca custa créditos do Apify: uma organização não enfileira sem limite.
  MAX_IN_PROGRESS = 5

  require_permission :campaigns

  before_action :set_extraction, only: %i[show results destroy]

  def index
    scope = current_organization.place_extractions.without_results.recent
    statuses = params[:status].to_s.split(",").map(&:strip).compact_blank
    scope = scope.where(:status.in => statuses) if statuses.any?
    scope = scope.where(search_query: /#{Regexp.escape(params[:search].to_s)}/i) if params[:search].present?

    records, meta = paginate(scope)
    render json: { extractions: Outreach::PlaceExtractionSerializer.many(records), meta: meta }
  end

  def show
    render json: { extraction: Outreach::PlaceExtractionSerializer.one(@extraction) }
  end

  # Todos os estabelecimentos já encontrados, em uma lista só.
  def contacts
    size = (params[:per_page].presence || Paginated::DEFAULT_PER_PAGE).to_i.clamp(1, Paginated::MAX_PER_PAGE)
    number = [ params[:page].to_i, 1 ].max
    page = Outreach::PlaceContacts.new(current_organization.id, search: params[:search]).page(offset: (number - 1) * size, limit: size)

    render json: {
      contacts: page.rows.map { |place, extraction| Outreach::PlaceResultSerializer.contact(place, extraction) },
      meta: { page: number, perPage: size, total: page.total, totalPages: (page.total.to_f / size).ceil, hasMore: number * size < page.total }
    }
  end

  def results
    render json: {
      id: @extraction.id.to_s,
      status: @extraction.status,
      results: Outreach::PlaceResultSerializer.many(@extraction.results),
      resultsCount: @extraction.results_count
    }
  end

  def create
    return render_error(status: :unprocessable_content, code: "apifyNotConfigured") unless Outreach::Capabilities.apify?
    return render_error(status: :unprocessable_content, code: "tooManyExtractions") if too_many_in_progress?

    extraction = current_organization.place_extractions.new(extraction_attributes)
    return render_invalid(extraction) unless extraction.save

    Outreach::PlaceExtractionJob.perform_later(extraction.id.to_s, extraction.organization_id)
    render json: { extraction: Outreach::PlaceExtractionSerializer.one(extraction) }, status: :created
  end

  def destroy
    @extraction.destroy
    head :no_content
  end

  private

  def set_extraction
    @extraction = Outreach::PlaceExtraction.scoped(current_organization.id, params[:id])
    render_not_found unless @extraction
  end

  def too_many_in_progress?
    current_organization.place_extractions.pending_or_running.count >= MAX_IN_PROGRESS
  end

  def extraction_attributes
    {
      created_by_account_id: current_account.id,
      search_query: params[:search_query].to_s.strip,
      location: params[:location].to_s.strip.presence,
      max_places: (params[:max_places].presence || Outreach::ApifyPlacesSearchService::DEFAULT_MAX_PLACES).to_i.clamp(1, Outreach::ApifyPlacesSearchService::MAX_PLACES),
      language: params[:language].presence || "pt-BR",
      filters: extract_filters
    }
  end

  def extract_filters
    filters = {}
    filters[:reviews_sort] = params[:reviews_sort].to_s if params[:reviews_sort].present?
    filters[:min_score] = params[:min_score].to_f if params[:min_score].present?
    filters[:category_filter] = params[:category_filter].to_s if params[:category_filter].present?
    unless params[:skip_closed_places].nil?
      filters[:skip_closed_places] = ActiveModel::Type::Boolean.new.cast(params[:skip_closed_places])
    end
    filters
  end
end
