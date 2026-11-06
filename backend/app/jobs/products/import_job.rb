module Products
  # Importa um CSV/TSV de catálogo, em streaming, com progresso via ActionCable.
  #
  # O idioma das mensagens de erro é o de quem começou a importação: o ActiveJob guarda
  # o locale da requisição junto com o job.
  class ImportJob < ApplicationJob
    queue_as :low

    BATCH_SIZE = 500
    # Quantas linhas entre um broadcast e outro. Progresso a cada 500 linhas é
    # suave o suficiente na UI e não inunda o Redis do ActionCable.
    BROADCAST_EVERY = 500

    def perform(import_id)
      @import = Import.find_by(id: import_id)
      # Só quem vence a disputa processa. O perdedor é uma reentrega ou um clique duplo.
      return unless import&.claim!

      broadcast("progress", progress_payload)

      process_file
      finalize
    rescue StandardError => e
      Rails.logger.error("[Products::ImportJob] #{import_id}: #{e.full_message}")
      fail_import(e)
    end

    private

    attr_reader :import

    def organization_id = import.organization_id

    def mapper
      @mapper ||= ImportMapper.new(organization_id, import.mapping)
    end

    def process_file
      @since_broadcast = 0

      import.file.open do |tempfile|
        source = ImportFile.new(tempfile.path, delimiter: import.delimiter)
        import.update!(total_rows: source.estimated_rows)
        broadcast("progress", progress_payload)

        buffer = []
        source.each_row do |csv_row, line_number|
          row = mapper.call(csv_row)

          if row.valid?
            buffer << [ line_number, row ]
          else
            record_failure(line_number, row.errors.join("; "), csv_row.to_h)
          end

          if buffer.size >= BATCH_SIZE
            flush(buffer)
            buffer = []
          end
        end

        flush(buffer) if buffer.any?
      end
    end

    def flush(buffer)
      # Deduplicação DENTRO do lote: um CSV real repete SKU, e o Postgres recusa
      # "ON CONFLICT DO UPDATE command cannot affect row a second time" se a mesma
      # chave aparecer duas vezes no mesmo INSERT. Vence a última ocorrência.
      deduped = buffer.each_with_object({}) { |(line, row), acc| acc[dedup_key(line, row)] = row }.values

      result = ItemUpserter.new(organization_id, deduped, overwrite_active: mapper.maps_active?).call
      enqueue_follow_ups(result)

      import.bump_counters!(processed: buffer.size, created: result.created, updated: result.updated)
      @since_broadcast += buffer.size
      return if @since_broadcast < BROADCAST_EVERY

      @since_broadcast = 0
      broadcast("progress", progress_payload)
    end

    # A cada lote, e não no fim: o que já foi gravado continua valendo se a importação
    # cair na linha seguinte, e a fila não recebe um argumento com centenas de milhares
    # de ids de uma vez.
    def enqueue_follow_ups(result)
      EmbedItemsJob.enqueue_for(result.created_ids)
      # O texto de índice do upsert sai só das colunas mapeadas. Numa reimportação parcial
      # ele perderia o que a planilha não trouxe, então o item atualizado é refeito do banco.
      ReindexItemsJob.enqueue_for(organization_id, result.updated_ids)
      mirror_images(result.ids) if import.options["mirror_images"]
    end

    def mirror_images(item_ids)
      image_ids = Image.where(product_item_id: item_ids).external.pluck(:id)
      ActiveJob.perform_all_later(image_ids.map { |image_id| MirrorImageJob.new(image_id) })
    end

    # Toda linha SAI daqui com um external_id, sempre. Dois motivos:
    #
    #  1. Sem ele a reimportação duplicaria tudo — NULL nunca conflita com NULL no
    #     índice único, então o ON CONFLICT nunca dispararia.
    #  2. O upserter mapeia o RETURNING de volta para as linhas por external_id,
    #     porque o Postgres não garante a ordem do RETURNING.
    #
    # Ordem de preferência: SKU do arquivo > hash do título (opção `dedupe_by_title`,
    # ligada por padrão na tela) > hash do número da linha, que ao menos faz a
    # reimportação do MESMO arquivo convergir em vez de duplicar.
    def dedup_key(line_number, row)
      external = row.attributes["external_id"].presence
      return external if external

      # A semente NÃO pode incluir o id da importação: senão reimportar geraria
      # chaves novas e duplicaria tudo, que é exatamente o que queremos evitar.
      seed = if import.options["dedupe_by_title"]
        "title:#{IndexTextBuilder.normalize(row.attributes["title"])}"
      else
        "file:#{import.filename}:#{line_number}"
      end

      row.attributes["external_id"] = "auto:#{Digest::SHA1.hexdigest(seed)[0, 24]}"
    end

    def record_failure(line_number, message, raw)
      ImportRow.create!(import: import, line_number: line_number,
        error_message: message.to_s.truncate(300), raw: raw.except(nil))
      import.push_error_sample(line_number: line_number, message: message)
      import.save! if import.changed?
      import.bump_counters!(processed: 1, errors: 1)
    end

    def finalize
      import.reload
      # A estimativa conta linha física. Terminado o arquivo, o total é o que foi lido.
      import.update!(total_rows: import.processed_rows)
      import.mark_completed!

      broadcast("completed", progress_payload)
    end

    # A mensagem do erro não sai para o cliente: pode carregar SQL e caminho interno. Só o
    # defeito do próprio arquivo é dito por extenso, porque é o que a pessoa pode corrigir.
    def fail_import(error)
      return if import.nil? || !Import.exists?(import.id)

      message = if error.is_a?(CSV::MalformedCSVError)
        I18n.t("products.imports.malformed_line", line: error.line_number)
      else
        I18n.t("products.imports.failed")
      end

      import.reload.mark_failed!(message)
      broadcast("error", { importId: import.id, code: "importFailed", message: message })
    end

    def progress_payload
      import.reload
      {
        importId: import.id,
        status: import.status,
        processed: import.processed_rows,
        total: import.total_rows,
        created: import.created_count,
        updated: import.updated_count,
        errors: import.error_count,
        percentage: import.progress_percentage
      }
    end

    def broadcast(action, data)
      ProductImportChannel.broadcast_event(organization_id, action, data)
    end
  end
end
