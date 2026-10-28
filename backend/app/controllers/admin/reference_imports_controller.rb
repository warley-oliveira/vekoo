# /admin/reference-imports — a importação de referências pela Business
# Discovery do Instagram.
#
#   GET  /                        os lotes recentes
#   POST /                        um lote: os @ (até 20), nicho e porte sugeridos
#   GET  /:id                     as contas e os candidatos, do melhor para o pior
#   POST /:id/analyze             os candidatos escolhidos viram card e vão à análise
#   POST /:id/accounts/:account_id/retry
module Admin
  class ReferenceImportsController < BaseController
    before_action :set_import, except: %i[index create]

    def index
      imports = ReferenceImport.recent_first.includes(accounts: :candidates).limit(20)
      render json: { referenceImports: ReferenceImportSerializer.list(imports), instagram: InstagramGraph::TokenStatus.call }
    end

    def show
      render json: ReferenceImportSerializer.one(@import)
    end

    def create
      import = References::Imports.create!(
        text: params[:handles], niche: params[:niche], size: params[:size], curated_by: current_account
      )
      render json: ReferenceImportSerializer.one(import), status: :created
    rescue References::Imports::Invalid => e
      render_invalid_import(e)
    rescue ActiveRecord::RecordInvalid => e
      render_invalid(e.record)
    end

    def analyze
      cards = References::Imports.analyze!(@import, candidate_ids: params[:candidateIds], curated_by: current_account)
      render json: { created: cards.map(&:id), referenceImport: ReferenceImportSerializer.one(@import.reload) }
    rescue References::Imports::Invalid => e
      render_invalid_import(e)
    end

    def retry_account
      account = @import.accounts.find(params[:account_id])
      return render_error(status: :unprocessable_entity, code: "importNotRetryable") unless account.retryable?

      account.update!(status: "pending", error_code: nil, retry_at: nil)
      ImportReferenceAccountJob.perform_later(account.id)
      render json: ReferenceImportSerializer.one(@import.reload)
    end

    private

    def set_import
      @import = ReferenceImport.find(params[:id])
    end

    def render_invalid_import(error)
      details = error.details.is_a?(Hash) ? error.details : { handles: error.details }.compact
      render_error(status: :unprocessable_entity, code: error.code, field: "handles",
        message: t("errors.#{error.code.underscore}", **details.symbolize_keys.slice(:max), default: t("errors.unprocessable")),
        details: details.presence)
    end
  end
end
