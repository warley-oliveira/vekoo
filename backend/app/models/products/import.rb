module Products
  # Uma execução de importação de catálogo. O arquivo cru fica anexado aqui: o parse
  # acontece no back-end, em streaming, e não no navegador.
  class Import < ApplicationRecord
    # 'ready' (e não 'mapping'): o modelo tem uma COLUNA `mapping`, e o
    # `define_method("mapping?")` do laço abaixo colidiria com o método de atributo
    # que o ActiveRecord gera para ela.
    STATUSES = %w[pending ready processing completed failed].freeze
    # Teto do acumulador jsonb. O histórico completo de falhas vai em
    # product_import_rows — uma linha por erro, não um array que cresce sem fim.
    MAX_ERROR_SAMPLES = 50
    MAX_FILE_BYTES = 50.megabytes
    # Sem avanço por este tempo, a importação morreu com o processo. Cada lote toca
    # `updated_at`, então uma importação viva nunca chega perto disto.
    STALE_AFTER = 30.minutes
    # Quem fecha a tela de mapeamento sem importar deixa para trás um arquivo de até 50 MB.
    ABANDONED_AFTER = 7.days

    has_one_attached :file

    belongs_to :organization
    belongs_to :account, optional: true

    has_many :rows, class_name: "Products::ImportRow", dependent: :delete_all,
      foreign_key: :product_import_id, inverse_of: :import

    validates :status, inclusion: { in: STATUSES }

    scope :for_organization, ->(organization_id) { where(organization_id: organization_id) }
    scope :recent, -> { order(created_at: :desc, id: :desc) }
    scope :stale, -> { where(status: "processing").where(updated_at: ...STALE_AFTER.ago) }
    scope :abandoned, -> { where(status: "ready").where(updated_at: ...ABANDONED_AFTER.ago) }

    STATUSES.each do |state|
      define_method("#{state}?") { status == state }
    end

    # Só uma execução ganha: dois cliques em "Importar" ou uma reentrega da fila
    # enfileiram dois jobs, e o segundo reprocessaria tudo somando nos contadores.
    def claim!
      claimed = self.class.where(id: id, status: "ready")
        .update_all(status: "processing", started_at: Time.current, updated_at: Time.current)
      reload
      claimed == 1
    end

    def mark_completed!
      update!(status: "completed", completed_at: Time.current)
    end

    def mark_failed!(message = nil)
      push_error_sample(line_number: nil, message: message) if message.present?
      update!(status: "failed", completed_at: Time.current)
    end

    def progress_percentage
      return 0 if total_rows.to_i.zero?

      # `total_rows` é estimado por linha física até o fim do arquivo (célula com
      # quebra de linha conta a mais; linha em branco também). Nunca passa de 100.
      [ ((processed_rows.to_f / total_rows) * 100).round(1), 100.0 ].min
    end

    # Contadores são incrementados no banco, sem read-modify-write no Ruby: leitura e
    # gravação em Ruby serializam escrita concorrente na mesma linha.
    def bump_counters!(processed: 0, created: 0, updated: 0, errors: 0)
      sql = "processed_rows = processed_rows + ?, created_count = created_count + ?, " \
            "updated_count = updated_count + ?, error_count = error_count + ?, updated_at = NOW()"
      self.class.where(id: id).update_all([ sql, processed, created, updated, errors ])
    end

    def push_error_sample(line_number:, message:)
      return if error_sample.size >= MAX_ERROR_SAMPLES

      self.error_sample = error_sample + [ { "line" => line_number, "message" => message.to_s.truncate(300) } ]
    end
  end
end
