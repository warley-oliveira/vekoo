module Products
  class ImportSerializer < ApplicationSerializer
    def self.one(import, with_errors: false)
      payload = {
        id: import.id,
        status: import.status,
        filename: import.filename,
        delimiter: import.delimiter,
        # As chaves de `mapping` são nomes de coluna da planilha: saem como estão.
        mapping: import.mapping,
        options: import.options.transform_keys { |key| key.camelize(:lower) },
        totalRows: import.total_rows,
        processedRows: import.processed_rows,
        createdCount: import.created_count,
        updatedCount: import.updated_count,
        errorCount: import.error_count,
        percentage: import.progress_percentage,
        createdAt: epoch_ms(import.created_at),
        startedAt: epoch_ms(import.started_at),
        completedAt: epoch_ms(import.completed_at)
      }
      payload[:errorSample] = import.error_sample if with_errors
      payload
    end

    # O que a tela de mapeamento precisa depois do upload.
    def self.preview(import, sample)
      one(import).merge(
        headers: sample.headers,
        sampleRows: sample.rows,
        suggestedMapping: ImportMapper.suggest(sample.headers),
        targets: ImportMapper.targets(import.organization_id)
      )
    end
  end
end
