# Quem entra na campanha: da base de contatos, de CSV (e o que veio do Sheets ou do Apify, depois de
# a tela mapear) e as fontes que devolvem linhas para mapear.
class CampaignImportsController < PlatformController
  MAX_CONTACTS_PER_IMPORT = 50_000

  require_permission :campaigns

  # As duas seguram uma thread do Puma enquanto o outro lado responde, e a do Apify custa créditos.
  rate_limit to: 10, within: 1.minute, only: %i[google_sheet apify_places_search],
    by: -> { current_organization.id },
    with: -> { render_too_many_requests }

  before_action :set_importable_campaign, only: %i[contacts csv_contacts]

  rescue_from Outreach::RefusedError do |error|
    render_error(status: :unprocessable_content, code: error.code, field: error.field, details: error.details)
  end

  # POST /campaigns/:id/import-contacts
  def contacts
    audience = chat_audience
    return if performed?

    result = Outreach::RecipientImporter.new(@campaign).import(audience.rows)
    render_import(result)
  rescue Outreach::ChatAudience::TooMany
    render_too_many
  end

  # POST /campaigns/:id/import-csv-contacts
  def csv_contacts
    rows = Array(params[:contacts])
    return render_error(status: :unprocessable_content, code: "contactsRequired", field: "contacts") if rows.empty?
    return render_too_many if rows.size > MAX_CONTACTS_PER_IMPORT

    result = Outreach::RecipientImporter.new(@campaign).import(rows.filter_map { |row| csv_row(row) })
    render_import(result)
  end

  # POST /campaigns/import-google-sheet
  def google_sheet
    result = Outreach::GoogleSheetImport.new(
      file_id: params[:file_id],
      sheet_gid: params[:sheet_gid],
      access_token: params[:access_token]
    ).call

    render json: { headers: result.headers, data: result.rows, rowCount: result.rows.size }
  rescue Timeout::Error
    render_error(status: :gateway_timeout, code: "googleSheetTimeout")
  end

  # POST /campaigns/apify-places-search
  #
  # Síncrona, sem nada guardado: a tela de campanhas usa `/place-extractions`.
  def apify_places_search
    query = params[:search_query].to_s.strip
    return render_error(status: :unprocessable_content, code: "searchQueryRequired", field: "searchQuery") if query.blank?

    results = Outreach::ApifyPlacesSearchService.new(
      search_query: query,
      location: params[:location],
      max_places: params[:max_places].presence || Outreach::ApifyPlacesSearchService::DEFAULT_MAX_PLACES,
      language: params[:language].presence || "pt-BR",
      filters: params.permit(:reviews_sort, :min_score, :category_filter, :skip_closed_places).to_h,
      timeout: Outreach::ApifyPlacesSearchService::REQUEST_TIMEOUT
    ).call

    render json: { results: Outreach::PlaceResultSerializer.many(results), totalCount: results.size }
  rescue Outreach::ApifyPlacesSearchService::ApifyAuthError => e
    render_error(status: :unprocessable_content, code: e.code)
  rescue Outreach::ApifyPlacesSearchService::ApifyQuotaError => e
    render_error(status: :payment_required, code: e.code)
  rescue Outreach::ApifyPlacesSearchService::ApifyError => e
    render_error(status: :bad_gateway, code: e.code, message: e.code == e.message ? nil : e.message)
  rescue Timeout::Error
    render_error(status: :gateway_timeout, code: "apifyTimeout")
  end

  private

  # Depois de lançada, a lista fica fechada. Agendada ainda aceita: o assistente cria a campanha
  # primeiro e importa depois.
  def set_importable_campaign
    @campaign = Outreach::Campaign.scoped(current_organization.id, params[:id])
    return render_not_found unless @campaign
    return if @campaign.draft? || @campaign.scheduled?

    render_error(status: :unprocessable_content, code: "campaignNotImportable")
  end

  def chat_audience
    if ActiveModel::Type::Boolean.new.cast(params[:select_all])
      return Outreach::ChatAudience.by_filters(current_organization, filters_param)
    end

    ids = Array(params[:contact_ids]).map(&:to_s).uniq
    return render_error(status: :unprocessable_content, code: "contactsRequired", field: "contactIds") if ids.empty?
    return render_too_many if ids.size > MAX_CONTACTS_PER_IMPORT

    Outreach::ChatAudience.by_ids(current_organization, ids)
  end

  def filters_param
    filters = params[:filters]
    return {} if filters.blank?

    filters.respond_to?(:to_unsafe_h) ? filters.to_unsafe_h : filters.to_h
  end

  def csv_row(row)
    return nil unless row.is_a?(ActionController::Parameters) || row.is_a?(Hash)

    metadata = row[:contact_metadata]
    metadata = metadata.to_unsafe_h if metadata.respond_to?(:to_unsafe_h)

    {
      phone: row[:external_id],
      name: row[:user_name],
      custom_variables: metadata.is_a?(Hash) ? metadata.compact : nil
    }
  end

  def render_import(result)
    render json: {
      importedCount: result.imported,
      skippedCount: result.skipped,
      invalidCount: result.invalid,
      totalRecipients: @campaign.reload.total_recipients
    }
  end

  def render_too_many
    render_error(
      status: :unprocessable_content,
      code: "tooManyContacts",
      details: { max: MAX_CONTACTS_PER_IMPORT }
    )
  end
end
