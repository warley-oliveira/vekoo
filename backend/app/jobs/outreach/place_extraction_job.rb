module Outreach
  # Roda uma busca de estabelecimentos. Origem: ApifyExtractionJob.
  #
  # A chamada ao Apify segura a thread por até 5 minutos, e as 5 threads do Sidekiq são as mesmas do
  # caminho das mensagens. Por isso só duas buscas rodam ao mesmo tempo, e o resto espera na fila.
  class PlaceExtractionJob < ApplicationJob
    queue_as :campaigns

    MAX_CONCURRENT = 2
    WAIT_FOR_SLOT = 30.seconds
    # Quem começou há mais tempo que o limite do Apify já morreu: não conta como vaga ocupada.
    RUNNING_WINDOW = (ApifyPlacesSearchService::JOB_TIMEOUT + 60).seconds

    # Falhas viram `failed` na extração: quem decide tentar de novo é a pessoa.
    sidekiq_options retry: false

    def perform(extraction_id, organization_id)
      extraction = PlaceExtraction.scoped(organization_id, extraction_id)
      return if extraction.nil? || extraction.completed? || extraction.failed?
      return retry_when_free(extraction) if full?

      extract(extraction)
    end

    private

    def full?
      PlaceExtraction.where(status: "running", :started_at.gt => RUNNING_WINDOW.ago).count >= MAX_CONCURRENT
    end

    def retry_when_free(extraction)
      # Sem isto, ficar esperando vaga parece abandono para a varredura de extrações paradas.
      extraction.touch
      self.class.set(wait: WAIT_FOR_SLOT).perform_later(extraction.id.to_s, extraction.organization_id)
    end

    def extract(extraction)
      extraction.mark_running!
      PlaceExtractionChannel.broadcast_status(extraction)

      results = ApifyPlacesSearchService.new(
        search_query: extraction.search_query,
        location: extraction.location,
        max_places: extraction.max_places,
        language: extraction.language,
        filters: extraction.filters
      ).call

      extraction.mark_completed!(results)
      PlaceExtractionChannel.broadcast_completed(extraction)
    rescue ApifyPlacesSearchService::ApifyError => e
      fail_extraction(extraction, e.code, e.code == e.message ? nil : e.message)
    rescue Timeout::Error
      fail_extraction(extraction, "apifyTimeout")
    rescue StandardError => e
      Rails.logger.error("[Outreach::PlaceExtractionJob] #{extraction.id}: #{e.full_message}")
      fail_extraction(extraction, "apifyFailed")
    end

    def fail_extraction(extraction, code, message = nil)
      extraction.mark_failed!(code, message)
      PlaceExtractionChannel.broadcast_status(extraction)
    end
  end
end
