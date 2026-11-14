# /admin/reference-cards — a curadoria do banco de referências.
#
#   GET   /               lista (filtro, busca, ordem, página)
#   POST  /               cadastra: imagens (multipart) ou a URL direta de uma
#                         imagem, mais o que a curadoria já sabe; a análise
#                         entra na fila
#   GET   /:id            o card inteiro, com os achados
#   PATCH /:id            edição da revisão; conteúdo novo refaz o vetor
#   POST  /:id/publish    aprova (vai para o agente)
#   POST  /:id/reject     arquiva, com motivo
#   POST  /:id/reopen     arquivado volta para revisão
#   POST  /:id/retry      análise que falhou roda de novo
#   GET   /:id/thumbnail  a miniatura, servida daqui — nunca por URL pública
module Admin
  class ReferenceCardsController < BaseController
    before_action :set_card, except: %i[index create]
    before_action :require_editable, only: :update

    SORTS = {
      "updatedAt" => :updated_at, "createdAt" => :created_at, "relativeEngagement" => :relative_engagement,
      "replicability" => :replicability, "version" => :version
    }.freeze
    PER_PAGE = 25
    MAX_PER_PAGE = 100

    # Campo da tela → coluna. `analysis` chega inteira (a revisão edita tudo).
    EDITABLE = {
      "niche" => :niche, "size" => :size, "archetypes" => :archetypes, "objective" => :objective,
      "format" => :format, "suggestedLayoutId" => :suggested_layout_id, "analysis" => :analysis
    }.freeze
    # O que entra no texto do vetor: mudou, o vetor é refeito.
    EMBEDDED = %w[niche archetypes objective format analysis].freeze

    def index
      scope = filtered(ReferenceCard.with_attached_thumbnail.select(ReferenceCard.column_names - [ "embedding" ]))
      total = scope.count(:all)
      page = [ params[:page].to_i, 1 ].max
      per = params[:per].to_i.positive? ? [ params[:per].to_i, MAX_PER_PAGE ].min : PER_PAGE
      column = ReferenceCard.arel_table[SORTS.fetch(params[:sort].to_s, :updated_at)]
      order = params[:dir] == "asc" ? column.asc.nulls_last : column.desc.nulls_last
      cards = scope.reorder(order, id: :desc).offset((page - 1) * per).limit(per)

      render json: {
        referenceCards: ReferenceCardSerializer.list(cards),
        meta: { total: total, page: page, per: per, counts: ReferenceCard.group(:status).count }
      }
    end

    def show
      render json: ReferenceCardSerializer.one(@card)
    end

    def create
      images = incoming_images
      return if performed?

      images.each { |image| References::Images.inspect!(image[:data]) }
      card = ReferenceCard.new(
        curated_by: current_account,
        niche: params[:niche].presence,
        size: params[:size].presence,
        source: { "url" => params[:url], "channel" => params[:channel], "bannedTerms" => Array(params[:bannedTerms]) },
        analysis: { "metrics" => { "baselineMedian" => params[:baselineMedian], "collectedAt" => params[:collectedAt] } }
      )
      images.each do |image|
        card.originals.attach(io: StringIO.new(image[:data]), filename: image[:filename], content_type: image[:content_type])
      end
      card.thumbnail.attach(
        io: StringIO.new(References::Images.thumbnail(images.first[:data])), filename: "miniatura.jpg", content_type: "image/jpeg"
      )
      card.save!
      AnalyzeReferenceJob.perform_later(card.id)

      render json: ReferenceCardSerializer.one(card), status: :created
    rescue References::FetchImage::Refused => e
      render_error(status: :unprocessable_entity, code: e.code, field: "url")
    rescue References::Images::Invalid => e
      render_error(status: :unprocessable_entity, code: e.message == "tooLarge" ? "imageTooLarge" : "imageInvalid", field: "images")
    end

    def update
      raw = params.require(:referenceCard).to_unsafe_h
      attributes = EDITABLE.filter_map { |key, attribute| [ attribute, raw[key] ] if raw.key?(key) }.to_h
      if raw["source"].is_a?(Hash)
        attributes[:source] = @card.source.merge(raw["source"].slice("url", "channel", "bannedTerms"))
      end
      @card.update!(attributes)
      EmbedReferenceJob.perform_later(@card.id) if (@card.saved_changes.keys & EMBEDDED).any?

      render json: ReferenceCardSerializer.one(@card)
    end

    def publish
      @card.update!(status: "published")
      render json: ReferenceCardSerializer.one(@card)
    end

    def reject
      @card.update!(status: "archived", archived_reason: params[:reason].to_s.squish.presence)
      render json: ReferenceCardSerializer.one(@card)
    end

    def reopen
      @card.update!(status: "in_review", archived_reason: nil)
      render json: ReferenceCardSerializer.one(@card)
    end

    # Com os originais no lugar, a análise roda de novo; o card do Instagram
    # (sem originais: a URL do Meta expira) busca a mídia de novo antes.
    def retry_analysis
      unless @card.analysis_failed? && (@card.originals.attached? || @card.instagram?)
        return render_error(status: :unprocessable_entity, code: "analysisNotRetryable")
      end

      @card.update!(analysis_status: "pending", analysis_error: nil)
      (@card.originals.attached? ? AnalyzeReferenceJob : FetchInstagramReferenceJob).perform_later(@card.id)
      render json: ReferenceCardSerializer.one(@card)
    end

    def thumbnail
      return render_not_found unless @card.thumbnail.attached?

      response.headers["Cache-Control"] = "private, max-age=300"
      send_data @card.thumbnail.download, type: "image/jpeg", disposition: "inline"
    end

    private

    def set_card
      @card = ReferenceCard.find(params[:id])
    end

    # Enquanto a análise roda, ela vai sobrescrever o que a revisão gravasse;
    # arquivado é só leitura até reabrir.
    def require_editable
      return render_error(status: :conflict, code: "analysisRunning") if @card.analyzing?

      render_error(status: :unprocessable_entity, code: "cardArchived") if @card.archived?
    end

    # As imagens enviadas; sem nenhuma, a da URL (se for o link direto de uma
    # imagem — página de post não serve).
    def incoming_images
      files = Array(params[:images]).select { |file| file.respond_to?(:read) }
      if files.length > References::Images::MAX_FILES
        return render_error(status: :unprocessable_entity, code: "tooManyImages", field: "images")
      end

      images = files.map { |file|
        { data: file.read, filename: file.original_filename.presence || "imagem", content_type: file.content_type }
      }
      return images if images.any?
      return render_error(status: :unprocessable_entity, code: "imagesRequired", field: "images") if params[:url].blank?

      fetched = References::FetchImage.call(params[:url])
      [ { data: fetched.data, filename: fetched.filename, content_type: fetched.content_type } ]
    end

    def filtered(scope)
      statuses = params[:status].to_s.split(",") & ReferenceCard::STATUSES
      scope = scope.where(status: statuses) if statuses.any?
      { niche: Taxonomy::NICHES, format: Taxonomy::FORMATS, objective: Taxonomy::OBJECTIVES, origin: Taxonomy::ORIGINS }
        .each { |key, allowed| scope = scope.where(key => params[key]) if allowed.include?(params[key]) }
      scope = scope.where(analysis_status: params[:analysis]) if ReferenceCard::ANALYSIS_STATUSES.include?(params[:analysis])
      if params[:q].present?
        term = "%#{ActiveRecord::Base.sanitize_sql_like(params[:q].to_s.squish.first(80))}%"
        scope = scope.where("reference_cards.analysis::text ILIKE :term OR reference_cards.source->>'channel' ILIKE :term", term: term)
      end
      scope
    end
  end
end
